import { and } from "@prisma/orm-postgres/orm-client";
import { db } from "../lib/db.js";
import { logger } from "../lib/logger.js";
import { sendEmailInBackground, type Email } from "../lib/mailer.js";
import { accessEndedEmail, accessEndingEmail, type AccessItem } from "./email.templates.js";
import { modulePositions, renewPath } from "./payment.service.js";

const log = logger.child({ module: "reminders" });

const DAY_MS = 24 * 60 * 60 * 1000;
// "Ends soon" goes out once access has this long left.
const REMIND_BEFORE_MS = 7 * DAY_MS;
// "Has ended" is only sent for access that ended recently, so old expiries never get a late email.
const ENDED_WINDOW_MS = 3 * DAY_MS;
const RUN_EVERY_MS = 60 * 60 * 1000;
// The first run waits a little after startup, so a deploy isn't slowed down by it.
const FIRST_RUN_DELAY_MS = 60 * 1000;

type Kind = "ending" | "ended";
const sentField = { ending: "reminderSentAt", ended: "endedNoticeSentAt" } as const;

/**
 * Finds the purchases due one kind of reminder and marks each as sent; the update succeeds for
 * only one caller, so two servers (or two runs) never email the same reminder twice. The email
 * itself goes through the email queue, which retries until it is delivered.
 */
async function claimDue(kind: Kind, now: Date) {
  const field = sentField[kind];
  const due = await db.orm.public.Purchase.where((p) =>
    kind === "ending"
      ? and(p.reminderSentAt.isNull(), p.expiresAt.gt(now), p.expiresAt.lte(new Date(now.getTime() + REMIND_BEFORE_MS)))
      : and(p.endedNoticeSentAt.isNull(), p.expiresAt.lte(now), p.expiresAt.gt(new Date(now.getTime() - ENDED_WINDOW_MS))),
  )
    .select("id")
    .limit(500)
    .all();

  const claimed: string[] = [];
  for (const { id } of due) {
    const row = await db.orm.public.Purchase.where((p) => and(p.id.eq(id), p[field].isNull()))
      .select("id")
      .update({ [field]: now });
    if (row) claimed.push(row.id);
  }
  if (!claimed.length) return [];

  return db.orm.public.Purchase.where((p) => p.id.in(claimed))
    .select("id", "userId", "expiresAt")
    .include("user", (u) => u.select("email", "firstName", "isActive"))
    .include("module", (m) => m.select("id", "title").include("course", (c) => c.select("id", "slug", "title")))
    .all();
}

async function sendKind(kind: Kind, now: Date) {
  const purchases = await claimDue(kind, now);
  if (!purchases.length) return 0;

  const positions = await modulePositions(purchases.flatMap((p) => (p.module?.course ? [p.module.course.id] : [])));
  const byUser = new Map<string, { email: string; firstName: string; items: AccessItem[] }>();
  for (const p of purchases) {
    // Disabled accounts get nothing; their reminders stay marked as sent.
    if (!p.user?.isActive || !p.module?.course) continue;
    const entry = byUser.get(p.userId) ?? { email: p.user.email, firstName: p.user.firstName, items: [] };
    entry.items.push({
      moduleTitle: p.module.title,
      courseTitle: p.module.course.title,
      expiresAt: p.expiresAt,
      renewPath: renewPath(p.module.course.slug, positions.get(p.module.id)),
    });
    byUser.set(p.userId, entry);
  }

  for (const [userId, { email, firstName, items }] of byUser) {
    items.sort((a, b) => a.expiresAt.getTime() - b.expiresAt.getTime());
    const message: Email =
      kind === "ending" ? accessEndingEmail(email, firstName, items) : accessEndedEmail(email, firstName, items);
    sendEmailInBackground(message);
    log.info({ event: `access.${kind}_reminder`, userId, modules: items.length }, `access ${kind} reminder queued`);
  }
  return byUser.size;
}

/** Sends every reminder that is due. Safe to run at any time and as often as you like. */
export async function runAccessReminders(now = new Date()) {
  const ending = await sendKind("ending", now);
  const ended = await sendKind("ended", now);
  return { ending, ended };
}

let timer: NodeJS.Timeout | null = null;
let firstRun: NodeJS.Timeout | null = null;
let running: Promise<unknown> | null = null;

function runSafely() {
  running ??= runAccessReminders()
    .catch((err) => log.error({ err }, "access reminder run failed"))
    .finally(() => {
      running = null;
    });
  return running;
}

/** Checks for due reminders hourly while the server is up; call once when the server starts. */
export function startReminderWorker(): void {
  if (timer) return;
  firstRun = setTimeout(() => void runSafely(), FIRST_RUN_DELAY_MS);
  firstRun.unref();
  timer = setInterval(() => void runSafely(), RUN_EVERY_MS);
  timer.unref();
}

export async function stopReminderWorker(): Promise<void> {
  if (firstRun) clearTimeout(firstRun);
  if (timer) clearInterval(timer);
  firstRun = timer = null;
  await running;
}
