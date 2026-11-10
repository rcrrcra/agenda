import "dotenv/config";
import { defineConfig } from "prisma/config";

// DIRECT_URL (conexão direta do Supabase, porta 5432) é usada nas migrações;
// em runtime a aplicação usa DATABASE_URL (pooler, porta 6543).
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations", seed: "ts-node prisma/seed.ts" },
  datasource: { url: process.env.DIRECT_URL ?? process.env.DATABASE_URL ?? "" },
});
