import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "../config/env.js";
import { AppError } from "./errors.js";

const BASE = "https://api.paystack.co";

interface PaystackEnvelope<T> {
  status: boolean;
  message: string;
  data: T;
}

export interface PaystackTransaction {
  id: number;
  status: "success" | "failed" | "abandoned" | "ongoing" | "pending" | "processing" | "queued" | "reversed";
  reference: string;
  amount: number;
  currency: string;
  channel: string | null;
  gateway_response: string | null;
  paid_at: string | null;
  authorization?: { authorization_code?: string };
  metadata?: unknown;
}

async function call<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
  if (!env.PAYSTACK_SECRET_KEY) {
    throw new AppError(503, "PAYMENTS_NOT_CONFIGURED", "Payments aren't set up yet.");
  }
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      headers: { Authorization: `Bearer ${env.PAYSTACK_SECRET_KEY}`, "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    throw new AppError(502, "PAYMENT_PROVIDER_UNREACHABLE", "We couldn't reach the payment provider. Please try again.");
  }
  const json = (await res.json().catch(() => null)) as PaystackEnvelope<T> | null;
  if (!res.ok || !json?.status) {
    throw new AppError(502, "PAYMENT_PROVIDER_ERROR", json?.message ?? "The payment provider returned an error.");
  }
  return json.data;
}

/** Starts a checkout. `amount` is in pesewas (Paystack's subunit for GHS). */
export function initializeTransaction(input: {
  email: string;
  amount: number;
  reference: string;
  callbackUrl: string;
  metadata: Record<string, unknown>;
}) {
  return call<{ authorization_url: string; access_code: string; reference: string }>("POST", "/transaction/initialize", {
    email: input.email,
    amount: input.amount,
    currency: "GHS",
    reference: input.reference,
    callback_url: input.callbackUrl,
    metadata: input.metadata,
  });
}

/** The source of truth for whether a payment succeeded. */
export function verifyTransaction(reference: string) {
  return call<PaystackTransaction>("GET", `/transaction/verify/${encodeURIComponent(reference)}`);
}

/** Webhooks are signed with HMAC-SHA512 of the raw body using the secret key. */
export function isValidWebhookSignature(rawBody: Buffer, signature: string | undefined) {
  if (!env.PAYSTACK_SECRET_KEY || !signature) return false;
  const expected = createHmac("sha512", env.PAYSTACK_SECRET_KEY).update(rawBody).digest("hex");
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(signature, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}
