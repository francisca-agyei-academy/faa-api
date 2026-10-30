import { Router, type Request, type Response } from "express";
import { clearRefreshCookie, readRefreshCookie, setRefreshCookie } from "../../lib/cookies.js";
import { bearerToken, requireAuth } from "../../middleware/auth.middleware.js";
import {
  emailLimiter,
  loginLimiter,
  refreshLimiter,
  registerLimiter,
  tokenLimiter,
} from "../../middleware/rateLimit.middleware.js";
import { authenticate, authService } from "../../services/auth.service.js";
import type { AuthResponse, AuthResult } from "../../types/auth.types.js";

const router = Router();

// Same reply whether or not the email is registered.
const EMAIL_SENT_IF_EXISTS = { message: "If an account exists for that email, we've sent a link to it." };

const clientInfo = (req: Request) => ({ userAgent: req.get("user-agent"), ip: req.ip });

/** Puts the refresh token in the httpOnly cookie and the rest in the JSON body. */
function sendAuth(res: Response, result: AuthResult, status = 200) {
  if (result.refreshToken) setRefreshCookie(res, result.refreshToken, result.user.role);
  const body: AuthResponse = { user: result.user, accessToken: result.accessToken };
  res.status(status).json(body);
}

// Express 5 forwards rejected promises to the error handler, so no try/catch is needed.
router.post("/register", registerLimiter, async (req, res) => {
  sendAuth(res, await authService.register(req.body, clientInfo(req)), 201);
});

router.post("/login", loginLimiter, async (req, res) => {
  sendAuth(res, await authService.login(req.body, clientInfo(req)));
});

router.post("/refresh", refreshLimiter, async (req, res) => {
  try {
    sendAuth(res, await authService.refresh(readRefreshCookie(req)));
  } catch (err) {
    clearRefreshCookie(res); // a dead cookie should not be sent again
    throw err;
  }
});

router.post("/logout", async (req, res) => {
  await authService.logout(readRefreshCookie(req));
  clearRefreshCookie(res);
  res.status(204).end();
});

router.post("/logout-all", requireAuth, async (req, res) => {
  await authService.logoutAll(req.auth!.userId);
  clearRefreshCookie(res);
  res.status(204).end();
});

router.get("/me", requireAuth, async (req, res) => {
  const user = await authService.getById(req.auth!.userId);
  res.json({ user });
});

router.post("/verify-email", tokenLimiter, async (req, res) => {
  const user = await authService.verifyEmail(req.body);
  res.json({ user });
});

router.post("/resend-verification", emailLimiter, async (req, res) => {
  // Logged in: resend to the account's own address. Logged out: look it up by email.
  const token = bearerToken(req);
  if (token) {
    const { userId } = await authenticate(token);
    await authService.resendVerificationForUser(userId);
    return res.json({ message: "Verification email sent." });
  }
  await authService.resendVerification(req.body);
  res.json(EMAIL_SENT_IF_EXISTS);
});

router.post("/forgot-password", emailLimiter, async (req, res) => {
  await authService.forgotPassword(req.body);
  res.json(EMAIL_SENT_IF_EXISTS);
});

router.post("/reset-password", tokenLimiter, async (req, res) => {
  await authService.resetPassword(req.body);
  clearRefreshCookie(res);
  res.json({ message: "Password updated. You can now log in with your new password." });
});

router.post("/change-password", requireAuth, async (req, res) => {
  const result = await authService.changePassword(req.auth!.userId, req.auth!.sessionId, req.body);
  res.json({ message: "Password changed. Other sessions have been signed out.", ...result });
});

export default router;
