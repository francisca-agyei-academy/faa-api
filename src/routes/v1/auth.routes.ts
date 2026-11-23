import { timingSafeEqual } from "node:crypto";
import { Router, type Request, type Response } from "express";
import { env, googleConfigured } from "../../config/env.js";
import {
  clearRefreshCookie,
  readRefreshCookie,
  setOAuthCookie,
  setRefreshCookie,
  takeOAuthCookie,
} from "../../lib/cookies.js";
import { AppError } from "../../lib/errors.js";
import { authorizationUrl, exchangeCode, GoogleAuthError, newAuthAttempt } from "../../lib/google.js";
import { logger } from "../../lib/logger.js";
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

/* ───────── Continue with Google ───────── */

const log = logger.child({ module: "auth" });

/** Only paths on the website, so ?next= can't send someone to another site. */
const safeNext = (next: unknown) =>
  typeof next === "string" && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next : null;

/** Back to the website's login page with a short error code it turns into a message. */
const toLogin = (res: Response, error: string) => res.redirect(`${env.APP_URL}/login?error=${error}`);

router.get("/google", (req, res) => {
  if (!googleConfigured) return toLogin(res, "google_unavailable");
  const { state, verifier, challenge } = newAuthAttempt();
  setOAuthCookie(res, { state, verifier, next: safeNext(req.query["next"]) });
  res.redirect(authorizationUrl(state, challenge));
});

router.get("/google/callback", loginLimiter, async (req, res) => {
  const attempt = takeOAuthCookie(req, res);
  if (!googleConfigured) return toLogin(res, "google_unavailable");
  // e.g. access_denied when the user backs out on Google's page.
  if (req.query["error"]) return toLogin(res, "google_cancelled");

  const state = typeof req.query["state"] === "string" ? req.query["state"] : "";
  const code = typeof req.query["code"] === "string" ? req.query["code"] : "";
  const stateOk =
    attempt !== null &&
    state.length === attempt.state.length &&
    timingSafeEqual(Buffer.from(state), Buffer.from(attempt.state));
  // No cookie or a different state: the attempt expired, or this request wasn't started by this browser.
  if (!stateOk || !code) {
    log.warn({ event: "auth.google_bad_state", ip: req.ip, hasAttempt: attempt !== null }, "google callback rejected: state mismatch");
    return toLogin(res, "google_expired");
  }

  try {
    const profile = await exchangeCode(code, attempt.verifier);
    const result = await authService.googleSignIn(profile, clientInfo(req));
    if (result.refreshToken) setRefreshCookie(res, result.refreshToken, result.user.role);
    const home = result.user.role === "ADMIN" ? "/admin" : "/dashboard";
    res.redirect(`${env.APP_URL}${attempt.next ?? home}`);
  } catch (err) {
    if (err instanceof GoogleAuthError) {
      log.warn({ event: "auth.google_failed", reason: err.message, ip: req.ip }, "google sign-in failed");
      return toLogin(res, err.code);
    }
    if (err instanceof AppError && err.code === "ACCOUNT_DISABLED") return toLogin(res, "account_disabled");
    if (err instanceof AppError && err.code === "GOOGLE_ACCOUNT_CONFLICT") return toLogin(res, "google_conflict");
    log.error({ err, ip: req.ip }, "google sign-in failed");
    toLogin(res, "google_failed");
  }
});

export default router;
