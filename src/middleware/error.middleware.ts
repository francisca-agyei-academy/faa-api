import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { isProduction } from "../config/env.js";
import { AppError, isUniqueViolation } from "../lib/errors.js";

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      error: { code: err.code, message: err.message, details: err.details },
    });
  }

  if (err instanceof ZodError) {
    return res.status(400).json({
      error: {
        code: "VALIDATION_FAILED",
        message: "Request body is invalid",
        details: err.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })),
      },
    });
  }

  // express.json() rejects malformed JSON with this type.
  if (typeof err === "object" && err !== null && (err as { type?: string }).type === "entity.parse.failed") {
    return res.status(400).json({ error: { code: "INVALID_JSON", message: "Request body is not valid JSON" } });
  }

  if (isUniqueViolation(err)) {
    return res.status(409).json({ error: { code: "CONFLICT", message: "Resource already exists" } });
  }

  // Unexpected. Handing the error to pino-http logs it, stack included, on this request's
  // single access line; the request id goes to the client so a bug report can be traced to it.
  res.err = err instanceof Error ? err : new Error(String(err));
  res.status(500).json({
    error: {
      code: "INTERNAL_ERROR",
      message: isProduction ? "Something went wrong" : String((err as Error)?.message ?? err),
      requestId: req.id,
    },
  });
}
