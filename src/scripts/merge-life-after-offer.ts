/**
 * One-off change: the six "coming soon" courses become the modules of a second course,
 * "Life After Your Offer Letter". Each old course's title, summary and topics are copied
 * into a module, then the old (module-less) course is deleted.
 * Safe to re-run: it skips work that is already done, and never deletes a course that has modules.
 *
 *   pnpm tsx src/scripts/merge-life-after-offer.ts
 */
import { db } from "../lib/db.js";
import { logger } from "../lib/logger.js";

const NEW_SLUG = "life-after-your-offer-letter";
const OLD_SLUGS = [
  "first-30-days-abroad",
  "working-with-your-supervisor",
  "international-academic-career",
  "academic-writing-made-simple",
  "research-to-published-paper",
  "ai-for-academic-research",
];

async function main() {
  const Course = db.orm.public.Course;
  const Module = db.orm.public.Module;

  let course = await Course.where({ slug: NEW_SLUG }).select("id").first();
  if (!course) {
    course = await Course.create({
      slug: NEW_SLUG,
      title: "Life After Your Offer Letter",
      track: "Studying Abroad & Postgraduate Success",
      description:
        "Everything after the offer letter: settling in abroad, working with your supervisor, academic writing, publishing, AI for research and building an international career.",
      imageKey: "laptop-campus",
      audience: null,
      outcomeFrom: null,
      outcomeTo: null,
      topics: [],
      isPublished: true,
      isFeatured: false,
      enrollmentOpen: false,
      includesToolkit: false,
      includesSignatureBonus: false,
      sortOrder: 1,
    });
    logger.info({ slug: NEW_SLUG }, "course created");
  }

  for (const [index, slug] of OLD_SLUGS.entries()) {
    const old = await Course.where({ slug }).select("id", "title", "description", "topics").first();
    if (!old) {
      logger.info({ slug }, "old course already gone, skipped");
      continue;
    }
    const oldModules = await Module.where({ courseId: old.id }).select("id").all();
    if (oldModules.length > 0) {
      logger.error({ slug, modules: oldModules.length }, "old course has modules, left untouched");
      continue;
    }
    const order = index + 1;
    const existing = await Module.where({ courseId: course.id, order }).select("id").first();
    if (!existing) {
      await Module.create({
        courseId: course.id,
        title: old.title,
        description: old.description,
        topics: old.topics,
        order,
        price: null,
        accessDays: null,
        isPublished: true,
      });
    }
    await Course.where({ id: old.id }).delete();
    logger.info({ slug, order }, "moved into module and deleted");
  }

  const modules = await Module.where({ courseId: course.id }).select("order", "title").all();
  logger.info({ modules: modules.sort((a, b) => a.order - b.order).map((m) => `${m.order}. ${m.title}`) }, "done");
}

try {
  await main();
} finally {
  await db.close();
}
