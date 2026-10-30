/**
 * Creates an admin account (verified, role ADMIN) and prints its password once.
 * If the email already exists, the account is made an admin and verified; its password
 * is left alone unless you pass --reset-password.
 *
 *   pnpm seed:admin                          # admin@faa.local, random password
 *   pnpm seed:admin you@example.com
 *   pnpm seed:admin you@example.com --reset-password
 */
import { randomBytes } from "node:crypto";
import bcrypt from "bcrypt";
import { db } from "../lib/db.js";

const args = process.argv.slice(2);
const email = (args.find((a) => !a.startsWith("--")) ?? "admin@faa.local").trim().toLowerCase();
const resetPassword = args.includes("--reset-password");

// 18 random bytes → 24 URL-safe characters, well inside bcrypt's 72-byte limit.
const newPassword = () => randomBytes(18).toString("base64url");

try {
  const existing = await db.orm.public.User.where({ email }).select("id", "tokenVersion").first();

  if (!existing) {
    const password = newPassword();
    await db.orm.public.User.create({
      email,
      password: await bcrypt.hash(password, 12),
      firstName: "FAA",
      lastName: "Admin",
      role: "ADMIN",
      isEmailVerified: true,
      emailVerifiedAt: new Date(),
    });
    console.log(`Created admin ${email}`);
    console.log(`Password: ${password}`);
    console.log("This is the only time it's shown. Save it now; run this script with --reset-password to get a new one.");
  } else {
    const password = resetPassword ? newPassword() : null;
    await db.orm.public.User.where({ id: existing.id }).update({
      role: "ADMIN",
      isEmailVerified: true,
      isActive: true,
      ...(password && {
        password: await bcrypt.hash(password, 12),
        // Signs out any existing sessions that used the old password.
        tokenVersion: existing.tokenVersion + 1,
      }),
    });
    console.log(`${email} already existed: it is now a verified admin.`);
    console.log(password ? `New password: ${password}` : "Password unchanged (pass --reset-password to set a new one).");
  }
} finally {
  await db.close();
}
