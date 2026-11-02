import { env } from "../config/env.js";
import type { Email } from "../lib/mailer.js";

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

function layout(heading: string, intro: string, buttonLabel: string, link: string, footer: string) {
  return `<!doctype html>
<html><body style="margin:0;padding:24px;background:#f4f3fa;font-family:Arial,sans-serif;color:#17163a">
  <div style="max-width:480px;margin:0 auto 12px;font-family:Arial,sans-serif;font-size:18px;font-weight:800;color:#2b2a6e">Gradvane Global</div>
  <div style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:8px;padding:32px">
    <h1 style="font-size:20px;margin:0 0 16px">${heading}</h1>
    <p style="font-size:15px;line-height:1.5;margin:0 0 24px">${intro}</p>
    <a href="${link}" style="display:inline-block;background:#2b2a6e;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:6px;font-size:15px">${buttonLabel}</a>
    <p style="font-size:13px;line-height:1.5;color:#4e4d6b;margin:24px 0 0">If the button doesn't work, paste this link into your browser:<br><a href="${link}" style="color:#4e4d6b;word-break:break-all">${link}</a></p>
    <p style="font-size:13px;line-height:1.5;color:#4e4d6b;margin:16px 0 0">${footer}</p>
  </div>
</body></html>`;
}

export function verificationEmail(to: string, firstName: string, rawToken: string, ttlHours: number): Email {
  const link = `${env.APP_URL}/verify-email?token=${encodeURIComponent(rawToken)}`;
  const name = escapeHtml(firstName);
  return {
    to,
    subject: "Verify your email address",
    text: `Hi ${firstName},\n\nConfirm your email address to finish setting up your account:\n${link}\n\nThis link expires in ${ttlHours} hours. If you didn't create an account, you can ignore this email.`,
    html: layout(
      "Verify your email address",
      `Hi ${name}, confirm your email address to finish setting up your account.`,
      "Verify email",
      link,
      `This link expires in ${ttlHours} hours. If you didn't create an account, you can ignore this email.`,
    ),
  };
}

export function passwordResetEmail(to: string, firstName: string, rawToken: string, ttlMinutes: number): Email {
  const link = `${env.APP_URL}/reset-password?token=${encodeURIComponent(rawToken)}`;
  const name = escapeHtml(firstName);
  return {
    to,
    subject: "Reset your password",
    text: `Hi ${firstName},\n\nWe received a request to reset your password. Choose a new one here:\n${link}\n\nThis link expires in ${ttlMinutes} minutes and can be used once. If you didn't ask for this, you can ignore this email; your password won't change.`,
    html: layout(
      "Reset your password",
      `Hi ${name}, we received a request to reset your password.`,
      "Choose a new password",
      link,
      `This link expires in ${ttlMinutes} minutes and can be used once. If you didn't ask for this, you can ignore this email; your password won't change.`,
    ),
  };
}

export function passwordChangedEmail(to: string, firstName: string): Email {
  const name = escapeHtml(firstName);
  const text = `Hi ${firstName},\n\nYour password was just changed, and you've been signed out on your other devices.\n\nIf this wasn't you, reset your password right away: ${env.APP_URL}/forgot-password`;
  return {
    to,
    subject: "Your password was changed",
    text,
    html: layout(
      "Your password was changed",
      `Hi ${name}, your password was just changed, and you've been signed out on your other devices.`,
      "This wasn't me",
      `${env.APP_URL}/forgot-password`,
      "If you made this change, no action is needed.",
    ),
  };
}
