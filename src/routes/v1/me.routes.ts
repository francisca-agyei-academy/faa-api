import { Router } from "express";
import { requireAuth } from "../../middleware/auth.middleware.js";
import { paymentService } from "../../services/payment.service.js";

const router = Router();

router.use(requireAuth);

// Modules the student has bought, with access dates.
router.get("/purchases", async (req, res) => {
  res.json({ purchases: await paymentService.myPurchases(req.auth!.userId) });
});

// A bought module's content link; refused when the purchase is missing or expired.
router.get("/modules/:id", async (req, res) => {
  res.json({ module: await paymentService.moduleContent(req.auth!.userId, req.auth!.role, req.params.id) });
});

export default router;
