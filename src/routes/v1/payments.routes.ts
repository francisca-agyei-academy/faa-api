import { Router, type Request, type Response } from "express";
import { logger } from "../../lib/logger.js";
import { isValidWebhookSignature } from "../../lib/paystack.js";
import { requireAuth, requireVerifiedEmail } from "../../middleware/auth.middleware.js";
import { paymentService } from "../../services/payment.service.js";

const router = Router();

// Start a checkout: returns Paystack's payment page URL. Students must have verified their email.
router.post("/checkout", requireAuth, requireVerifiedEmail, async (req, res) => {
  res.status(201).json(await paymentService.checkout(req.auth!.userId, req.body));
});

// After Paystack redirects back to the website, it asks the API to confirm the payment.
router.get("/verify/:reference", requireAuth, async (req, res) => {
  res.json(await paymentService.verifyForUser(req.auth!.userId, String(req.params.reference)));
});

export default router;

/**
 * Paystack webhook. Mounted in app.ts before the JSON parser because the signature covers
 * the raw request body. Always answers 200 quickly, as Paystack retries anything else.
 */
export async function paystackWebhook(req: Request, res: Response) {
  const raw = req.body as Buffer;
  if (!Buffer.isBuffer(raw) || !isValidWebhookSignature(raw, req.get("x-paystack-signature"))) {
    logger.warn({ event: "payment.webhook_rejected" }, "webhook with an invalid signature");
    return res.status(401).end();
  }
  res.status(200).end();

  let payload: { event?: string; data?: { reference?: string } };
  try {
    payload = JSON.parse(raw.toString("utf8"));
  } catch {
    return;
  }
  const reference = payload.data?.reference;
  if (payload.event === "charge.success" && reference) {
    paymentService.fulfil(reference, "webhook").catch((err) => {
      logger.error({ err, event: "payment.webhook_failed", reference }, "webhook fulfilment failed");
    });
  }
}
