import { Injectable, OnModuleDestroy } from "@nestjs/common";
import { PrismaPg } from "@prisma/adapter-pg";
import { Prisma, PrismaClient } from "../generated/prisma/client";

export { Prisma };
/** Cliente do Prisma ou o de dentro de uma transação (`tx`). */
export type Db = PrismaClient | Prisma.TransactionClient;

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor() {
    // Serverless: poucas conexões por instância; o pooler do Supabase (porta 6543) multiplexa.
    super({
      adapter: new PrismaPg({
        connectionString: (process.env.DATABASE_URL ?? "").replace(/[?&]pgbouncer=true/, ""),
        max: Number(process.env.DB_POOL_MAX ?? 3),
      }),
    });
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
