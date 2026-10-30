/**
 * Gives an existing account admin access (or takes it away).
 * The account must already be registered on the website.
 *
 *   pnpm admin:promote you@example.com
 *   pnpm admin:promote you@example.com --demote
 */
import { db } from "../lib/db.js";

const [email, flag] = process.argv.slice(2);

if (!email) {
  console.error("Usage: pnpm admin:promote <email> [--demote]");
  process.exit(1);
}

const role = flag === "--demote" ? "STUDENT" : "ADMIN";

try {
  const user = await db.orm.public.User.where({ email: email.trim().toLowerCase() })
    .select("id", "email", "firstName", "lastName", "role")
    .update({ role });
  if (!user) {
    console.error(`No account found for ${email}. Register on the website first, then run this again.`);
    process.exitCode = 1;
  } else {
    console.log(`${user.firstName} ${user.lastName} <${user.email}> is now ${user.role}.`);
    console.log("Log out and back in (or wait for the next token refresh) to see the admin panel.");
  }
} finally {
  await db.close();
}
