import { db } from "../lib/db.js";
try {
  const u = await db.orm.public.User.where({ email: process.argv[2]! }).select("id").first();
  const orders = await db.orm.public.Order.where({ userId: u!.id }).select("reference", "amount", "status", "moduleId", "courseId").all();
  for (const o of orders) console.log(o.reference, "amount", o.amount, o.status, o.moduleId ? "module" : o.courseId ? "course" : "?");
} finally { await db.close(); }
