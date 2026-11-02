import { randomBytes } from "node:crypto";
import { z } from "zod";
import { env } from "../config/env.js";
import { db } from "../lib/db.js";
import { AppError, conflict, notFound, unauthorized } from "../lib/errors.js";
import { logger } from "../lib/logger.js";
import { initializeTransaction, verifyTransaction, type PaystackTransaction } from "../lib/paystack.js";

const log = logger.child({ module: "payments" });

type Json = string | number | boolean | null | Json[] | { [key: string]: Json };
const DAY_MS = 24 * 60 * 60 * 1000;

const checkoutSchema = z.object({ moduleId: z.string().min(1).max(64) });

const newReference = () => `GRV-${Date.now().toString(36).toUpperCase()}-${randomBytes(3).toString("hex").toUpperCase()}`;

/** Starts a Paystack checkout for one module and returns the URL to send the student to. */
async function checkout(userId: string, body: unknown) {
  const { moduleId } = checkoutSchema.parse(body);

  const [user, module] = await Promise.all([
    db.orm.public.User.where({ id: userId }).select("id", "email").first(),
    db.orm.public.Module.where({ id: moduleId })
      .select("id", "title", "price", "accessDays", "isPublished")
      .include("course", (course) => course.select("id", "slug", "title", "isPublished", "enrollmentOpen"))
      .first(),
  ]);
  if (!user) throw unauthorized("Account no longer exists");
  if (!module || !module.isPublished || !module.course?.isPublished) throw notFound("Module not found");
  if (!module.course.enrollmentOpen) {
    throw new AppError(409, "ENROLLMENT_CLOSED", "Enrolment for this course hasn't opened yet.");
  }
  if (!module.price || module.price <= 0 || !module.accessDays) {
    throw new AppError(409, "NOT_FOR_SALE", "This module isn't on sale yet.");
  }

  const existing = await db.orm.public.Purchase.where({ userId, moduleId }).select("expiresAt").first();
  if (existing && existing.expiresAt > new Date()) {
    throw conflict("You already have access to this module.");
  }

  const reference = newReference();
  const order = await db.orm.public.Order.select("id").create({
    userId,
    moduleId,
    reference,
    amount: module.price,
    currency: "GHS",
  });

  try {
    const session = await initializeTransaction({
      email: user.email,
      amount: module.price,
      reference,
      callbackUrl: `${env.APP_URL}/checkout/callback`,
      metadata: { orderId: order.id, moduleId, userId, module: module.title, course: module.course.title },
    });
    log.info({ event: "payment.checkout_started", userId, moduleId, orderId: order.id, reference }, "checkout started");
    return { authorizationUrl: session.authorization_url, reference };
  } catch (err) {
    await db.orm.public.Order.where({ id: order.id }).update({ status: "FAILED" });
    throw err;
  }
}

/** Saves what Paystack reported for this payment attempt (one transaction row per reference). */
async function recordTransaction(orderId: string, tx: PaystackTransaction) {
  const fields = {
    paystackId: String(tx.id),
    amount: tx.amount,
    currency: tx.currency,
    status: tx.status,
    gatewayResponse: tx.gateway_response,
    channel: tx.channel,
    authorizationCode: tx.authorization?.authorization_code ?? null,
    // Paystack's response is plain JSON, so it round-trips into the jsonb column as-is.
    rawResponse: JSON.parse(JSON.stringify(tx)) as Json,
    paidAt: tx.paid_at ? new Date(tx.paid_at) : null,
  };
  const existing = await db.orm.public.PaymentTransaction.where({ reference: tx.reference }).select("id").first();
  if (existing) await db.orm.public.PaymentTransaction.where({ id: existing.id }).update(fields);
  else await db.orm.public.PaymentTransaction.create({ orderId, reference: tx.reference, ...fields });
}

/**
 * Asks Paystack for the payment's real status and, on success, grants the module.
 * Safe to call many times and from both the redirect and the webhook: only the call that
 * moves the order out of PENDING grants access.
 */
