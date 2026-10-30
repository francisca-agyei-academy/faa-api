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
