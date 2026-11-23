import { randomBytes } from "node:crypto";
import bcrypt from "bcrypt";
import jwt, { type SignOptions } from "jsonwebtoken";
import { env } from "../config/env.js";
import { db } from "../lib/db.js";
import { AppError, badRequest, conflict, isUniqueViolation, unauthorized } from "../lib/errors.js";
import { logger } from "../lib/logger.js";
import { sendEmailInBackground } from "../lib/mailer.js";
import type { GoogleProfile } from "../lib/google.js";
import { createEmailToken, hashToken } from "../lib/tokens.js";
import {
  changePasswordSchema,
  emailOnlySchema,
  loginSchema,
  profileUpdateSchema,
  registerSchema,
  resetPasswordSchema,
  tokenSchema,
  type AuthResult,
  type AuthTokenPayload,
  type PublicUser,
} from "../types/auth.types.js";
import { passwordChangedEmail, passwordResetEmail, passwordSetEmail, verificationEmail } from "./email.templates.js";
import {
  createSession,
  revokeAllSessions,
  revokeSession,
  revokeSessionByToken,
  rotateSession,
  sessionIsActive,
  type ClientInfo,
} from "./session.service.js";

// Audit trail: every auth event has an `event` field, e.g. filter Railway logs on event:auth.login_failed.
const log = logger.child({ module: "auth" });

const BCRYPT_ROUNDS = 12;
const VERIFICATION_TTL_HOURS = 24;
const RESET_TTL_MINUTES = 30;

// Compared against when the email is unknown, so login takes the same time either way.
const DUMMY_HASH = bcrypt.hashSync("not-a-real-password", BCRYPT_ROUNDS);

const publicFields = [
  "id",
  "email",
  "firstName",
  "lastName",
  "phone",
  "role",
  "isEmailVerified",
  "hasPassword",
  "createdAt",
] as const;

function signAccessToken(user: Pick<PublicUser, "id" | "role">, tokenVersion: number, sessionId: string): string {
  const payload: AuthTokenPayload = { sub: user.id, role: user.role, ver: tokenVersion, sid: sessionId };
  return jwt.sign(payload, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN as SignOptions["expiresIn"],
  });
}

function decodeToken(token: string): AuthTokenPayload {
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET);
    if (
      typeof decoded === "string" ||
      typeof decoded.sub !== "string" ||
      typeof decoded["ver"] !== "number" ||
      typeof decoded["sid"] !== "string"
    ) {
      throw unauthorized("Invalid token");
    }
    return {
      sub: decoded.sub,
      role: decoded["role"] as AuthTokenPayload["role"],
      ver: decoded["ver"],
      sid: decoded["sid"],
    };
  } catch (err) {
    if (err instanceof AppError) throw err;
    // The frontend refreshes on this code rather than sending the user to the login page.
    throw new AppError(401, "TOKEN_EXPIRED", "Access token is invalid or expired");
  }
}

/**
 * Verifies the access token, then checks the account still exists and is active,
 * the token was not revoked by a password change, and its session was not logged out.
 */
export async function authenticate(token: string) {
  const payload = decodeToken(token);
  const [user, sessionActive] = await Promise.all([
    db.orm.public.User.where({ id: payload.sub })
      .select("id", "role", "isActive", "isEmailVerified", "tokenVersion")
      .first(),
    sessionIsActive(payload.sid, payload.sub),
  ]);

  if (!user || user.tokenVersion !== payload.ver || !sessionActive) {
    throw new AppError(401, "SESSION_EXPIRED", "Your session has expired. Please log in again.");
  }
  if (!user.isActive) throw new AppError(403, "ACCOUNT_DISABLED", "This account has been disabled");

  return { userId: user.id, role: user.role, isEmailVerified: user.isEmailVerified, sessionId: payload.sid };
}

/** Starts a session for a user who just proved who they are. */
async function startSession(user: PublicUser, tokenVersion: number, client: ClientInfo): Promise<AuthResult> {
  const { sessionId, refreshToken } = await createSession(user.id, client);
  return { user, accessToken: signAccessToken(user, tokenVersion, sessionId), refreshToken };
}

async function issueVerificationEmail(user: { id: string; email: string; firstName: string }) {
  const token = createEmailToken(VERIFICATION_TTL_HOURS * 60);
  await db.orm.public.User.where({ id: user.id }).update({
    emailVerificationToken: token.hash,
    emailVerificationExpiry: token.expiresAt,
  });
  sendEmailInBackground(verificationEmail(user.email, user.firstName, token.raw, VERIFICATION_TTL_HOURS));
}

