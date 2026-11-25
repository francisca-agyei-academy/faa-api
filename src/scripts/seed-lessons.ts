/**
 * Loads course content from content/courses/<course-slug>/ into the database:
 *
 *   course.json                 title and description of the course
 *   module-<n>/module.json      title, description and topics of module n (matched by its order)
 *   module-<n>/NN-name.md       one lesson per file, in file-name order; the first "# " line is the title
 *
 * By default only lessons that don't exist yet are added, so edits made in the admin panel are kept.
 * --force overwrites existing lessons with the files and removes lessons that have no file.
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
  if (courseMeta) await db.orm.public.Course.where({ id: course.id }).update(courseMeta);
  console.log(`course: ${courseMeta?.title ?? course.title}`);

  const moduleDirs = readdirSync(join(root, slug)).filter((d) => /^module-\d+$/.test(d));
  for (const dir of moduleDirs) {
    const order = Number(dir.split("-")[1]);
    const module = await db.orm.public.Module.where({ courseId: course.id, order }).select("id", "title").first();
    if (!module) {
      console.warn(`  skip ${dir}: the course has no module with order ${order}`);
      continue;
    }
    const meta = readJson<{ title?: string; description?: string; topics?: string[] }>(join(root, slug, dir, "module.json"));
    if (meta) {
      const { title, description, topics } = meta;
      await db.orm.public.Module.where({ id: module.id }).update({ title, description, topics });
    }

    const files = readdirSync(join(root, slug, dir)).filter((f) => f.endsWith(".md")).sort();
    const existing = await db.orm.public.Lesson.where({ moduleId: module.id }).select("id", "order").all();
    const byOrder = new Map(existing.map((l) => [l.order, l.id]));
    let added = 0;
    let updated = 0;
    for (const [index, file] of files.entries()) {
      const lesson = parseLesson(join(root, slug, dir, file));
      const id = byOrder.get(index + 1);
      if (!id) {
        await db.orm.public.Lesson.create({ moduleId: module.id, order: index + 1, ...lesson });
        added++;
      } else if (force) {
        await db.orm.public.Lesson.where({ id }).update(lesson);
        updated++;
      }
    }
    let removed = 0;
    if (force) {
      for (const l of existing.filter((l) => l.order > files.length)) {
        await db.orm.public.Lesson.where({ id: l.id }).delete();
        removed++;
      }
    }
    console.log(`  module ${order} "${meta?.title ?? module.title}": ${files.length} files, ${added} added, ${updated} updated, ${removed} removed`);
  }
}

await db.close();
