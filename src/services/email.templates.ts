import { env } from "../config/env.js";
import type { Email } from "../lib/mailer.js";

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/**
 * The logo, as in the website header. A PNG (most email apps don't show SVG), served by the website.
 * The name is real text, so it still shows when the reader's email app blocks images.
 */
function brandHeader() {
  return `<table role="presentation" style="max-width:480px;width:100%;margin:0 auto 16px;border-collapse:collapse"><tr>
    <td style="width:48px;padding:0 12px 0 0;vertical-align:middle"><img src="${env.APP_URL}/email/logo.png" width="48" height="48" alt="" style="display:block;border:0;width:48px;height:48px"></td>
    <td style="vertical-align:middle;font-family:Arial,sans-serif">
      <div style="font-size:20px;font-weight:800;color:#2b2a6e;line-height:1.1">Gradvane Global</div>
      <div style="font-size:10px;letter-spacing:2.5px;text-transform:uppercase;color:#4e4d6b;margin-top:4px">Learn &middot; Prepare &middot; Progress</div>
    </td>
  </tr></table>`;
}

function layout(heading: string, intro: string, buttonLabel: string, link: string, footer: string) {
  return `<!doctype html>
<html><body style="margin:0;padding:24px;background:#f4f3fa;font-family:Arial,sans-serif;color:#17163a">
  ${brandHeader()}
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

/** Sent when an admin creates an account: the link lets the student choose their own password. */
export function welcomeSetPasswordEmail(to: string, firstName: string, rawToken: string, ttlDays: number): Email {
  const link = `${env.APP_URL}/reset-password?token=${encodeURIComponent(rawToken)}`;
  const name = escapeHtml(firstName);
  return {
    to,
    subject: "Your Gradvane Global account is ready",
    text: `Hi ${firstName},\n\nAn account has been created for you on Gradvane Global. Choose your password here to get started:\n${link}\n\nThis link expires in ${ttlDays} days and can be used once. After that, use "Forgot password" on the login page.`,
    html: layout(
      "Your account is ready",
      `Hi ${name}, an account has been created for you on Gradvane Global.`,
      "Choose your password",
      link,
      `This link expires in ${ttlDays} days and can be used once. After that, use "Forgot password" on the login page.`,
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

export function passwordSetEmail(to: string, firstName: string): Email {
  const name = escapeHtml(firstName);
  return {
    to,
    subject: "You added a password to your account",
    text: `Hi ${firstName},

You can now log in with your email and password, as well as with Google.

If this wasn't you, reset your password right away: ${env.APP_URL}/forgot-password`,
    html: layout(
      "You added a password",
      `Hi ${name}, you can now log in with your email and password, as well as with Google.`,
      "This wasn't me",
      `${env.APP_URL}/forgot-password`,
      "If you made this change, no action is needed.",
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

export interface ReceiptLine {
  title: string;
  /** e.g. "Access until 19 Nov 2027" */
  detail: string;
}

export interface Receipt {
  to: string;
  firstName: string;
  reference: string;
  paidAt: Date;
  /** What was bought: the module, or the course with its modules listed under it */
  heading: string;
  lines: ReceiptLine[];
  /** In pesewas */
  amount: number;
  currency: string;
  method: string;
}

const formatMoney = (amount: number, currency: string) =>
  `${currency === "GHS" ? "GH₵" : `${currency} `}${(amount / 100).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const formatReceiptDate = (date: Date) =>
  date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Africa/Accra" });

/** Sent once a payment is confirmed (or an admin records one): what was bought, what was paid, and until when. */
export function receiptEmail(r: Receipt): Email {
  const link = `${env.APP_URL}/my-courses`;
  const total = r.amount > 0 ? formatMoney(r.amount, r.currency) : "Free";
  const paidOn = r.paidAt.toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Africa/Accra",
  });
  const row = (label: string, value: string) =>
    `<tr><td style="padding:6px 0;color:#4e4d6b;font-size:14px">${label}</td><td style="padding:6px 0;text-align:right;font-size:14px">${value}</td></tr>`;
  const items = r.lines
    .map(
      (l) =>
        `<li style="margin:0 0 8px"><span style="font-weight:600">${escapeHtml(l.title)}</span><br><span style="color:#4e4d6b;font-size:13px">${escapeHtml(l.detail)}</span></li>`,
    )
    .join("");

  const text = [
    `Hi ${r.firstName},`,
    "",
    "Thank you for your purchase. Here is your receipt.",
    "",
    `Receipt: ${r.reference}`,
    `Date: ${paidOn} (GMT)`,
    `Payment method: ${r.method}`,
    "",
    r.heading,
    ...r.lines.map((l) => `  - ${l.title} (${l.detail})`),
    "",
    `Total paid: ${total}`,
    "",
    `Open your courses: ${link}`,
    "",
    "Keep this email for your records. If anything looks wrong, contact us and quote your receipt number.",
  ].join("\n");

  const html = `<!doctype html>
<html><body style="margin:0;padding:24px;background:#f4f3fa;font-family:Arial,sans-serif;color:#17163a">
  ${brandHeader()}
  <div style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:8px;padding:32px">
    <h1 style="font-size:20px;margin:0 0 8px">Your receipt</h1>
    <p style="font-size:15px;line-height:1.5;margin:0 0 24px">Hi ${escapeHtml(r.firstName)}, thank you for your purchase. Your access is ready.</p>
    <table role="presentation" style="width:100%;border-collapse:collapse;margin:0 0 16px">
      ${row("Receipt", escapeHtml(r.reference))}
      ${row("Date", `${paidOn} GMT`)}
      ${row("Payment method", escapeHtml(r.method))}
    </table>
    <div style="border-top:1px solid #e4e3ef;border-bottom:1px solid #e4e3ef;padding:16px 0;margin:0 0 16px">
      <p style="font-size:15px;font-weight:700;margin:0 0 10px">${escapeHtml(r.heading)}</p>
      <ul style="margin:0;padding:0 0 0 18px;font-size:14px;line-height:1.4">${items}</ul>
    </div>
    <table role="presentation" style="width:100%;border-collapse:collapse;margin:0 0 24px">
      <tr><td style="font-size:16px;font-weight:700">Total paid</td><td style="text-align:right;font-size:16px;font-weight:700">${total}</td></tr>
    </table>
    <a href="${link}" style="display:inline-block;background:#2b2a6e;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:6px;font-size:15px">Open my courses</a>
    <p style="font-size:13px;line-height:1.5;color:#4e4d6b;margin:24px 0 0">Keep this email for your records. If anything looks wrong, contact us and quote your receipt number.</p>
  </div>
</body></html>`;

  return { to: r.to, subject: `Your Gradvane Global receipt (${r.reference})`, text, html };
}

export interface AccessItem {
  moduleTitle: string;
  courseTitle: string;
  expiresAt: Date;
  /** Website path of the module's card on its course page */
  renewPath: string;
}

/** One email for all of a student's modules in the same state, each with its own renew link. */
function accessEmail(
  to: string,
  firstName: string,
  items: AccessItem[],
  copy: { subject: string; heading: string; intro: string; when: (item: AccessItem) => string; footer: string },
): Email {
  const myCourses = `${env.APP_URL}/my-courses`;
  const rows = items
    .map(
      (item) => `<tr>
        <td style="padding:12px 0;border-top:1px solid #e4e3ef;vertical-align:top">
          <div style="font-size:15px;font-weight:600">${escapeHtml(item.moduleTitle)}</div>
          <div style="font-size:13px;color:#4e4d6b;margin-top:2px">${escapeHtml(item.courseTitle)} &middot; ${copy.when(item)}</div>
        </td>
        <td style="padding:12px 0 12px 12px;border-top:1px solid #e4e3ef;text-align:right;vertical-align:middle;white-space:nowrap">
          <a href="${env.APP_URL}${item.renewPath}" style="display:inline-block;background:#2b2a6e;color:#ffffff;text-decoration:none;padding:8px 14px;border-radius:6px;font-size:14px">Renew</a>
        </td>
      </tr>`,
    )
    .join("");

  const html = `<!doctype html>
<html><body style="margin:0;padding:24px;background:#f4f3fa;font-family:Arial,sans-serif;color:#17163a">
  ${brandHeader()}
  <div style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:8px;padding:32px">
    <h1 style="font-size:20px;margin:0 0 8px">${copy.heading}</h1>
    <p style="font-size:15px;line-height:1.5;margin:0 0 20px">Hi ${escapeHtml(firstName)}, ${copy.intro}</p>
    <table role="presentation" style="width:100%;border-collapse:collapse;margin:0 0 24px">${rows}</table>
    <a href="${myCourses}" style="color:#2b2a6e;font-size:14px;font-weight:600">Go to my courses</a>
    <p style="font-size:13px;line-height:1.5;color:#4e4d6b;margin:24px 0 0">${copy.footer}</p>
  </div>
</body></html>`;

  const text = [
    `Hi ${firstName},`,
    "",
    copy.intro.charAt(0).toUpperCase() + copy.intro.slice(1),
    "",
    ...items.flatMap((item) => [
      `- ${item.moduleTitle} (${item.courseTitle}), ${copy.when(item)}`,
      `  Renew: ${env.APP_URL}${item.renewPath}`,
    ]),
    "",
    `My courses: ${myCourses}`,
    "",
    copy.footer,
  ].join("\n");

  return { to, subject: copy.subject, text, html };
}

/** Sent about 7 days before access ends. */
export function accessEndingEmail(to: string, firstName: string, items: AccessItem[]): Email {
  const one = items.length === 1;
  return accessEmail(to, firstName, items, {
    subject: one ? `Your access to ${items[0]!.moduleTitle} ends soon` : "Your access to some modules ends soon",
    heading: one ? "Your access ends soon" : "Some of your access ends soon",
    intro: one
      ? "your access to this module ends in the next few days. Renew it to keep going without a break."
      : "your access to these modules ends in the next few days. Renew them to keep going without a break.",
    when: (item) => `ends ${formatReceiptDate(item.expiresAt)}`,
    footer: "Renewing early doesn't lose any days: the new access period starts when the current one ends.",
  });
}

/** Sent when access has just ended. */
export function accessEndedEmail(to: string, firstName: string, items: AccessItem[]): Email {
  const one = items.length === 1;
  return accessEmail(to, firstName, items, {
    subject: one ? `Your access to ${items[0]!.moduleTitle} has ended` : "Your access to some modules has ended",
    heading: "Your access has ended",
    intro: one
      ? "your access to this module has ended. Renew it any time to pick up where you left off."
      : "your access to these modules has ended. Renew them any time to pick up where you left off.",
    when: (item) => `ended ${formatReceiptDate(item.expiresAt)}`,
    footer: "Renewing gives you a full new access period from the day you renew.",
  });
}
