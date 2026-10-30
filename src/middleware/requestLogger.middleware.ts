import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { pinoHttp } from "pino-http";
import { logger } from "../lib/logger.js";

const REQUEST_ID_HEADER = "x-request-id";

/**
 * One log line per request, with method, path, status, duration and the user id once
 * authenticated. Also attaches `req.log` and echoes the request id as `X-Request-Id`
 * so a user's bug report can be matched to its log line.
 */
export const requestLogger = pinoHttp({
  logger,
  genReqId: (req: IncomingMessage, res: ServerResponse) => {
    // Accept an id from the client or a proxy (Railway), else make one.
    const incoming = req.headers[REQUEST_ID_HEADER];
    const id = typeof incoming === "string" && /^[\w-]{1,100}$/.test(incoming) ? incoming : randomUUID();
    res.setHeader("X-Request-Id", id);
    return id;
  },
  autoLogging: {
    // Health checks and Swagger's static files would drown out real traffic.
    ignore: (req) => req.url === "/health" || (req.url?.startsWith("/docs") ?? false),
  },
  customLogLevel: (_req, res, err) => {
    if (err || res.statusCode >= 500) return "error";
    if (res.statusCode >= 400) return "warn";
    return "info";
  },
  customSuccessMessage: (req, res, responseTime) =>
    `${req.method} ${req.url} ${res.statusCode} ${Math.round(responseTime)}ms`,
  // 500s carry the real error (set as res.err by the error handler), stack included.
  customErrorMessage: (req, res, err) => `${req.method} ${req.url} ${res.statusCode} ${err.message}`,
  customProps: (req) => {
    const auth = (req as { auth?: { userId: string } }).auth;
    return { reqId: req.id, ...(auth && { userId: auth.userId }) };
  },
  serializers: {
    req: (req) => ({
      method: req.method,
      url: req.url,
      // Express's req.ip honours "trust proxy", so it is the client, not Railway's proxy.
      ip: (req.raw as { ip?: string }).ip ?? req.remoteAddress,
      userAgent: req.headers["user-agent"],
    }),
    res: (res) => ({ statusCode: res.statusCode }),
  },
});
