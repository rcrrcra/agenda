/** Criação do app Nest, compartilhada entre o servidor local (`main.ts`) e a função da Vercel (`api/index.js`). */
import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { NestExpressApplication } from "@nestjs/platform-express";
import { AppModule } from "./app.module";
import { MEDIA_DIR } from "./common/storage.service";

export async function createApp(): Promise<NestExpressApplication> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { logger: ["error", "warn", "log"] });
  app.setGlobalPrefix("api");
  app.enableCors({
    origin: (process.env.FRONTEND_URL ?? "http://localhost:5173,http://127.0.0.1:5173").split(",").map((s) => s.trim()),
    allowedHeaders: ["Content-Type", "Authorization", "X-Company"], // o painel envia X-Company
    exposedHeaders: ["Content-Disposition", "Retry-After"],
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  });
  app.set("trust proxy", true);
  // Sem Supabase (dev/testes) as imagens ficam em disco e são servidas aqui.
  if (!process.env.SUPABASE_URL) app.useStaticAssets(MEDIA_DIR, { prefix: "/media/" });
  return app;
}
