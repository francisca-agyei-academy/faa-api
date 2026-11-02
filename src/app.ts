import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import swaggerUi from "swagger-ui-express";
import { docsEnabled, env } from "./config/env.js";
import { forbidden } from "./lib/errors.js";
import { errorHandler } from "./middleware/error.middleware.js";
import { notFoundHandler } from "./middleware/notFound.middleware.js";
import { requestLogger } from "./middleware/requestLogger.middleware.js";
import { apiRouter } from "./routes/index.js";
import { paystackWebhook } from "./routes/v1/payments.routes.js";
import { openapiSpec } from "./swagger/openapi.js";

export function createApp() {
  const app = express();
  app.set("trust proxy", 1); // Railway sits behind one proxy; makes req.ip the client's IP

  // 0. Request logging and X-Request-Id, first so every response is logged
  app.use(requestLogger);

  // 1. Swagger docs (off in production unless ENABLE_DOCS=true). Mounted before helmet,
  //    whose default CSP blocks Swagger UI's inline scripts.
  if (docsEnabled) {
    app.use("/docs", helmet({ contentSecurityPolicy: false }), swaggerUi.serve, swaggerUi.setup(openapiSpec));
  }

  // 2. Security headers
  app.use(helmet());

  // 3. CORS — explicit allowlist, never wildcard in production. Rejecting unknown
  //    origins here is also the CSRF guard for the cookie-based /auth/refresh and /auth/logout.
  //    Swagger UI's own origin is allowed so "Try it out" works.
  const allowedOrigins = docsEnabled
    ? [...env.ALLOWED_ORIGINS, `http://localhost:${env.PORT}`]
    : env.ALLOWED_ORIGINS;
  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin || allowedOrigins.includes(origin)) {
          callback(null, true);
        } else {
          callback(forbidden(`Origin ${origin} is not allowed`));
        }
      },
      methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
      allowedHeaders: ["Content-Type", "Authorization"],
      credentials: true,
      maxAge: 600,
    }),
  );

  // 4. Paystack webhook needs the raw body to check its signature, so it goes before the JSON parser.
  app.post("/api/v1/payments/webhook", express.raw({ type: "application/json", limit: "1mb" }), paystackWebhook);

  // 5. Body and cookie parsing
  app.use(express.json({ limit: "1mb" }));
  app.use(cookieParser());

  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  // 5. Versioned API routes (/api/v1/..., API-Version header set per version)
  app.use("/api", apiRouter);

  // 6. 404 and error handling (must be last)
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