async function register(body: unknown, client: ClientInfo): Promise<AuthResult> {
  const input = registerSchema.parse(body);

  const existing = await db.orm.public.User.where({ email: input.email }).select("id").first();
  if (existing) throw conflict("An account with this email already exists");

  const password = await bcrypt.hash(input.password, BCRYPT_ROUNDS);
  const verification = createEmailToken(VERIFICATION_TTL_HOURS * 60);

  let user: PublicUser;
  try {
    user = await db.orm.public.User.select(...publicFields).create({
      email: input.email,
      password,
      firstName: input.firstName,
      lastName: input.lastName,
      phone: input.phone ?? null,
      emailVerificationToken: verification.hash,
      emailVerificationExpiry: verification.expiresAt,
    });
  } catch (err) {
    // Two sign-ups with the same email can race past the check above.
    if (isUniqueViolation(err)) throw conflict("An account with this email already exists");
    throw err;
  }

  sendEmailInBackground(verificationEmail(user.email, user.firstName, verification.raw, VERIFICATION_TTL_HOURS));
  log.info({ event: "auth.register", userId: user.id, ip: client.ip }, "account created");
  return startSession(user, 0, client);
}

async function login(body: unknown, client: ClientInfo): Promise<AuthResult> {
  const input = loginSchema.parse(body);

  const account = await db.orm.public.User.where({ email: input.email })
    .select(...publicFields, "password", "isActive", "tokenVersion")
    .first();

  const passwordMatches = await bcrypt.compare(input.password, account?.password ?? DUMMY_HASH);
  if (!account || !passwordMatches) {
    // Repeated failures for one email or IP are the signal for a guessing attack.
    log.warn(
      { event: "auth.login_failed", email: input.email, userId: account?.id, ip: client.ip },
      account ? "login failed: wrong password" : "login failed: unknown email",
    );
    throw unauthorized("Invalid email or password");
  }
  if (!account.isActive) {
    log.warn({ event: "auth.login_blocked", userId: account.id, ip: client.ip }, "login blocked: account disabled");
    throw new AppError(403, "ACCOUNT_DISABLED", "This account has been disabled");
  }

  await db.orm.public.User.where({ id: account.id }).update({
    lastLoginAt: new Date(),
    lastLoginIp: client.ip ?? null,
  });

  const { password: _password, isActive: _isActive, tokenVersion, ...user } = account;
  log.info({ event: "auth.login", userId: user.id, ip: client.ip }, "logged in");
  return startSession(user, tokenVersion, client);
}

/** Trades the refresh cookie for a new access token, rotating the cookie. */
async function refresh(refreshToken: string | undefined): Promise<AuthResult> {
  if (!refreshToken) throw new AppError(401, "SESSION_EXPIRED", "You are not logged in");

  const { sessionId, userId, refreshToken: next } = await rotateSession(refreshToken);
  const account = await db.orm.public.User.where({ id: userId })
    .select(...publicFields, "isActive", "tokenVersion")
    .first();
  if (!account || !account.isActive) {
    await revokeSession(sessionId);
    throw new AppError(401, "SESSION_EXPIRED", "Your session has expired. Please log in again.");
  }

  const { isActive: _isActive, tokenVersion, ...user } = account;
  return { user, accessToken: signAccessToken(user, tokenVersion, sessionId), refreshToken: next };
}

async function logout(refreshToken: string | undefined): Promise<void> {
  if (refreshToken) await revokeSessionByToken(refreshToken);
}

/** Signs out every device, including any access tokens still within their 15 minutes. */
async function logoutAll(userId: string): Promise<void> {
  const user = await db.orm.public.User.where({ id: userId }).select("tokenVersion").first();
  if (!user) return;
  await db.orm.public.User.where({ id: userId }).update({ tokenVersion: user.tokenVersion + 1 });
  await revokeAllSessions(userId);
  log.info({ event: "auth.logout_all", userId }, "signed out of every device");
}

async function getById(userId: string): Promise<PublicUser> {
  const user = await db.orm.public.User.where({ id: userId }).select(...publicFields).first();
  if (!user) throw unauthorized("Account no longer exists");
  return user;
}

async function verifyEmail(body: unknown): Promise<PublicUser> {
  const { token } = tokenSchema.parse(body);

  const invalid = () => badRequest("This verification link is invalid or has expired. Request a new one.");

  const user = await db.orm.public.User.where({ emailVerificationToken: hashToken(token) })
    .select("id", "emailVerificationExpiry")
    .first();
  if (!user || !user.emailVerificationExpiry || user.emailVerificationExpiry < new Date()) throw invalid();

  const updated = await db.orm.public.User.where({ id: user.id })
    .select(...publicFields)
    .update({
      isEmailVerified: true,
      emailVerifiedAt: new Date(),
      emailVerificationToken: null,
      emailVerificationExpiry: null,
    });
  if (!updated) throw invalid();
  log.info({ event: "auth.email_verified", userId: updated.id }, "email verified");
  return updated;
}

