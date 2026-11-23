import { createHash, randomBytes } from "node:crypto";
import { env, googleRedirectUri } from "../config/env.js";

/** What we use from Google's ID token. */
export interface GoogleProfile {
  sub: string;
  email: string;
  firstName: string;
  lastName: string;
}

export class GoogleAuthError extends Error {
  constructor(
    /** Shown to the website as ?error=…, so it is a short code, not a message. */
    readonly code: "google_cancelled" | "google_failed" | "google_unverified_email",
    message: string,
  ) {
    super(message);
  }
}

/** A fresh state and PKCE pair for one sign-in attempt. */
export function newAuthAttempt() {
  const state = randomBytes(24).toString("base64url");
  const verifier = randomBytes(48).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { state, verifier, challenge };
}

/** Google's consent page for this attempt. */
export function authorizationUrl(state: string, challenge: string) {
  const params = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID!,
    redirect_uri: googleRedirectUri,
    response_type: "code",
    scope: "openid email profile",
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
    // Lets someone with several Google accounts pick which one to use.
    prompt: "select_account",
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

/**
 * Trades the code Google sent back for the user's identity.
 *
 * The ID token comes straight from Google's token endpoint over TLS, authenticated with our client
 * secret, so per OpenID Connect Core §3.1.3.7 its signature need not be checked again; the
 * issuer, audience and expiry still are.
 */
export async function exchangeCode(code: string, verifier: string): Promise<GoogleProfile> {
  let res: Response;
  try {
    res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: env.GOOGLE_CLIENT_ID!,
        client_secret: env.GOOGLE_CLIENT_SECRET!,
        redirect_uri: googleRedirectUri,
        grant_type: "authorization_code",
        code_verifier: verifier,
      }),
      signal: AbortSignal.timeout(15_000),
    });
  } catch (err) {
    throw new GoogleAuthError("google_failed", `Google unreachable: ${(err as Error).message}`);
  }
  const body = (await res.json().catch(() => null)) as { id_token?: string; error?: string; error_description?: string } | null;
  if (!res.ok || !body?.id_token) {
    throw new GoogleAuthError("google_failed", `Google token exchange failed: ${res.status} ${body?.error ?? ""} ${body?.error_description ?? ""}`);
  }

  const [, payload] = body.id_token.split(".");
  let claims: Record<string, unknown>;
  try {
    claims = JSON.parse(Buffer.from(payload ?? "", "base64url").toString("utf8")) as Record<string, unknown>;
  } catch {
    throw new GoogleAuthError("google_failed", "Google ID token could not be read");
  }

  const issuerOk = claims["iss"] === "https://accounts.google.com" || claims["iss"] === "accounts.google.com";
  const audienceOk = claims["aud"] === env.GOOGLE_CLIENT_ID;
  const notExpired = typeof claims["exp"] === "number" && claims["exp"] * 1000 > Date.now();
  if (!issuerOk || !audienceOk || !notExpired || typeof claims["sub"] !== "string" || typeof claims["email"] !== "string") {
    throw new GoogleAuthError("google_failed", "Google ID token failed validation");
  }
  // Only an address Google has confirmed may sign in to (or take over) an account with that email.
  if (claims["email_verified"] !== true) {
    throw new GoogleAuthError("google_unverified_email", "Google says this email address isn't verified");
  }

  const str = (key: string) => (typeof claims[key] === "string" ? (claims[key] as string).trim() : "");
  const email = str("email").toLowerCase();
  const fallbackName = str("name") || email.split("@")[0]!;
  return {
    sub: claims["sub"],
    email,
    firstName: (str("given_name") || fallbackName).slice(0, 100),
    lastName: str("family_name").slice(0, 100),
  };
}
