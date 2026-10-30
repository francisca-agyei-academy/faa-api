import type { NextFunction, Request, Response } from "express";

export function versionMiddleware(_req: Request, res: Response, next: NextFunction) {
  res.setHeader("API-Version", "v1");
  next();
}
