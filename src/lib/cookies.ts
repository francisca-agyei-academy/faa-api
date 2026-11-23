import type { CookieOptions, Request, Response } from "express";
import { env, isProduction } from "../config/env.js";
import type { Role } from "../types/auth.types.js";

export const REFRESH_COOKIE = "faa_refresh";

/**
 * Not a credential: holds only the role, so the website's proxy can redirect logged-out
 * visitors (and non-admins) before a page renders. The refresh cookie can't serve that
 * purpose because it is scoped to the auth routes. Every real check happens in the API.
 */
export const SESSION_HINT_COOKIE = "faa_session";

const shared: CookieOptions = {
  httpOnly: true,
  secure: env.COOKIE_SECURE ?? isProduction,
  sameSite: env.COOKIE_SAMESITE,
  domain: env.COOKIE_DOMAIN,
};

// Scoped to the auth routes: the browser never sends it with ordinary API calls.
const refreshOptions: CookieOptions = { ...shared, path: "/api/v1/auth" };
const hintOptions: CookieOptions = { ...shared, path: "/" };

export function setRefreshCookie(res: Response, token: string, role: Role) {
  const maxAge = env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000;
  res.cookie(REFRESH_COOKIE, token, { ...refreshOptions, maxAge });
  res.cookie(SESSION_HINT_COOKIE, role, { ...hintOptions, maxAge });
}

export function clearRefreshCookie(res: Response) {
  res.clearCookie(REFRESH_COOKIE, refreshOptions);
  res.clearCookie(SESSION_HINT_COOKIE, hintOptions);
}

export function readRefreshCookie(req: Request): string | undefined {
  const value: unknown = req.cookies?.[REFRESH_COOKIE];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

/* ───────── Google sign-in attempt ───────── */

const OAUTH_COOKIE = "faa_google";
// Lax, whatever COOKIE_SAMESITE says: the browser must send it on the redirect back from Google.
const oauthOptions: CookieOptions = { ...shared, sameSite: "lax", path: "/api/v1/auth/google" };

export interface OAuthAttempt {
  state: string;
  verifier: string;
  next: string | null;
}

/** Holds the state and PKCE verifier for the 10 minutes a Google sign-in may take. */
export function setOAuthCookie(res: Response, attempt: OAuthAttempt) {
  res.cookie(OAUTH_COOKIE, JSON.stringify(attempt), { ...oauthOptions, maxAge: 10 * 60 * 1000 });
}

export function takeOAuthCookie(req: Request, res: Response): OAuthAttempt | null {
  res.clearCookie(OAUTH_COOKIE, oauthOptions);
  const value: unknown = req.cookies?.[OAUTH_COOKIE];
  if (typeof value !== "string") return null;
  try {
    const parsed = JSON.parse(value) as Partial<OAuthAttempt>;
    if (typeof parsed.state !== "string" || typeof parsed.verifier !== "string") return null;
    return { state: parsed.state, verifier: parsed.verifier, next: typeof parsed.next === "string" ? parsed.next : null };
  } catch {
    return null;
  }
}
