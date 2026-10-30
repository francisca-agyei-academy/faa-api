import { rateLimit } from "express-rate-limit";
import { env } from "../config/env.js";

// In-memory counters: fine for a single instance. Use a shared store (e.g. Redis) if the API scales out.
function limiter(windowMinutes: number, limit: number, message: string, skipSuccessfulRequests = false) {
  return rateLimit({
    windowMs: windowMinutes * 60 * 1000,
    limit,
    skipSuccessfulRequests,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    skip: () => env.NODE_ENV === "test",
    handler: (_req, res, _next, options) => {
      res.status(options.statusCode).json({ error: { code: "RATE_LIMITED", message } });
    },
  });
}

// Counts failed logins only, so a user who gets in is never locked out by earlier typos.
export const loginLimiter = limiter(15, 10, "Too many failed login attempts. Try again in 15 minutes.", true);

export const registerLimiter = limiter(60, 5, "Too many accounts created from this IP. Try again in an hour.");

// Each of these sends an email, so keep them low to protect the Gmail sending quota.
export const emailLimiter = limiter(60, 5, "Too many email requests. Try again in an hour.");

export const tokenLimiter = limiter(15, 20, "Too many attempts. Try again in 15 minutes.");

// Generous: every open tab refreshes on load and every 15 minutes.
export const refreshLimiter = limiter(15, 120, "Too many refresh attempts. Try again in a few minutes.");
