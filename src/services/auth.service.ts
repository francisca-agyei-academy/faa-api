import bcrypt from "bcrypt";
import jwt, { type SignOptions } from "jsonwebtoken";
import { env } from "../config/env.js";
import { db } from "../lib/db.js";
import { AppError, badRequest, conflict, isUniqueViolation, unauthorized } from "../lib/errors.js";
import { logger } from "../lib/logger.js";
import { sendEmailInBackground } from "../lib/mailer.js";
import { createEmailToken, hashToken } from "../lib/tokens.js";
import {
  changePasswordSchema,
  emailOnlySchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
  tokenSchema,
  type AuthResult,
  type AuthTokenPayload,
  type PublicUser,
} from "../types/auth.types.js";
import { passwordChangedEmail, passwordResetEmail, verificationEmail } from "./email.templates.js";
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
    // Clicking a link sent to the inbox proves the user owns it.
    isEmailVerified: true,
  });
  await revokeAllSessions(user.id);
  sendEmailInBackground(passwordChangedEmail(user.email, user.firstName));
  log.info({ event: "auth.password_reset", userId: user.id }, "password reset; all sessions revoked");
}

/** Keeps the current session, signs out every other one, and returns a fresh access token. */
async function changePassword(userId: string, sessionId: string, body: unknown): Promise<{ accessToken: string }> {
  const input = changePasswordSchema.parse(body);

  const user = await db.orm.public.User.where({ id: userId })
    .select("id", "email", "firstName", "role", "password", "tokenVersion")
    .first();
  if (!user) throw unauthorized("Account no longer exists");
  if (!(await bcrypt.compare(input.currentPassword, user.password))) {
    throw new AppError(400, "WRONG_PASSWORD", "Current password is incorrect");
  }
  if (input.currentPassword === input.newPassword) {
    throw badRequest("New password must be different from the current one");
  }

  const tokenVersion = user.tokenVersion + 1;
  await db.orm.public.User.where({ id: user.id }).update({
    password: await bcrypt.hash(input.newPassword, BCRYPT_ROUNDS),
    tokenVersion,
    passwordResetToken: null,
    passwordResetExpiry: null,
  });
  await revokeAllSessions(user.id, sessionId);
  sendEmailInBackground(passwordChangedEmail(user.email, user.firstName));
  log.info({ event: "auth.password_changed", userId: user.id }, "password changed; other sessions revoked");
  return { accessToken: signAccessToken(user, tokenVersion, sessionId) };
}

export const authService = {
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
