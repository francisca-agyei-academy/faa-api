import { randomBytes } from "node:crypto";
import { and, or } from "@prisma/orm-postgres/orm-client";
import bcrypt from "bcrypt";
import { db } from "../../lib/db.js";
import { badRequest, conflict, isUniqueViolation, notFound } from "../../lib/errors.js";
import { logger } from "../../lib/logger.js";
import { sendEmailInBackground } from "../../lib/mailer.js";
import { createEmailToken } from "../../lib/tokens.js";
import { paginate, studentCreateSchema, studentListSchema, studentUpdateSchema } from "../../types/admin.types.js";
import { verificationEmail, welcomeSetPasswordEmail } from "../email.templates.js";
import { revokeAllSessions } from "../session.service.js";

const log = logger.child({ module: "admin.students" });

const listFields = [
  "id",
  "email",
  "firstName",
  "lastName",
  "phone",
  "role",
  "isActive",
  "isEmailVerified",
  "lastLoginAt",
  "createdAt",
] as const;

/** % and _ are wildcards in ILIKE; escape them so a search for "50%" means the text "50%". */
const likePattern = (text: string) => `%${text.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

async function list(query: unknown) {
  const input = studentListSchema.parse(query);

  const filtered = db.orm.public.User.where((u) => {
    const conditions = [u.id.isNotNull()];
    if (input.search) {
      const pattern = likePattern(input.search);
      conditions.push(or(u.email.ilike(pattern), u.firstName.ilike(pattern), u.lastName.ilike(pattern)));
    }
    if (input.role) conditions.push(u.role.eq(input.role));
    if (input.status === "active") conditions.push(u.isActive.eq(true));
    if (input.status === "disabled") conditions.push(u.isActive.eq(false));
    if (input.status === "unverified") conditions.push(u.isEmailVerified.eq(false));
    return and(...conditions);
  });

  const [{ total }, items] = await Promise.all([
    filtered.aggregate((a) => ({ total: a.count() })),
    filtered
      .select(...listFields)
      .include("purchases", (purchases) => purchases.count())
      .orderBy([(u) => u.createdAt.desc(), (u) => u.id.desc()])
      .limit(input.pageSize)
      .offset((input.page - 1) * input.pageSize)
      .all(),
  ]);

  return paginate(items, total, input.page, input.pageSize);
}

async function get(id: string) {
  const student = await db.orm.public.User.where({ id })
    .select(...listFields, "emailVerifiedAt", "lastLoginIp", "updatedAt")
    .include("orders", (orders) =>
      orders.select("id", "reference", "amount", "currency", "status", "paidAt", "createdAt").orderBy((o) => o.createdAt.desc()),
    )
    .include("purchases", (purchases) =>
      purchases
        .select("id", "expiresAt", "createdAt", "orderId")
        .include("module", (module) => module.select("id", "title", "courseId"))
        .orderBy((p) => p.createdAt.desc()),
    )
    .include("sessions", (sessions) => sessions.count())
    .first();
  if (!student) throw notFound("Student not found");
  return student;
}

async function update(id: string, body: unknown, adminId: string) {
  const input = studentUpdateSchema.parse(body);
  if (id === adminId) throw badRequest("You can't change your own role or status");

  const updated = await db.orm.public.User.where({ id }).select(...listFields).update(input);
  if (!updated) throw notFound("Student not found");

  // A disabled account is signed out everywhere at once.
  if (input.isActive === false) await revokeAllSessions(id);

  log.info({ event: "admin.student_updated", adminId, userId: id, changes: input }, "student updated");
  return updated;
}

const SETUP_LINK_DAYS = 3;
const VERIFICATION_TTL_HOURS = 24;

/**
 * Creates an account for someone, e.g. a student who paid offline. Returns a temporary password
 * the admin can pass on; it is shown once and never stored in plain text.
 */
async function create(body: unknown, adminId: string) {
  const input = studentCreateSchema.parse(body);

  const existing = await db.orm.public.User.where({ email: input.email }).select("id").first();
  if (existing) throw conflict("An account with this email already exists");

  const temporaryPassword = randomBytes(12).toString("base64url");
  const setup = input.sendSetupEmail ? createEmailToken(SETUP_LINK_DAYS * 24 * 60) : null;
  const verification = input.markVerified ? null : createEmailToken(VERIFICATION_TTL_HOURS * 60);

  let student;
  try {
    student = await db.orm.public.User.select(...listFields).create({
      email: input.email,
      password: await bcrypt.hash(temporaryPassword, 12),
      firstName: input.firstName,
      lastName: input.lastName,
      phone: input.phone ?? null,
      role: input.role,
      isEmailVerified: input.markVerified,
      emailVerifiedAt: input.markVerified ? new Date() : null,
      emailVerificationToken: verification?.hash ?? null,
      emailVerificationExpiry: verification?.expiresAt ?? null,
      passwordResetToken: setup?.hash ?? null,
      passwordResetExpiry: setup?.expiresAt ?? null,
    });
  } catch (err) {
    if (isUniqueViolation(err)) throw conflict("An account with this email already exists");
    throw err;
  }

  if (setup) sendEmailInBackground(welcomeSetPasswordEmail(student.email, student.firstName, setup.raw, SETUP_LINK_DAYS));
  if (verification) {
    sendEmailInBackground(verificationEmail(student.email, student.firstName, verification.raw, VERIFICATION_TTL_HOURS));
  }

  log.info(
    { event: "admin.student_created", adminId, userId: student.id, role: input.role, verified: input.markVerified, setupEmail: input.sendSetupEmail },
    "student created by admin",
  );
  return { student, temporaryPassword };
}

export const adminStudentService = { list, get, update, create };