async function fulfil(reference: string, source: "callback" | "webhook") {
  const order = await db.orm.public.Order.where({ reference })
    .select("id", "userId", "moduleId", "amount", "currency", "status")
    .first();
  if (!order) throw notFound("Payment not found");
  if (order.status === "SUCCESS") return { status: "SUCCESS" as const, moduleId: order.moduleId };

  const tx = await verifyTransaction(reference);
  await recordTransaction(order.id, tx);

  if (tx.status === "success") {
    if (tx.amount !== order.amount || tx.currency !== order.currency) {
      log.error({ event: "payment.amount_mismatch", reference, expected: order.amount, got: tx.amount, currency: tx.currency }, "payment amount mismatch");
      await db.orm.public.Order.where({ id: order.id, status: "PENDING" }).update({ status: "FAILED" });
      throw new AppError(409, "PAYMENT_MISMATCH", "The payment amount didn't match the order. Please contact support.");
    }

    const granted = await db.transaction(async (t) => {
      const paidAt = tx.paid_at ? new Date(tx.paid_at) : new Date();
      // Only one caller can win this update; the loser sees null and grants nothing.
      // FAILED is claimable too: Paystack's word that the money arrived beats an earlier failure.
      const claimed = await t.orm.public.Order.where({ id: order.id })
        .where((o) => o.status.in(["PENDING", "FAILED"]))
        .select("id")
        .update({ status: "SUCCESS", paidAt });
      if (!claimed || !order.moduleId) return false;

      const module = await t.orm.public.Module.where({ id: order.moduleId }).select("accessDays").first();
      const days = module?.accessDays ?? 365;
      const current = await t.orm.public.Purchase.where({ userId: order.userId, moduleId: order.moduleId })
        .select("id", "expiresAt")
        .first();
      // Buying again before access ends extends it; after it ends, access restarts today.
      const start = current && current.expiresAt > paidAt ? current.expiresAt : paidAt;
      const expiresAt = new Date(start.getTime() + days * DAY_MS);
      if (current) {
        await t.orm.public.Purchase.where({ id: current.id }).update({ expiresAt, orderId: order.id });
      } else {
        await t.orm.public.Purchase.create({ userId: order.userId, moduleId: order.moduleId, orderId: order.id, expiresAt });
      }
      return true;
    });

    if (granted) {
      log.info({ event: "payment.succeeded", source, reference, userId: order.userId, moduleId: order.moduleId }, "payment confirmed; access granted");
    }
    return { status: "SUCCESS" as const, moduleId: order.moduleId };
  }

  // "abandoned" only means the student hasn't finished on Paystack's page yet, so the order stays PENDING.
  if (tx.status === "failed" || tx.status === "reversed") {
    await db.orm.public.Order.where({ id: order.id, status: "PENDING" }).update({ status: "FAILED" });
    log.info({ event: "payment.failed", source, reference, paystackStatus: tx.status }, "payment not completed");
    return { status: "FAILED" as const, moduleId: order.moduleId };
  }

  return { status: "PENDING" as const, moduleId: order.moduleId };
}

/** Called by the website after Paystack redirects back; the order must belong to the caller. */
async function verifyForUser(userId: string, reference: string) {
  const order = await db.orm.public.Order.where({ reference }).select("userId").first();
  if (!order || order.userId !== userId) throw notFound("Payment not found");
  const result = await fulfil(reference, "callback");
  const module = result.moduleId
    ? await db.orm.public.Module.where({ id: result.moduleId })
        .select("id", "title")
        .include("course", (course) => course.select("slug", "title"))
        .first()
    : null;
  return { status: result.status, module };
}

/** The student's modules, newest first, with whether access is still active. */
async function myPurchases(userId: string) {
  const purchases = await db.orm.public.Purchase.where({ userId })
    .select("id", "expiresAt", "createdAt")
    .include("module", (module) =>
      module
        .select("id", "title", "description", "topics", "accessDays", "order")
        .include("course", (course) => course.select("id", "slug", "title", "imageKey", "imageUrl")),
    )
    .orderBy((p) => p.createdAt.desc())
    .all();
  const now = new Date();
  return purchases.map((p) => ({ ...p, isActive: p.expiresAt > now }));
}

/** A purchased module's content link. Admins can open any module. */
async function moduleContent(userId: string, role: string, moduleId: string) {
  const module = await db.orm.public.Module.where({ id: moduleId })
    .select("id", "title", "description", "topics", "contentUrl", "previewUrl")
    .include("course", (course) => course.select("slug", "title"))
    .first();
  if (!module) throw notFound("Module not found");

  if (role !== "ADMIN") {
    const purchase = await db.orm.public.Purchase.where({ userId, moduleId }).select("expiresAt").first();
    if (!purchase) throw new AppError(403, "NOT_PURCHASED", "Buy this module to open it.");
    if (purchase.expiresAt <= new Date()) {
      throw new AppError(403, "ACCESS_EXPIRED", "Your access to this module has ended. Buy it again to continue.");
    }
    return { ...module, expiresAt: purchase.expiresAt };
  }
  return { ...module, expiresAt: null };
}

export const paymentService = { checkout, fulfil, verifyForUser, myPurchases, moduleContent };
