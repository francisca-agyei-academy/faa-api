import { definePrismaConfig } from "prisma/config";
import { defineConfig as orm } from "@prisma/orm-postgres/config";
import { config } from "dotenv";

config();

export default definePrismaConfig({
  orm: orm({
    contract: "./src/prisma/contract.prisma",
    migrations: { dir: "./migrations" },
    db: {
      connection: process.env.DATABASE_URL!,
    },
  }),
  skills: {
    agents: ["claude", "cursor", "agents", "devin"],
  },
});
