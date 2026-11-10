/**
 * Autenticação por token de sessão (`Authorization: Token <token>`), igual ao Django:
 * só o hash SHA-256 do token fica no banco; a sessão expira por inatividade e por idade máxima.
 */
import { CanActivate, ExecutionContext, Injectable, SetMetadata } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { createHash, randomBytes } from "crypto";
import type { Db } from "./prisma.service";
import { PrismaService } from "./prisma.service";
import { ApiError, forbidden, unauthorized } from "./api-error";
import type { Req } from "./types";

export const Public = () => SetMetadata("public", true);
/** Só o admin geral (superusuário). */
export const PlatformOnly = () => SetMetadata("platformOnly", true);
/** Admin geral ou administrador de ao menos uma empresa. */
export const ReportsAccess = () => SetMetadata("reportsAccess", true);

export const SESSION_IDLE_DAYS = Number(process.env.SESSION_IDLE_DAYS ?? 14);
export const SESSION_MAX_DAYS = Number(process.env.SESSION_MAX_DAYS ?? 30);
const TOUCH_EVERY_MS = 5 * 60_000; // evita gravar `last_used_at` a cada requisição
const DAY = 86_400_000;

export const hashKey = (key: string): string => createHash("sha256").update(key).digest("hex");

/** IP do cliente. Na Vercel o `x-real-ip` / `x-forwarded-for` são definidos pela própria plataforma. */
export function clientIp(req: Req): string | null {
  const real = req.headers["x-real-ip"];
  const fwd = req.headers["x-forwarded-for"];
  const ip = (Array.isArray(real) ? real[0] : real) || (Array.isArray(fwd) ? fwd[0] : fwd)?.split(",")[0] || req.socket?.remoteAddress;
  return ip ? ip.trim().slice(0, 45) : null;
}

/** Cria uma sessão para este dispositivo e devolve o token em texto (único momento em que ele existe). */
export async function startSession(db: Db, req: Req, userId: number): Promise<string> {
  const key = randomBytes(24).toString("hex");
  await db.authSession.create({
    data: { userId, keyHash: hashKey(key), ip: clientIp(req), userAgent: String(req.headers["user-agent"] ?? "").slice(0, 255) },
  });
  return key;
}

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly reflector: Reflector, private readonly prisma: PrismaService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const targets = [ctx.getHandler(), ctx.getClass()];
    if (this.reflector.getAllAndOverride<boolean>("public", targets)) return true;

    const req = ctx.switchToHttp().getRequest<Req>();
    const parts = String(req.headers.authorization ?? "").split(/\s+/).filter(Boolean);
    if (!parts.length || parts[0].toLowerCase() !== "token") {
      throw unauthorized("As credenciais de autenticação não foram fornecidas.");
    }
    if (parts.length !== 2) throw unauthorized("Cabeçalho de autorização inválido.");

    const session = await this.prisma.authSession.findUnique({
      where: { keyHash: hashKey(parts[1]) },
      include: { user: { include: { memberships: { include: { company: true } } } } },
    });
    if (!session) throw unauthorized("Sessão inválida. Entre novamente.");
    if (!session.user.isActive) throw unauthorized("Usuário desativado.");
    const now = Date.now();
    if (now - session.lastUsedAt.getTime() > SESSION_IDLE_DAYS * DAY || now - session.createdAt.getTime() > SESSION_MAX_DAYS * DAY) {
      await this.prisma.authSession.deleteMany({ where: { id: session.id } });
      throw unauthorized("Sessão expirada. Entre novamente.");
    }
    if (now - session.lastUsedAt.getTime() > TOUCH_EVERY_MS) {
      await this.prisma.authSession.update({ where: { id: session.id }, data: { lastUsedAt: new Date(now) } });
    }
    const { user, ...authSession } = session;
    req.user = user;
    req.authSession = authSession;

    if (this.reflector.getAllAndOverride<boolean>("platformOnly", targets) && !user.isSuperuser) throw forbidden();
    if (this.reflector.getAllAndOverride<boolean>("reportsAccess", targets) && !user.isSuperuser && !user.memberships.length) throw forbidden();
    return true;
  }
}

/** Empresa do cabeçalho `X-Company`, se o usuário a administra (400 sem cabeçalho, 403 sem vínculo). */
export function resolveCompany(req: Req) {
  const raw = String(req.headers["x-company"] ?? "");
  if (!/^\d+$/.test(raw)) {
    throw new ApiError(400, { detail: "Informe a empresa no cabeçalho X-Company." });
  }
  const member = req.user!.memberships.find((m) => m.companyId === Number(raw));
  if (!member) throw forbidden("Você não administra esta empresa.");
  return member.company;
}
