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

/** A lesson's body is Markdown: headings, lists, tables and links. */
export const lessonCreateSchema = z.object({
  title: trimmed(200).min(2),
  body: z.string().max(300_000).default(""),
});

export const lessonUpdateSchema = lessonCreateSchema.partial();

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

export const studentCreateSchema = z.object({
  email: z.email().transform((email) => email.trim().toLowerCase()),
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  phone: z.string().trim().min(7).max(20).optional(),
  role: z.enum(["STUDENT", "ADMIN"]).default("STUDENT"),
  /** Skip the confirmation email, e.g. for someone the admin already knows. */
  markVerified: z.boolean().default(true),
  /** Email them a link to choose their own password. */
  sendSetupEmail: z.boolean().default(false),
});

/** A purchase an admin records for a student, e.g. paid by cash or bank transfer, or given free. */
export const manualOrderSchema = z.intersection(
  z.union([z.object({ moduleId: z.string().min(1).max(64) }), z.object({ courseId: z.string().min(1).max(64) })]),
  // In pesewas; 0 for a free place. Capped at GH₵1,000,000.
  z.object({ amount: z.number().int().min(0).max(100_000_000) }),
);

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
