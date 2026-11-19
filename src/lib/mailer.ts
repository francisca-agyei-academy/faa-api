import nodemailer from "nodemailer";
import { and } from "@prisma/orm-postgres/orm-client";
import { env } from "../config/env.js";
import { db } from "./db.js";
import { logger } from "./logger.js";

const log = logger.child({ module: "email" });

export interface Email {
  to: string;
  subject: string;
  text: string;
  html: string;
}

/** A failure that retrying won't fix, e.g. Resend refusing the recipient. */
class PermanentEmailError extends Error {}

const from =
  env.EMAIL_FROM ?? (env.GMAIL_USER ? `Gradvane Global <${env.GMAIL_USER}>` : "Gradvane Global <no-reply@localhost>");

const gmail =
  !env.RESEND_API_KEY && env.GMAIL_USER && env.GMAIL_APP_PASSWORD
    ? nodemailer.createTransport({
        service: "gmail",
        auth: { user: env.GMAIL_USER, pass: env.GMAIL_APP_PASSWORD },
        connectionTimeout: 15_000,
      })
    : null;

/** Sends through Resend's HTTPS API; returns Resend's email id. */
async function sendWithResend(email: Email): Promise<string> {
  let res: Response;
  try {
    res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [email.to], subject: email.subject, text: email.text, html: email.html }),
      signal: AbortSignal.timeout(20_000),
    });
  } catch (err) {
    throw new Error(`Resend unreachable: ${(err as Error).message}`);
  }
  const body = (await res.json().catch(() => null)) as { id?: string; message?: string; name?: string } | null;
  if (res.ok && body?.id) return body.id;
  const message = `Resend ${res.status}${body?.name ? ` ${body.name}` : ""}: ${body?.message ?? "no details"}`;
  // 4xx means the request itself is wrong (bad sender, unverified domain, invalid address); 429 is a rate limit.
  if (res.status >= 400 && res.status < 500 && res.status !== 429) throw new PermanentEmailError(message);
  throw new Error(message);
}

/** Delivers one email now. Returns the provider's message id, or null when only logged (dev). */
async function deliver(email: Email): Promise<string | null> {
  if (env.RESEND_API_KEY) return sendWithResend(email);
  if (gmail) return (await gmail.sendMail({ from, ...email })).messageId;
  // Dev fallback (env.ts refuses to start production without a provider). The body includes
  // the link, so verify/reset flows can be clicked through locally.
  log.info({ to: email.to, subject: email.subject }, `email not sent (no email provider set):\n${email.text}`);
  return null;
}

/* ───────── Queue ───────── */

const MAX_ATTEMPTS = 6;
// Wait before attempt 2, 3, … (1 min, 5 min, 15 min, 1 h, 6 h).
const RETRY_DELAYS_MS = [60_000, 5 * 60_000, 15 * 60_000, 60 * 60_000, 6 * 60 * 60_000];
// A job left SENDING this long (the server stopped mid-send) is tried again.
const STALE_LOCK_MS = 5 * 60_000;
const POLL_MS = 15_000;
const BATCH = 10;

let timer: NodeJS.Timeout | null = null;
let running: Promise<void> | null = null;

async function sendJob(job: { id: string; to: string; subject: string; text: string; html: string; attempts: number }) {
  const attempts = job.attempts + 1;
  try {
    const providerId = await deliver(job);
    // The body is cleared so sign-in links don't stay in the database.
    await db.orm.public.EmailJob.where({ id: job.id }).update({
      status: "SENT",
      attempts,
      sentAt: new Date(),
      providerId,
      lockedAt: null,
      lastError: null,
      text: "",
      html: "",
    });
    log.info({ to: job.to, subject: job.subject, providerId, attempts }, "email sent");
  } catch (err) {
    const message = (err as Error).message.slice(0, 1000);
    const giveUp = err instanceof PermanentEmailError || attempts >= MAX_ATTEMPTS;
    const delay = RETRY_DELAYS_MS[Math.min(attempts - 1, RETRY_DELAYS_MS.length - 1)]!;
    await db.orm.public.EmailJob.where({ id: job.id }).update(
      giveUp
        ? { status: "FAILED", attempts, lockedAt: null, lastError: message, text: "", html: "" }
        : { status: "PENDING", attempts, lockedAt: null, lastError: message, nextAttemptAt: new Date(Date.now() + delay) },
    );
    log.error(
      { err, to: job.to, subject: job.subject, attempts, willRetry: !giveUp, retryInSeconds: giveUp ? null : delay / 1000 },
      giveUp ? "email failed; giving up" : "email failed; will retry",
    );
  }
}

/** Sends every due email once. Overlapping calls share the same run. */
function processQueue(): Promise<void> {
  running ??= (async () => {
    try {
      const now = new Date();
      // Recover jobs whose sender stopped mid-send.
      await db.orm.public.EmailJob.where((j) =>
        and(j.status.eq("SENDING"), j.lockedAt.lt(new Date(now.getTime() - STALE_LOCK_MS))),
      ).update({ status: "PENDING", lockedAt: null });

      const due = await db.orm.public.EmailJob.where((j) => and(j.status.eq("PENDING"), j.nextAttemptAt.lte(now)))
        .select("id")
        .orderBy((j) => j.nextAttemptAt.asc())
        .limit(BATCH)
        .all();
      for (const { id } of due) {
        // Claim it; if another run already did, skip.
        const job = await db.orm.public.EmailJob.where({ id, status: "PENDING" })
          .select("id", "to", "subject", "text", "html", "attempts")
          .update({ status: "SENDING", lockedAt: new Date() });
        if (job) await sendJob(job);
      }
    } catch (err) {
      log.error({ err }, "email queue run failed");
    } finally {
      running = null;
    }
  })();
  return running;
}

/**
 * Queues an email and returns at once; the request never waits for the provider.
 * It is sent within moments, and retried with back-off if the provider fails.
 */
export function sendEmailInBackground(email: Email): void {
  db.orm.public.EmailJob.create({ ...email, nextAttemptAt: new Date() })
    .then(() => processQueue())
    .catch((err) => {
      // The queue itself is unavailable (e.g. the database): try once directly rather than lose it.
      log.error({ err, to: email.to, subject: email.subject }, "could not queue email; sending directly");
      deliver(email).catch((sendErr) =>
        log.error({ err: sendErr, to: email.to, subject: email.subject }, "email failed to send"),
      );
    });
}

/** Starts the background sender; call once when the server starts. */
export function startEmailWorker(): void {
  if (timer) return;
  timer = setInterval(() => void processQueue(), POLL_MS);
  timer.unref();
  void processQueue();
  log.info({ provider: env.RESEND_API_KEY ? "resend" : gmail ? "gmail" : "console" }, "email worker started");
}

/** Stops polling and waits for an in-flight run, so shutdown doesn't cut a send off. */
export async function stopEmailWorker(): Promise<void> {
  if (timer) clearInterval(timer);
  timer = null;
  await running;
}
