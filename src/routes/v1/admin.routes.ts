import { Router } from "express";
import { requireAuth, requireRole } from "../../middleware/auth.middleware.js";
import { adminCourseService as courses } from "../../services/admin/course.service.js";
import { adminOrderService as orders } from "../../services/admin/order.service.js";
import { adminStatsService as stats } from "../../services/admin/stats.service.js";
import { adminStudentService as students } from "../../services/admin/student.service.js";

const router = Router();

// Every admin route needs a logged-in ADMIN; the role is read from the database on each request.
router.use(requireAuth, requireRole("ADMIN"));

const adminId = (req: Express.Request) => req.auth!.userId;

router.get("/stats", async (_req, res) => {
  res.json(await stats.overview());
});

// Courses and modules
router.get("/courses", async (_req, res) => {
  res.json({ courses: await courses.list() });
});
router.post("/courses", async (req, res) => {
  res.status(201).json({ course: await courses.create(req.body, adminId(req)) });
});
router.get("/courses/:id", async (req, res) => {
  res.json({ course: await courses.get(req.params.id) });
});
router.patch("/courses/:id", async (req, res) => {
  res.json({ course: await courses.update(req.params.id, req.body, adminId(req)) });
});
router.delete("/courses/:id", async (req, res) => {
  await courses.remove(req.params.id, adminId(req));
  res.status(204).end();
});
router.post("/courses/:id/modules", async (req, res) => {
  res.status(201).json({ module: await courses.createModule(req.params.id, req.body, adminId(req)) });
});
router.patch("/modules/:id", async (req, res) => {
  res.json({ module: await courses.updateModule(req.params.id, req.body, adminId(req)) });
});
router.delete("/modules/:id", async (req, res) => {
  await courses.removeModule(req.params.id, adminId(req));
  res.status(204).end();
});
router.post("/modules/:id/move", async (req, res) => {
  res.json(await courses.moveModule(req.params.id, req.body));
});

// Students
router.get("/students", async (req, res) => {
  res.json(await students.list(req.query));
});
router.get("/students/:id", async (req, res) => {
  res.json({ student: await students.get(req.params.id) });
});
router.patch("/students/:id", async (req, res) => {
  res.json({ student: await students.update(req.params.id, req.body, adminId(req)) });
});

// Orders
router.get("/orders", async (req, res) => {
  res.json(await orders.list(req.query));
});
router.get("/orders/:id", async (req, res) => {
  res.json({ order: await orders.get(req.params.id) });
});

export default router;
