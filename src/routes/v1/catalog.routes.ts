import { Router } from "express";
import { catalogService } from "../../services/catalog.service.js";

const router = Router();

// Public: what the website shows. Browsers and CDNs may cache it briefly.
router.get("/", async (_req, res) => {
  res.set("Cache-Control", "public, max-age=30");
  res.json({ courses: await catalogService.list() });
});

router.get("/:slug", async (req, res) => {
  res.set("Cache-Control", "public, max-age=30");
  res.json({ course: await catalogService.getBySlug(req.params.slug) });
});

export default router;
