import { Router } from "express";
import adminRoutes from "./admin.routes.js";
import authRoutes from "./auth.routes.js";
import catalogRoutes from "./catalog.routes.js";
import meRoutes from "./me.routes.js";
import paymentRoutes from "./payments.routes.js";

export const v1Router = Router();

v1Router.use("/auth", authRoutes);
v1Router.use("/courses", catalogRoutes);
v1Router.use("/payments", paymentRoutes);
v1Router.use("/me", meRoutes);
v1Router.use("/admin", adminRoutes);
