// The API contract served at /docs. Add each new endpoint to `paths`.
const errorResponse = {
  type: "object",
  properties: {
    error: {
      type: "object",
      properties: {
        code: { type: "string", example: "VALIDATION_FAILED" },
        message: { type: "string" },
        details: {},
      },
      required: ["code", "message"],
    },
  },
};

const jsonError = (description: string) => ({
  description,
  content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
});

const jsonBody = (properties: Record<string, object>, required: string[]) => ({
  required: true,
  content: { "application/json": { schema: { type: "object", required, properties } } },
});

const messageResponse = (description: string) => ({
  description,
  content: {
    "application/json": { schema: { type: "object", properties: { message: { type: "string" } } } },
  },
});

const rateLimited = jsonError("Too many requests (RATE_LIMITED)");

const authResult = {
  description: "Authenticated",
  content: { "application/json": { schema: { $ref: "#/components/schemas/AuthResponse" } } },
};

export const openapiSpec = {
  openapi: "3.0.3",
  info: {
    title: "Gradvane Global API",
    version: "1.0.0",
    description: "Courses, modules and Paystack payments for the Gradvane Global learning platform.",
  },
  servers: [{ url: "/api/v1" }],
  tags: [{ name: "Auth" }],
  components: {
    securitySchemes: {
      bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
    },
    schemas: {
      Error: errorResponse,
      User: {
        type: "object",
        properties: {
          id: { type: "string", example: "tz4a98xxat96iws9zmbrgj3a" },
          email: { type: "string", format: "email" },
          firstName: { type: "string" },
          lastName: { type: "string" },
          phone: { type: "string", nullable: true },
          role: { type: "string", enum: ["STUDENT", "ADMIN"] },
          isEmailVerified: { type: "boolean" },
          createdAt: { type: "string", format: "date-time" },
        },
      },
      AuthResponse: {
        type: "object",
        properties: {
          user: { $ref: "#/components/schemas/User" },
          accessToken: {
            type: "string",
            description:
              "JWT valid for 15 minutes; send as `Authorization: Bearer <token>`. Keep it in memory, not localStorage. The refresh token is set as the httpOnly `faa_refresh` cookie.",
          },
        },
      },
      RegisterInput: {
        type: "object",
        required: ["email", "password", "firstName", "lastName"],
        properties: {
          email: { type: "string", format: "email" },
          password: { type: "string", minLength: 8, maxLength: 72 },
          firstName: { type: "string" },
          lastName: { type: "string" },
          phone: { type: "string" },
        },
      },
      LoginInput: {
        type: "object",
        required: ["email", "password"],
        properties: {
          email: { type: "string", format: "email" },
          password: { type: "string" },
        },
      },
    },
  },
  paths: {
    "/auth/register": {
      post: {
        tags: ["Auth"],
        summary: "Create a student account",
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/RegisterInput" } } },
        },
        responses: {
          "201": { ...authResult, description: "Account created" },
          "400": jsonError("Invalid request body"),
          "409": jsonError("Email already registered"),
        },
      },
    },
    "/auth/login": {
      post: {
        tags: ["Auth"],
        summary: "Log in with email and password",
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/LoginInput" } } },
        },
        responses: {
          "200": authResult,
          "400": jsonError("Invalid request body"),
          "401": jsonError("Invalid email or password"),
          "403": jsonError("Account disabled"),
        },
      },
    },
    "/auth/refresh": {
      post: {
        tags: ["Auth"],
        summary: "Get a new access token using the refresh cookie",
        description:
          "Call on page load and whenever a request fails with TOKEN_EXPIRED. Send with `credentials: \"include\"`. Rotates the `faa_refresh` cookie.",
        responses: {
          "200": authResult,
          "401": jsonError("No cookie, or the session expired or was revoked (SESSION_EXPIRED / SESSION_REVOKED)"),
          "429": rateLimited,
        },
      },
    },
    "/auth/logout": {
      post: {
        tags: ["Auth"],
        summary: "Sign out this device",
        description: "Ends the session in the refresh cookie and clears it. Works even if the access token has expired.",
        responses: { "204": { description: "Signed out" } },
      },
    },
    "/auth/logout-all": {
      post: {
        tags: ["Auth"],
        summary: "Sign out every device",
        security: [{ bearerAuth: [] }],
        responses: { "204": { description: "All sessions ended" }, "401": jsonError("Not logged in") },
      },
    },
    "/auth/me": {
      get: {
        tags: ["Auth"],
        summary: "Get the logged-in user",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": {
            description: "The current user",
            content: {
              "application/json": {
                schema: { type: "object", properties: { user: { $ref: "#/components/schemas/User" } } },
              },
            },
          },
          "401": jsonError("Missing, invalid, expired or revoked token"),
        },
      },
    },
    "/auth/verify-email": {
      post: {
        tags: ["Auth"],
        summary: "Confirm an email address with the token from the verification link",
        requestBody: jsonBody({ token: { type: "string" } }, ["token"]),
        responses: {
          "200": {
            description: "Email verified",
            content: {
              "application/json": {
                schema: { type: "object", properties: { user: { $ref: "#/components/schemas/User" } } },
              },
            },
          },
          "400": jsonError("Invalid or expired link"),
          "429": rateLimited,
        },
      },
    },
    "/auth/resend-verification": {
      post: {
        tags: ["Auth"],
        summary: "Send a new verification link",
        description:
          "With a Bearer token, sends to the logged-in user's address. Without one, send `{ email }`; the reply is the same whether or not the email is registered.",
        security: [{}, { bearerAuth: [] }],
        requestBody: {
          content: {
            "application/json": {
              schema: { type: "object", properties: { email: { type: "string", format: "email" } } },
            },
          },
        },
        responses: {
          "200": messageResponse("Sent, or nothing to send"),
          "400": jsonError("Already verified, or invalid body"),
          "429": rateLimited,
        },
      },
    },
    "/auth/forgot-password": {
      post: {
        tags: ["Auth"],
        summary: "Email a password reset link",
        description: "The reply is the same whether or not the email is registered. Links expire after 30 minutes.",
        requestBody: jsonBody({ email: { type: "string", format: "email" } }, ["email"]),
        responses: { "200": messageResponse("Sent if the account exists"), "429": rateLimited },
      },
    },
    "/auth/reset-password": {
      post: {
        tags: ["Auth"],
        summary: "Set a new password with the token from the reset link",
        description: "Signs out every existing session.",
        requestBody: jsonBody(
          { token: { type: "string" }, password: { type: "string", minLength: 8, maxLength: 72 } },
          ["token", "password"],
        ),
        responses: {
          "200": messageResponse("Password updated"),
          "400": jsonError("Invalid or expired link, or invalid password"),
          "429": rateLimited,
        },
      },
    },
    "/auth/change-password": {
      post: {
        tags: ["Auth"],
        summary: "Change the logged-in user's password",
        description: "Signs out every other session and returns a fresh token for this one.",
        security: [{ bearerAuth: [] }],
        requestBody: jsonBody(
          {
            currentPassword: { type: "string" },
            newPassword: { type: "string", minLength: 8, maxLength: 72 },
          },
          ["currentPassword", "newPassword"],
        ),
        responses: {
          "200": {
            description: "Password changed",
            content: {
              "application/json": {
                schema: { type: "object", properties: { message: { type: "string" }, accessToken: { type: "string" } } },
              },
            },
          },
          "400": jsonError("Current password wrong (WRONG_PASSWORD), or invalid new password"),
          "401": jsonError("Not logged in"),
        },
      },
    },
  },
};
