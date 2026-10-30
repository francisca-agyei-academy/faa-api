export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const badRequest = (message: string, details?: unknown) =>
  new AppError(400, "BAD_REQUEST", message, details);

export const unauthorized = (message = "Authentication required") =>
  new AppError(401, "UNAUTHORIZED", message);

export const forbidden = (message = "You do not have access to this resource") =>
  new AppError(403, "FORBIDDEN", message);

export const conflict = (message: string) => new AppError(409, "CONFLICT", message);

export const notFound = (message = "Not found") => new AppError(404, "NOT_FOUND", message);

const hasSqlState = (err: unknown, state: string) =>
  typeof err === "object" && err !== null && "sqlState" in err && (err as { sqlState?: unknown }).sqlState === state;

/** Postgres SQLSTATE 23505, surfaced by the Prisma 8 driver as `sqlState`. */
export const isUniqueViolation = (err: unknown) => hasSqlState(err, "23505");

/** Postgres SQLSTATE 23503: a row is still referenced (e.g. a module someone bought). */
export const isForeignKeyViolation = (err: unknown) => hasSqlState(err, "23503");
