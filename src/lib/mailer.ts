import nodemailer from "nodemailer";
import { env } from "../config/env.js";
import { logger } from "./logger.js";

const log = logger.child({ module: "email" });

export interface Email {
  to: string;
  subject: string;
  text: string;
  html: string;
}

const transport =
  env.GMAIL_USER && env.GMAIL_APP_PASSWORD
    ? nodemailer.createTransport({
        service: "gmail",
        auth: { user: env.GMAIL_USER, pass: env.GMAIL_APP_PASSWORD },
      })
    : null;

const from = env.EMAIL_FROM ?? (env.GMAIL_USER ? `Gradvane Global <${env.GMAIL_USER}>` : "Gradvane Global <no-reply@localhost>");

export async function sendEmail(email: Email): Promise<void> {
  if (!transport) {
    // Dev fallback (env.ts refuses to start production without Gmail credentials).
    // The body includes the link, so verify/reset flows can be clicked through locally.
    log.info({ to: email.to, subject: email.subject }, `email not sent (no Gmail credentials):\n${email.text}`);
    return;
  }
  const info = await transport.sendMail({ from, ...email });
  log.info({ to: email.to, subject: email.subject, messageId: info.messageId }, "email sent");
}

/** Sends without blocking the request; a failed send is logged, never surfaced to the client. */
export function sendEmailInBackground(email: Email): void {
  sendEmail(email).catch((err) => {
    log.error({ err, to: email.to, subject: email.subject }, "email failed to send");
  });
}
