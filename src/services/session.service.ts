import { randomBytes } from "node:crypto";
import { env } from "../config/env.js";
import { db } from "../lib/db.js";
import { AppError } from "../lib/errors.js";
import { logger } from "../lib/logger.js";
import { hashToken } from "../lib/tokens.js";

// Two tabs refreshing at once both present the same cookie; the slower one is let
// through for this long after the rotation instead of being treated as a stolen token.
const ROTATION_GRACE_MS = 30 * 1000;

export interface ClientInfo {
  userAgent?: string | undefined;
  ip?: string | undefined;
}

const newRefreshToken = () => randomBytes(32).toString("base64url");
const expiryFromNow = () => new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);
const sessionExpired = () =>
  new AppError(401, "SESSION_EXPIRED", "Your session has expired. Please log in again.");

export async function createSession(userId: string, client: ClientInfo) {
  // Opportunistic cleanup: drop this user's expired sessions.
  await db.orm.public.Session.where({ userId })
    .where((s) => s.expiresAt.lt(new Date()))
    .deleteAll();

  const refreshToken = newRefreshToken();
  const now = new Date();
  const session = await db.orm.public.Session.select("id").create({
    userId,
    tokenHash: hashToken(refreshToken),
    expiresAt: expiryFromNow(),
    lastUsedAt: now,
    userAgent: client.userAgent?.slice(0, 500) ?? null,
    ip: client.ip ?? null,
  });
  return { sessionId: session.id, refreshToken };
}

/**
 * Exchanges a refresh token for a new one (rotation). Returns `refreshToken: null` when
 * the request lost a two-tab race: the winner already set the new cookie.
 * Presenting a token that was rotated out longer ago means it was copied, so the
 * whole session is revoked.
 */
export async function rotateSession(refreshToken: string) {
  const presentedHash = hashToken(refreshToken);
  const now = new Date();

  const current = await db.orm.public.Session.where({ tokenHash: presentedHash })
    .select("id", "userId", "expiresAt")
    .first();

  if (current) {
    if (current.expiresAt < now) {
      await db.orm.public.Session.where({ id: current.id }).delete();
      throw sessionExpired();
    }
    const next = newRefreshToken();
    // Matching on the old hash too makes the rotation atomic: of two concurrent
    // refreshes, only one update succeeds.
    const rotated = await db.orm.public.Session.where({ id: current.id, tokenHash: presentedHash })
      .select("id")
      .update({
        tokenHash: hashToken(next),
        previousTokenHash: presentedHash,
        rotatedAt: now,
        lastUsedAt: now,
        expiresAt: expiryFromNow(),
      });
    if (rotated) return { sessionId: current.id, userId: current.userId, refreshToken: next };
  }

  const previous = await db.orm.public.Session.where({ previousTokenHash: presentedHash })
    .select("id", "userId", "rotatedAt")
    .first();
  if (!previous) throw sessionExpired();

  if (previous.rotatedAt && now.getTime() - previous.rotatedAt.getTime() <= ROTATION_GRACE_MS) {
    return { sessionId: previous.id, userId: previous.userId, refreshToken: null };
  }

  await db.orm.public.Session.where({ id: previous.id }).delete();
  logger.warn(
    { event: "auth.refresh_reuse", userId: previous.userId, sessionId: previous.id },
    "refresh token reuse detected; session revoked",
  );
  throw new AppError(401, "SESSION_REVOKED", "This session was signed out for your security. Please log in again.");
}

export async function sessionIsActive(sessionId: string, userId: string): Promise<boolean> {
  const session = await db.orm.public.Session.where({ id: sessionId, userId }).select("expiresAt").first();
  return session !== null && session.expiresAt > new Date();
}

export async function revokeSessionByToken(refreshToken: string): Promise<void> {
  const hash = hashToken(refreshToken);
  await db.orm.public.Session.where({ tokenHash: hash }).deleteAll();
  await db.orm.public.Session.where({ previousTokenHash: hash }).deleteAll();
}

export async function revokeSession(sessionId: string): Promise<void> {
  await db.orm.public.Session.where({ id: sessionId }).deleteAll();
}

export async function revokeAllSessions(userId: string, exceptSessionId?: string): Promise<void> {
  const sessions = db.orm.public.Session.where({ userId });
  if (exceptSessionId) {
    await sessions.where((s) => s.id.neq(exceptSessionId)).deleteAll();
  } else {
    await sessions.deleteAll();
  }
}
