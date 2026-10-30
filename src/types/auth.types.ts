import { z } from "zod";

const emailSchema = z.email().transform((email) => email.trim().toLowerCase());

// bcrypt only reads the first 72 bytes, so longer passwords are refused rather than silently truncated.
const passwordSchema = z.string().min(8, "Password must be at least 8 characters").max(72);

export const registerSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  phone: z.string().trim().min(7).max(20).optional(),
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1),
});

export const emailOnlySchema = z.object({ email: emailSchema });

export const tokenSchema = z.object({ token: z.string().min(1).max(200) });

export const resetPasswordSchema = z.object({
  token: z.string().min(1).max(200),
  password: passwordSchema,
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: passwordSchema,
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;

export type Role = "STUDENT" | "ADMIN";

export interface AuthTokenPayload {
  sub: string;
  role: Role;
  /** Must equal the user's tokenVersion; bumping it revokes every older token. */
  ver: number;
  /** The Session this access token belongs to; logging that session out revokes it. */
  sid: string;
}

export interface PublicUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  role: Role;
  isEmailVerified: boolean;
  createdAt: Date;
}

/** JSON body of login, register and refresh. The refresh token travels only in the cookie. */
export interface AuthResponse {
  user: PublicUser;
  accessToken: string;
}

/** What the service hands the route: the route moves `refreshToken` into the cookie. */
export interface AuthResult extends AuthResponse {
  /** null when the cookie should be left as it is (lost a two-tab refresh race). */
  refreshToken: string | null;
}

declare global {
  namespace Express {
    interface Request {
      auth?: { userId: string; role: Role; isEmailVerified: boolean; sessionId: string };
    }
  }
}
