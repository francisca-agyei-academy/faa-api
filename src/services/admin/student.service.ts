import { and, or } from "@prisma/orm-postgres/orm-client";
import { db } from "../../lib/db.js";
import { badRequest, notFound } from "../../lib/errors.js";
import { logger } from "../../lib/logger.js";
import { paginate, studentListSchema, studentUpdateSchema } from "../../types/admin.types.js";
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

export const adminStudentService = { list, get, update };
