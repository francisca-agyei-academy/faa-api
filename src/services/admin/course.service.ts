import { db } from "../../lib/db.js";
import { conflict, isForeignKeyViolation, isUniqueViolation, notFound } from "../../lib/errors.js";
import { logger } from "../../lib/logger.js";
import { deleteStoredImage, uploadCourseImage } from "../../lib/storage.js";
import {
  courseCreateSchema,
  courseUpdateSchema,
  moduleCreateSchema,
  moduleUpdateSchema,
  moveSchema,
} from "../../types/admin.types.js";

const log = logger.child({ module: "admin.courses" });

const SLUG_TAKEN = "Another course already uses this slug";

async function list() {
  return db.orm.public.Course.orderBy([(c) => c.sortOrder.asc(), (c) => c.createdAt.asc()])
    .include("modules", (modules) => modules.count())
    .all();
}

async function get(id: string) {
  const course = await db.orm.public.Course.where({ id })
    .include("modules", (modules) => modules.orderBy((m) => m.order.asc()))
    .first();
  if (!course) throw notFound("Course not found");
  return course;
}

async function create(body: unknown, adminId: string) {
  const input = courseCreateSchema.parse(body);
  try {
    const course = await db.orm.public.Course.create(input);
    log.info({ event: "admin.course_created", adminId, courseId: course.id }, "course created");
    return course;
  } catch (err) {
    if (isUniqueViolation(err)) throw conflict(SLUG_TAKEN);
    throw err;
  }
}

async function update(id: string, body: unknown, adminId: string) {
  const input = courseUpdateSchema.parse(body);
  try {
    const course = await db.orm.public.Course.where({ id }).update(input);
    if (!course) throw notFound("Course not found");
    log.info({ event: "admin.course_updated", adminId, courseId: id, fields: Object.keys(input) }, "course updated");
    return course;
  } catch (err) {
    if (isUniqueViolation(err)) throw conflict(SLUG_TAKEN);
    throw err;
  }
}

async function remove(id: string, adminId: string) {
  try {
    const deleted = await db.orm.public.Course.where({ id }).delete();
    if (!deleted) throw notFound("Course not found");
    log.info({ event: "admin.course_deleted", adminId, courseId: id }, "course deleted");
  } catch (err) {
    if (isForeignKeyViolation(err)) {
      throw conflict("Students have bought modules in this course. Unpublish it instead of deleting it.");
    }
    throw err;
  }
}

async function setImage(id: string, file: { buffer: Buffer; mimetype: string }, adminId: string) {
  const existing = await db.orm.public.Course.where({ id }).select("imageUrl").first();
  if (!existing) throw notFound("Course not found");
  const imageUrl = await uploadCourseImage(file, id);
  const course = await db.orm.public.Course.where({ id }).update({ imageUrl });
  await deleteStoredImage(existing.imageUrl);
  log.info({ event: "admin.course_image_set", adminId, courseId: id }, "course image uploaded");
  return course;
}

async function removeImage(id: string, adminId: string) {
  const existing = await db.orm.public.Course.where({ id }).select("imageUrl").first();
  if (!existing) throw notFound("Course not found");
  const course = await db.orm.public.Course.where({ id }).update({ imageUrl: null });
  await deleteStoredImage(existing.imageUrl);
  log.info({ event: "admin.course_image_removed", adminId, courseId: id }, "course image removed");
  return course;
}

async function createModule(courseId: string, body: unknown, adminId: string) {
  const input = moduleCreateSchema.parse(body);
  const course = await db.orm.public.Course.where({ id: courseId }).select("id").first();
  if (!course) throw notFound("Course not found");

  // New modules go to the end of the course.
  const { maxOrder } = await db.orm.public.Module.where({ courseId }).aggregate((a) => ({ maxOrder: a.max("order") }));
  const created = await db.orm.public.Module.create({ ...input, courseId, order: (maxOrder ?? 0) + 1 });
  log.info({ event: "admin.module_created", adminId, courseId, moduleId: created.id }, "module created");
  return created;
}

async function updateModule(id: string, body: unknown, adminId: string) {
  const input = moduleUpdateSchema.parse(body);
  const updated = await db.orm.public.Module.where({ id }).update(input);
  if (!updated) throw notFound("Module not found");
  log.info({ event: "admin.module_updated", adminId, moduleId: id, fields: Object.keys(input) }, "module updated");
  return updated;
}

async function removeModule(id: string, adminId: string) {
  try {
    const deleted = await db.orm.public.Module.where({ id }).delete();
    if (!deleted) throw notFound("Module not found");
    log.info({ event: "admin.module_deleted", adminId, moduleId: id }, "module deleted");
  } catch (err) {
    if (isForeignKeyViolation(err)) {
      throw conflict("Students have bought this module. Unpublish it instead of deleting it.");
    }
    throw err;
  }
}

/** Swaps a module with its neighbour. (courseId, order) is unique, so it parks one at -1 first. */
async function moveModule(id: string, body: unknown) {
  const { direction } = moveSchema.parse(body);
  return db.transaction(async (tx) => {
    const current = await tx.orm.public.Module.where({ id }).select("id", "courseId", "order").first();
    if (!current) throw notFound("Module not found");

    const neighbour = await tx.orm.public.Module.where({ courseId: current.courseId })
      .where((m) => (direction === "up" ? m.order.lt(current.order) : m.order.gt(current.order)))
      .orderBy((m) => (direction === "up" ? m.order.desc() : m.order.asc()))
      .select("id", "order")
      .first();
    if (!neighbour) return { moved: false };

    await tx.orm.public.Module.where({ id: current.id }).update({ order: -1 });
    await tx.orm.public.Module.where({ id: neighbour.id }).update({ order: current.order });
    await tx.orm.public.Module.where({ id: current.id }).update({ order: neighbour.order });
    return { moved: true };
  });
}

export const adminCourseService = {
  list,
  get,
  create,
  update,
  remove,
  setImage,
  removeImage,
  createModule,
  updateModule,
  removeModule,
  moveModule,
};