/** Always resolves the same way, so the response never reveals whether an email is registered. */
async function resendVerification(body: unknown): Promise<void> {
  const { email } = emailOnlySchema.parse(body);
  const user = await db.orm.public.User.where({ email })
    .select("id", "email", "firstName", "isEmailVerified", "isActive")
    .first();
  if (!user || user.isEmailVerified || !user.isActive) return;
  await issueVerificationEmail(user);
}

/** Resends for the logged-in user, who already knows their own address. */
async function resendVerificationForUser(userId: string): Promise<void> {
  const user = await db.orm.public.User.where({ id: userId })
    .select("id", "email", "firstName", "isEmailVerified")
    .first();
  if (!user) throw unauthorized("Account no longer exists");
  if (user.isEmailVerified) throw badRequest("Your email address is already verified");
  await issueVerificationEmail(user);
}

/** Always resolves the same way, so the response never reveals whether an email is registered. */
async function forgotPassword(body: unknown): Promise<void> {
  const { email } = emailOnlySchema.parse(body);
  const user = await db.orm.public.User.where({ email }).select("id", "email", "firstName", "isActive").first();
  if (!user || !user.isActive) return;

  const token = createEmailToken(RESET_TTL_MINUTES);
  await db.orm.public.User.where({ id: user.id }).update({
    passwordResetToken: token.hash,
    passwordResetExpiry: token.expiresAt,
  });
  sendEmailInBackground(passwordResetEmail(user.email, user.firstName, token.raw, RESET_TTL_MINUTES));
  log.info({ event: "auth.password_reset_requested", userId: user.id }, "password reset requested");
}

async function resetPassword(body: unknown): Promise<void> {
  const input = resetPasswordSchema.parse(body);

  const user = await db.orm.public.User.where({ passwordResetToken: hashToken(input.token) })
    .select("id", "email", "firstName", "passwordResetExpiry", "tokenVersion")
    .first();
  if (!user || !user.passwordResetExpiry || user.passwordResetExpiry < new Date()) {
    throw badRequest("This reset link is invalid or has expired. Request a new one.");
  }

  await db.orm.public.User.where({ id: user.id }).update({
    password: await bcrypt.hash(input.password, BCRYPT_ROUNDS),
    passwordResetToken: null,
    passwordResetExpiry: null,
    tokenVersion: user.tokenVersion + 1,
    hasPassword: true,
    // Clicking a link sent to the inbox proves the user owns it.
    isEmailVerified: true,
  });
  await revokeAllSessions(user.id);
  sendEmailInBackground(passwordChangedEmail(user.email, user.firstName));
  log.info({ event: "auth.password_reset", userId: user.id }, "password reset; all sessions revoked");
}

/**
 * Changes the password, or sets the first one for an account made with Google (which has no
 * current password to ask for). Keeps the current session, signs out every other one, and
 * returns a fresh access token.
 */
async function changePassword(
  userId: string,
  sessionId: string,
  body: unknown,
): Promise<{ accessToken: string; user: PublicUser }> {
  const input = changePasswordSchema.parse(body);

  const user = await db.orm.public.User.where({ id: userId })
    .select("id", "email", "firstName", "role", "password", "tokenVersion", "hasPassword")
    .first();
  if (!user) throw unauthorized("Account no longer exists");
  const settingFirst = !user.hasPassword;
  if (!settingFirst) {
    if (!input.currentPassword || !(await bcrypt.compare(input.currentPassword, user.password))) {
      throw new AppError(400, "WRONG_PASSWORD", "Current password is incorrect");
    }
    if (input.currentPassword === input.newPassword) {
      throw badRequest("New password must be different from the current one");
    }
  }

  const tokenVersion = user.tokenVersion + 1;
  const updated = await db.orm.public.User.where({ id: user.id })
    .select(...publicFields)
    .update({
      password: await bcrypt.hash(input.newPassword, BCRYPT_ROUNDS),
      hasPassword: true,
      tokenVersion,
      passwordResetToken: null,
      passwordResetExpiry: null,
    });
  if (!updated) throw unauthorized("Account no longer exists");
  await revokeAllSessions(user.id, sessionId);
  sendEmailInBackground(
    settingFirst ? passwordSetEmail(user.email, user.firstName) : passwordChangedEmail(user.email, user.firstName),
  );
  log.info(
    { event: settingFirst ? "auth.password_set" : "auth.password_changed", userId: user.id },
    settingFirst ? "first password set; other sessions revoked" : "password changed; other sessions revoked",
  );
  return { accessToken: signAccessToken(user, tokenVersion, sessionId), user: updated };
}

