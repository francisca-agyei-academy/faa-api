import { createHash, randomBytes } from "node:crypto";

/**
 * A single-use token for an email link. The raw value goes in the link; only its
 * SHA-256 hash is stored, so a database leak does not hand out working links.
 */
export function createEmailToken(ttlMinutes: number) {
  const raw = randomBytes(32).toString("base64url");
  return {
    raw,
    hash: hashToken(raw),
    expiresAt: new Date(Date.now() + ttlMinutes * 60 * 1000),
  };
}

export function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}
