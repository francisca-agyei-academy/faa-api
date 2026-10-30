import postgres from "@prisma/orm-postgres/runtime";
import { contractFromJson } from "@prisma/orm-postgres/static";
import { env } from "../config/env.js";
import type { Contract } from "../prisma/contract.js";
import contractJson from "../prisma/contract.json" with { type: "json" };

export const contract = contractFromJson<Contract>(contractJson);

// One pool for the process lifetime; servers never call db.close().
export const db = postgres({
  contract,
  url: env.DATABASE_URL,
});
