import { Router } from "express";
import { requireAuth } from "../../middleware/auth.middleware.js";
import { authService } from "../../services/auth.service.js";
import { paymentService } from "../../services/payment.service.js";

const router = Router();

router.use(requireAuth);

// Edit your own name and phone number.
router.patch("/profile", async (req, res) => {
  res.json({ user: await authService.updateProfile(req.auth!.userId, req.body) });
});

// Modules the student has bought, with access dates.
router.get("/purchases", async (req, res) => {
  res.json({ purchases: await paymentService.myPurchases(req.auth!.userId) });
});

// A bought module's content link; refused when the purchase is missing or expired.
router.get("/modules/:id", async (req, res) => {
  res.json({ module: await paymentService.moduleContent(req.auth!.userId, req.auth!.role, req.params.id) });
});

// Mark a lesson completed (PUT) or not (DELETE); returns the module's completed lesson ids.
router.put("/lessons/:id/completed", async (req, res) => {
  res.json(await paymentService.setLessonCompleted(req.auth!.userId, req.auth!.role, req.params.id, true));
});
router.delete("/lessons/:id/completed", async (req, res) => {
  res.json(await paymentService.setLessonCompleted(req.auth!.userId, req.auth!.role, req.params.id, false));
});

export default router;
