import { z } from "zod";

/** Photos bundled with the website; the web app maps each key to an image file. */
export const COURSE_IMAGE_KEYS = [
  "graduate",
  "laptop-campus",
  "laptop-classroom",
  "reading-desk",
  "group-steps",
  "writing",
] as const;

const trimmed = (max: number) => z.string().trim().max(max);
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((value) => (value ? value : null));
const topics = z.array(z.string().trim().min(1).max(200)).max(30);
const optionalUrl = z
  .union([z.url(), z.literal("")])
  .nullish()
  .transform((value) => (value ? value : null));

export const courseCreateSchema = z.object({
  title: trimmed(200).min(3),
  slug: z
    .string()
    .trim()
    .min(3)
    .max(120)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase letters, numbers and hyphens, e.g. my-course-name"),
  description: trimmed(1000).min(10),
  track: trimmed(120).default(""),
  audience: optionalText(1000),
  outcomeFrom: optionalText(500),
  outcomeTo: optionalText(500),
  topics: topics.default([]),
  imageKey: z.enum(COURSE_IMAGE_KEYS).default("graduate"),
  isPublished: z.boolean().default(false),
  isFeatured: z.boolean().default(false),
  enrollmentOpen: z.boolean().default(false),
  includesToolkit: z.boolean().default(false),
  includesSignatureBonus: z.boolean().default(false),
  sortOrder: z.number().int().min(0).max(10_000).default(0),
});

export const courseUpdateSchema = courseCreateSchema.partial();

export const moduleCreateSchema = z.object({
  title: trimmed(200).min(3),
  description: optionalText(2000),
  topics: topics.default([]),
  /** Pesewas. null = "Price coming soon". */
  price: z.number().int().min(0).max(100_000_000).nullable().default(null),
  accessDays: z.number().int().min(1).max(3650).nullable().default(null),
  contentUrl: optionalUrl,
  previewUrl: optionalUrl,
  thumbnailUrl: optionalUrl,
  isPublished: z.boolean().default(false),
});

export const moduleUpdateSchema = moduleCreateSchema.partial();

export const moveSchema = z.object({ direction: z.enum(["up", "down"]) });

const page = z.coerce.number().int().min(1).default(1);
const pageSize = z.coerce.number().int().min(1).max(100).default(20);

export const studentListSchema = z.object({
  search: z.string().trim().max(200).optional(),
  role: z.enum(["STUDENT", "ADMIN"]).optional(),
  status: z.enum(["active", "disabled", "unverified"]).optional(),
  page,
  pageSize,
});

export const studentUpdateSchema = z
  .object({
    isActive: z.boolean(),
    role: z.enum(["STUDENT", "ADMIN"]),
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, "Nothing to update");

export const orderListSchema = z.object({
  search: z.string().trim().max(200).optional(),
  status: z.enum(["PENDING", "SUCCESS", "FAILED", "REFUNDED"]).optional(),
  page,
  pageSize,
});

export interface Paginated<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export function paginate<T>(items: T[], total: number, page: number, pageSize: number): Paginated<T> {
  return { items, page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}
