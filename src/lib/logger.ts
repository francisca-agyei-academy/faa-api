import { pino } from "pino";
import { env, isProduction } from "../config/env.js";

const pretty = env.LOG_PRETTY ?? !isProduction;

/**
 * App-wide logger. Inside a request handler prefer `req.log`, which carries the request id.
 * Production writes one JSON object per line to stdout, which Railway collects and searches.
 */
export const logger = pino({
  level: env.NODE_ENV === "test" ? "silent" : env.LOG_LEVEL,
  base: { service: "faa-api", env: env.NODE_ENV },
  // Never write secrets, wherever they appear in a logged object.
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      'res.headers["set-cookie"]',
      "*.password",
      "*.currentPassword",
      "*.newPassword",
      "*.token",
      "*.accessToken",
      "*.refreshToken",
      "*.DATABASE_URL",
      "*.JWT_SECRET",
    ],
    censor: "[redacted]",
  },
  ...(pretty && {
    transport: {
      target: "pino-pretty",
      // The message already says "POST /path 401 12ms"; the req/res detail stays in production JSON.
      options: {
        colorize: true,
        translateTime: "HH:MM:ss.l",
        ignore: "pid,hostname,service,env,req,res,responseTime",
        singleLine: true,
      },
    },
  }),
});