/** Name and phone; the user is returned in the same shape as /auth/me. */
async function updateProfile(userId: string, body: unknown): Promise<PublicUser> {
  const input = profileUpdateSchema.parse(body);
  const user = await db.orm.public.User.where({ id: userId }).select(...publicFields).update(input);
  if (!user) throw unauthorized("Account no longer exists");
  log.info({ event: "auth.profile_updated", userId, fields: Object.keys(input) }, "profile updated");
  return user;
}

/**
 * Signs in with a Google identity, creating the account on first use.
 *
 * Accounts are matched by Google id, then by email. Matching by email links Google to an existing
 * password account. If that account's email was never confirmed, whoever chose its password may not
 * own the address (someone can register with another person's email), so the password is replaced
 * and every session ended: the Google sign-in proves who owns the email.
 */
async function googleSignIn(profile: GoogleProfile, client: ClientInfo): Promise<AuthResult> {
  const fields = [...publicFields, "isActive", "tokenVersion", "googleId"] as const;
  let account =
    (await db.orm.public.User.where({ googleId: profile.sub }).select(...fields).first()) ??
    (await db.orm.public.User.where({ email: profile.email }).select(...fields).first());

  if (account && account.googleId && account.googleId !== profile.sub) {
    // The email belongs to an account already tied to a different Google account.
    log.warn({ event: "auth.google_conflict", userId: account.id, ip: client.ip }, "google sign-in: email linked to another Google account");
    throw new AppError(409, "GOOGLE_ACCOUNT_CONFLICT", "This email is linked to a different Google account.");
  }

  if (!account) {
    const password = await bcrypt.hash(randomBytes(32).toString("base64url"), BCRYPT_ROUNDS);
    try {
      const created = await db.orm.public.User.select(...fields).create({
        email: profile.email,
        password,
        firstName: profile.firstName,
        lastName: profile.lastName,
        googleId: profile.sub,
        // The stored hash is random; the user sets a real password from Account settings if they want one.
        hasPassword: false,
        isEmailVerified: true,
        emailVerifiedAt: new Date(),
      });
      account = created;
      log.info({ event: "auth.register", method: "google", userId: created.id, ip: client.ip }, "account created with Google");
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
      // Two first sign-ins raced; the other one created it.
      account = await db.orm.public.User.where({ googleId: profile.sub }).select(...fields).first();
      if (!account) throw err;
    }
  } else if (!account.googleId) {
    const takeOver = !account.isEmailVerified;
    await db.orm.public.User.where({ id: account.id }).update({
      googleId: profile.sub,
      isEmailVerified: true,
      emailVerifiedAt: new Date(),
      emailVerificationToken: null,
      emailVerificationExpiry: null,
      ...(takeOver && {
        password: await bcrypt.hash(randomBytes(32).toString("base64url"), BCRYPT_ROUNDS),
        hasPassword: false,
        passwordResetToken: null,
        passwordResetExpiry: null,
        tokenVersion: account.tokenVersion + 1,
      }),
    });
    if (takeOver) await revokeAllSessions(account.id);
    log.info(
      { event: "auth.google_linked", userId: account.id, passwordReset: takeOver, ip: client.ip },
      takeOver ? "google linked to unverified account; old password and sessions removed" : "google linked to account",
    );
    account = {
      ...account,
      isEmailVerified: true,
      hasPassword: takeOver ? false : account.hasPassword,
      tokenVersion: account.tokenVersion + (takeOver ? 1 : 0),
    };
  }

  if (!account.isActive) {
    log.warn({ event: "auth.login_blocked", method: "google", userId: account.id, ip: client.ip }, "login blocked: account disabled");
    throw new AppError(403, "ACCOUNT_DISABLED", "This account has been disabled");
  }

  await db.orm.public.User.where({ id: account.id }).update({ lastLoginAt: new Date(), lastLoginIp: client.ip ?? null });
  const { isActive: _isActive, tokenVersion, googleId: _googleId, ...user } = account;
  log.info({ event: "auth.login", method: "google", userId: user.id, ip: client.ip }, "logged in with Google");
  return startSession(user, tokenVersion, client);
}

export const authService = {
  googleSignIn,
  updateProfile,
  register,
  login,
  refresh,
  logout,
  logoutAll,
  getById,
  verifyEmail,
  resendVerification,
  resendVerificationForUser,
  forgotPassword,
  resetPassword,
  changePassword,
};
