/**
 * Loads course content from content/courses/<course-slug>/ into the database:
 *
 *   course.json                 title and description of the course
 *   module-<n>/module.json      title, description and topics of module n (matched by its order)
 *   module-<n>/NN-name.md       one lesson per file, in file-name order; the first "# " line is the title
 *
 * By default, lessons are only loaded into a module that has none yet, so a module edited in the admin
 * panel (lessons changed, reordered or deleted) is left exactly as it is.
 * --force overwrites the module's lessons with the files: it updates them in file order, adds missing
 * ones and removes extras (students' progress on removed lessons goes with them).
 *
 *   pnpm seed:lessons            (all courses)
 *   pnpm seed:lessons --force
 */
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { db } from "../lib/db.js";

const force = process.argv.includes("--force");
const root = join(process.cwd(), "content", "courses");

const readJson = <T>(path: string): T | null => (existsSync(path) ? (JSON.parse(readFileSync(path, "utf8")) as T) : null);

function parseLesson(file: string) {
  const text = readFileSync(file, "utf8").replace(/\r\n/g, "\n");
  const match = /^# (.+)\n/.exec(text);
  if (!match) throw new Error(`${file}: the first line must be "# Lesson title"`);
  return { title: match[1]!.trim(), body: text.slice(match[0].length).trim() + "\n" };
}

for (const slug of readdirSync(root)) {
  const course = await db.orm.public.Course.where({ slug }).select("id", "title").first();
  if (!course) {
    console.warn(`skip ${slug}: no course with this slug`);
    continue;
  }
  const courseMeta = readJson<{ title?: string; description?: string }>(join(root, slug, "course.json"));
  console.log(`course: ${courseMeta?.title ?? course.title}`);
  // Like lessons, titles and descriptions are only written when something is loaded (or with --force),
  // so details edited in the admin panel aren't overwritten by a routine re-run.
  let loadedAny = false;

  const moduleDirs = readdirSync(join(root, slug)).filter((d) => /^module-\d+$/.test(d));
  for (const dir of moduleDirs) {
    const order = Number(dir.split("-")[1]);
    const module = await db.orm.public.Module.where({ courseId: course.id, order }).select("id", "title").first();
    if (!module) {
      console.warn(`  skip ${dir}: the course has no module with order ${order}`);
      continue;
    }
    const meta = readJson<{ title?: string; description?: string; topics?: string[] }>(join(root, slug, dir, "module.json"));
    const files = readdirSync(join(root, slug, dir)).filter((f) => f.endsWith(".md")).sort();
    const existing = await db.orm.public.Lesson.where({ moduleId: module.id }).select("id", "order").all();
    if (existing.length && !force) {
      console.log(`  module ${order}: has ${existing.length} lessons already; left as is (use --force to overwrite)`);
      continue;
    }
    loadedAny = true;
    if (meta) {
      const { title, description, topics } = meta;
      await db.orm.public.Module.where({ id: module.id }).update({ title, description, topics });
    }
    // Lessons in their current order; the n-th file updates the n-th lesson (orders may have gaps).
    const sorted = [...existing].sort((a, b) => a.order - b.order);
    let added = 0;
    let updated = 0;
    for (const [index, file] of files.entries()) {
      const lesson = parseLesson(join(root, slug, dir, file));
      const target = sorted[index];
      if (target) {
        await db.orm.public.Lesson.where({ id: target.id }).update(lesson);
        updated++;
      } else {
        const last = sorted.length ? sorted[sorted.length - 1]!.order : 0;
        await db.orm.public.Lesson.create({ moduleId: module.id, order: last + 1 + (index - sorted.length), ...lesson });
        added++;
      }
    }
    let removed = 0;
    for (const l of sorted.slice(files.length)) {
      await db.orm.public.Lesson.where({ id: l.id }).delete();
      removed++;
    }
    console.log(`  module ${order} "${meta?.title ?? module.title}": ${files.length} files, ${added} added, ${updated} updated, ${removed} removed`);
  }
  if (courseMeta && loadedAny) await db.orm.public.Course.where({ id: course.id }).update(courseMeta);
}

await db.close();
