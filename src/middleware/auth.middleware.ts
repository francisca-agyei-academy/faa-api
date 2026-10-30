import type { NextFunction, Request, Response } from "express";
import { AppError, forbidden, unauthorized } from "../lib/errors.js";
import { authenticate } from "../services/auth.service.js";
import type { Role } from "../types/auth.types.js";

export function bearerToken(req: Request): string | undefined {
  const header = req.headers.authorization;
  return header?.startsWith("Bearer ") ? header.slice("Bearer ".length).trim() : undefined;
}

export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const token = bearerToken(req);
  if (!token) return next(unauthorized());

  req.auth = await authenticate(token);
  next();
}

export function requireRole(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.auth) return next(unauthorized());
    if (!roles.includes(req.auth.role)) return next(forbidden());
    next();
  };
}

/** Use after requireAuth on routes unverified accounts may not use, such as buying a module. */
export function requireVerifiedEmail(req: Request, _res: Response, next: NextFunction) {
  if (!req.auth) return next(unauthorized());
  if (!req.auth.isEmailVerified) {
    return next(new AppError(403, "EMAIL_NOT_VERIFIED", "Verify your email address to continue"));
  }
  next();
}
