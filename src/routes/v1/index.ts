import { Router } from "express";
import adminRoutes from "./admin.routes.js";
import authRoutes from "./auth.routes.js";

export const v1Router = Router();

v1Router.use("/auth", authRoutes);
v1Router.use("/admin", adminRoutes);

// Future: v1Router.use("/courses", courseRoutes);
