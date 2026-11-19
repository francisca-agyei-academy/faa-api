import { randomBytes } from "node:crypto";
import { z } from "zod";
import { env } from "../config/env.js";
import { db } from "../lib/db.js";
import { AppError, conflict, notFound, unauthorized } from "../lib/errors.js";
import { logger } from "../lib/logger.js";
import { initializeTransaction, verifyTransaction, type PaystackTransaction } from "../lib/paystack.js";
import { manualOrderSchema } from "../types/admin.types.js";

const log = logger.child({ module: "payments" });

type Json = string | number | boolean | null | Json[] | { [key: string]: Json };
const DAY_MS = 24 * 60 * 60 * 1000;

const checkoutSchema = z.union([
  z.object({ moduleId: z.string().min(1).max(64) }),
  z.object({ courseId: z.string().min(1).max(64) }),
]);

const newReference = () => `GRV-${Date.now().toString(36).toUpperCase()}-${randomBytes(3).toString("hex").toUpperCase()}`;

/** Creates the order, opens a Paystack session for it and returns the payment page URL. */
async function startPayment(
  user: { id: string; email: string },
  order: { moduleId?: string; courseId?: string; amount: number },
  metadata: Record<string, string>,
) {
  const reference = newReference();
  const created = await db.orm.public.Order.select("id").create({
    userId: user.id,
    moduleId: order.moduleId ?? null,
    courseId: order.courseId ?? null,
    reference,
    amount: order.amount,
    currency: "GHS",
  });
  try {
    const session = await initializeTransaction({
      email: user.email,
      amount: order.amount,
      reference,
      callbackUrl: `${env.APP_URL}/checkout/callback`,
      metadata: { orderId: created.id, userId: user.id, ...metadata },
    });
    log.info({ event: "payment.checkout_started", userId: user.id, ...order, orderId: created.id, reference }, "checkout started");
    return { authorizationUrl: session.authorization_url, reference };
  } catch (err) {
    await db.orm.public.Order.where({ id: created.id }).update({ status: "FAILED" });
    throw err;
  }
}

/** Starts a Paystack checkout for one module, or for every module of a course, and returns the URL to send the student to. */
async function checkout(userId: string, body: unknown) {
  const input = checkoutSchema.parse(body);
  if ("courseId" in input) return checkoutCourse(userId, input.courseId);
  const { moduleId } = input;

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

  return startPayment(
    user,
    { moduleId, amount: module.price },
    { moduleId, module: module.title, course: module.course.title },
  );
}

/** Active-access module ids the student already has, out of the given ones. */
async function ownedModuleIds(userId: string, moduleIds: string[]) {
  if (!moduleIds.length) return new Set<string>();
  const now = new Date();
  const purchases = await db.orm.public.Purchase.where({ userId })
    .where((p) => p.moduleId.in(moduleIds))
    .select("moduleId", "expiresAt")
    .all();
  return new Set(purchases.filter((p) => p.expiresAt > now).map((p) => p.moduleId));
}

/**
 * The full course in one payment. The price is the total of the modules the student doesn't
 * already have, so nobody pays twice for a module. (A course discount can be added here later.)
 */
async function checkoutCourse(userId: string, courseId: string) {
  const [user, course] = await Promise.all([
    db.orm.public.User.where({ id: userId }).select("id", "email").first(),
    db.orm.public.Course.where({ id: courseId }).select("id", "title", "isPublished", "enrollmentOpen").first(),
  ]);
  if (!user) throw unauthorized("Account no longer exists");
  if (!course || !course.isPublished) throw notFound("Course not found");
  if (!course.enrollmentOpen) {
    throw new AppError(409, "ENROLLMENT_CLOSED", "Enrolment for this course hasn't opened yet.");
  }

  const modules = await db.orm.public.Module.where({ courseId, isPublished: true })
    .select("id", "price", "accessDays")
    .all();
  if (!modules.length || modules.some((m) => !m.price || m.price <= 0 || !m.accessDays)) {
    throw new AppError(409, "NOT_FOR_SALE", "This course isn't on sale as a whole yet.");
  }

  const owned = await ownedModuleIds(userId, modules.map((m) => m.id));
  const toBuy = modules.filter((m) => !owned.has(m.id));
  if (!toBuy.length) throw conflict("You already have every module in this course.");
  const amount = toBuy.reduce((sum, m) => sum + m.price!, 0);

  return startPayment(user, { courseId, amount }, { courseId, course: course.title, modules: String(toBuy.length) });
}

