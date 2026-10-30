import { docsEnabled, env } from "./config/env.js";
import { createApp } from "./app.js";
import { db } from "./lib/db.js";
import { logger } from "./lib/logger.js";

const app = createApp();

const server = app.listen(env.PORT, () => {
  logger.info({ port: env.PORT }, `API running on http://localhost:${env.PORT}`);
  if (docsEnabled) logger.info(`Docs: http://localhost:${env.PORT}/docs`);
});

// Railway sends SIGTERM on redeploy: finish in-flight requests, then close the DB pool.
let shuttingDown = false;
function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, "shutting down");

  const forceExit = setTimeout(() => {
    logger.error("shutdown timed out after 10s; exiting");
    process.exit(1);
  }, 10_000);
  forceExit.unref();

  server.close(async () => {
    await db.close();
    logger.info("shutdown complete");
    process.exit(0);
  });
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

process.on("unhandledRejection", (reason) => {
  logger.error({ err: reason }, "unhandled promise rejection");
});
process.on("uncaughtException", (err) => {
  logger.fatal({ err }, "uncaught exception; exiting");
  process.exit(1);
});
