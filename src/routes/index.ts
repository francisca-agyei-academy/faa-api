import { Router } from "express";
import { versionMiddleware } from "../middleware/version.middleware.js";
import { v1Router } from "./v1/index.js";

export const apiRouter = Router();

apiRouter.use("/v1", versionMiddleware, v1Router);

// Future: apiRouter.use("/v2", v2Router);
