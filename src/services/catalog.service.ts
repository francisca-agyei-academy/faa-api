import { db } from "../lib/db.js";
import { notFound } from "../lib/errors.js";

const courseFields = [
  "id",
  "slug",
  "title",
  "description",
  "track",
  "audience",
  "outcomeFrom",
  "outcomeTo",
  "topics",
  "imageKey",
  "imageUrl",
  "isFeatured",
  "enrollmentOpen",
  "includesToolkit",
  "includesSignatureBonus",
  "sortOrder",
] as const;

// contentUrl is deliberately absent: only buyers get it, through /me/modules/:id.
const moduleFields = ["id", "title", "description", "order", "topics", "price", "accessDays", "previewUrl", "thumbnailUrl"] as const;

/** Published courses for the website, with their published modules in order. */
async function list() {
  return db.orm.public.Course.where({ isPublished: true })
    .select(...courseFields)
    .include("modules", (modules) =>
      modules.where({ isPublished: true }).select(...moduleFields).orderBy((m) => m.order.asc()),
    )
    .orderBy([(c) => c.sortOrder.asc(), (c) => c.createdAt.asc()])
    .all();
}

async function getBySlug(slug: string) {
  const course = await db.orm.public.Course.where({ slug, isPublished: true })
    .select(...courseFields)
    .include("modules", (modules) =>
      modules.where({ isPublished: true }).select(...moduleFields).orderBy((m) => m.order.asc()),
    )
    .first();
  if (!course) throw notFound("Course not found");
  return course;
}

export const catalogService = { list, getBySlug };
