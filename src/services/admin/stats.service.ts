import { db } from "../../lib/db.js";

function startOfMonth() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

/** Headline numbers plus the latest activity for the admin dashboard. */
async function overview() {
  const monthStart = startOfMonth();

  const [students, unverified, courses, publishedCourses, paidThisMonth, pendingOrders, recentOrders, recentStudents] =
    await Promise.all([
      db.orm.public.User.where({ role: "STUDENT" }).aggregate((a) => ({ n: a.count() })),
      db.orm.public.User.where({ role: "STUDENT", isEmailVerified: false }).aggregate((a) => ({ n: a.count() })),
      db.orm.public.Course.aggregate((a) => ({ n: a.count() })),
      db.orm.public.Course.where({ isPublished: true }).aggregate((a) => ({ n: a.count() })),
      db.orm.public.Order.where({ status: "SUCCESS" })
        .where((o) => o.paidAt.gte(monthStart))
        .aggregate((a) => ({ n: a.count(), revenue: a.sum("amount") })),
      db.orm.public.Order.where({ status: "PENDING" }).aggregate((a) => ({ n: a.count() })),
      db.orm.public.Order.select("id", "reference", "amount", "currency", "status", "createdAt")
        .include("user", (user) => user.select("id", "email", "firstName", "lastName"))
        .orderBy((o) => o.createdAt.desc())
        .limit(5)
        .all(),
      db.orm.public.User.where({ role: "STUDENT" })
        .select("id", "email", "firstName", "lastName", "isEmailVerified", "createdAt")
        .orderBy((u) => u.createdAt.desc())
        .limit(5)
        .all(),
    ]);

  return {
    students: students.n,
    unverifiedStudents: unverified.n,
    courses: courses.n,
    publishedCourses: publishedCourses.n,
    ordersThisMonth: paidThisMonth.n,
    revenueThisMonth: paidThisMonth.revenue ?? 0,
    pendingOrders: pendingOrders.n,
    recentOrders,
    recentStudents,
  };
}

export const adminStatsService = { overview };