/** Grants (or extends) one module for a paid order, inside the fulfilment transaction. */
async function grantModule(
  t: Pick<typeof db, "orm">,
  order: { id: string; userId: string },
  moduleId: string,
  paidAt: Date,
  { extendActive }: { extendActive: boolean },
) {
  const module = await t.orm.public.Module.where({ id: moduleId }).select("accessDays").first();
  const days = module?.accessDays ?? 365;
  const current = await t.orm.public.Purchase.where({ userId: order.userId, moduleId })
    .select("id", "expiresAt")
    .first();
  const active = current && current.expiresAt > paidAt;
  // A full-course order didn't charge for modules the student already had, so it leaves them as they are.
  if (active && !extendActive) return;
  // Buying again before access ends extends it; after it ends, access restarts today.
  const start = active ? current.expiresAt : paidAt;
  const expiresAt = new Date(start.getTime() + days * DAY_MS);
  if (current) {
    await t.orm.public.Purchase.where({ id: current.id }).update({ expiresAt, orderId: order.id });
  } else {
    await t.orm.public.Purchase.create({ userId: order.userId, moduleId, orderId: order.id, expiresAt });
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
    .select("id", "userId", "moduleId", "courseId", "amount", "currency", "status")
    .first();
  if (!order) throw notFound("Payment not found");
  const target = { moduleId: order.moduleId, courseId: order.courseId };
  if (order.status === "SUCCESS") return { status: "SUCCESS" as const, ...target };

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
      if (!claimed) return false;

      if (order.moduleId) {
        await grantModule(t, order, order.moduleId, paidAt, { extendActive: true });
      } else if (order.courseId) {
        const modules = await t.orm.public.Module.where({ courseId: order.courseId, isPublished: true }).select("id").all();
        for (const m of modules) await grantModule(t, order, m.id, paidAt, { extendActive: false });
      } else {
        return false;
      }
      return true;
    });

    if (granted) {
      log.info({ event: "payment.succeeded", source, reference, userId: order.userId, ...target }, "payment confirmed; access granted");
    }
    return { status: "SUCCESS" as const, ...target };
  }

  // "abandoned" only means the student hasn't finished on Paystack's page yet, so the order stays PENDING.
  if (tx.status === "failed" || tx.status === "reversed") {
    await db.orm.public.Order.where({ id: order.id, status: "PENDING" }).update({ status: "FAILED" });
    log.info({ event: "payment.failed", source, reference, paystackStatus: tx.status }, "payment not completed");
    return { status: "FAILED" as const, ...target };
  }

  return { status: "PENDING" as const, ...target };
}

/** Called by the website after Paystack redirects back; the order must belong to the caller. */
async function verifyForUser(userId: string, reference: string) {
  const order = await db.orm.public.Order.where({ reference }).select("userId").first();
  if (!order || order.userId !== userId) throw notFound("Payment not found");
  const result = await fulfil(reference, "callback");
  const [module, course] = await Promise.all([
    result.moduleId
      ? db.orm.public.Module.where({ id: result.moduleId })
          .select("id", "title")
          .include("course", (c) => c.select("slug", "title"))
          .first()
      : null,
    result.courseId ? db.orm.public.Course.where({ id: result.courseId }).select("slug", "title").first() : null,
  ]);
  return { status: result.status, module, course };
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

/**
 * An admin records a purchase for a student (paid offline, or given free). It is saved as a paid
 * order with a MAN- reference and grants access exactly as a Paystack payment would.
 */
async function recordManualOrder(adminId: string, userId: string, body: unknown) {
  const input = manualOrderSchema.parse(body);
  const user = await db.orm.public.User.where({ id: userId }).select("id").first();
  if (!user) throw notFound("Student not found");

  const moduleId = "moduleId" in input ? input.moduleId : null;
  const courseId = "courseId" in input ? input.courseId : null;
  if (moduleId) {
    const module = await db.orm.public.Module.where({ id: moduleId }).select("id").first();
    if (!module) throw notFound("Module not found");
  } else {
    const course = await db.orm.public.Course.where({ id: courseId! }).select("id").first();
    if (!course) throw notFound("Course not found");
  }

  const reference = newReference().replace(/^GRV-/, "MAN-");
  const paidAt = new Date();
  const order = await db.transaction(async (t) => {
    const created = await t.orm.public.Order.select("id", "reference", "amount", "status", "paidAt").create({
      userId,
      moduleId,
      courseId,
      reference,
      amount: input.amount,
      currency: "GHS",
      status: "SUCCESS",
      paidAt,
    });
    if (moduleId) {
      await grantModule(t, { id: created.id, userId }, moduleId, paidAt, { extendActive: true });
    } else {
      const modules = await t.orm.public.Module.where({ courseId: courseId!, isPublished: true }).select("id").all();
      for (const m of modules) await grantModule(t, { id: created.id, userId }, m.id, paidAt, { extendActive: false });
    }
    return created;
  });

  log.info({ event: "payment.manual_order", adminId, userId, moduleId, courseId, amount: input.amount, reference }, "manual order recorded");
  return order;
}

export const paymentService = { checkout, fulfil, verifyForUser, myPurchases, moduleContent, recordManualOrder };
