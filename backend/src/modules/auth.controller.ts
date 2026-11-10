/** Autenticação: cadastro, login (e-mail ou usuário), logout e dados do usuário logado. */
import { Body, Controller, Get, HttpCode, Post, Req as ReqDec } from "@nestjs/common";
import { ApiError } from "../common/api-error";
import { AuditService, tUser } from "../common/audit.service";
import { Public, clientIp, startSession } from "../common/auth";
import { checkPassword, hashPassword, hasUsablePassword, passwordErrors } from "../common/password";
import { PrismaService } from "../common/prisma.service";
import { normalizeIdent, retryAfter, WINDOW_MS } from "../common/throttle";
import type { Req } from "../common/types";
import { V } from "../common/validate";
import { userOut } from "./serializers";

@Controller("auth")
export class AuthController {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  private async payload(req: Req, userId: number) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, include: { memberships: { include: { company: true } } } });
    return { token: await startSession(this.prisma, req, userId), user: userOut(user) };
  }

  /** Cria uma conta e já devolve o token. Também assume uma conta criada pelo painel (sem senha). */
  @Public() @Post("register")
  async register(@Body() body: any, @ReqDec() req: Req) {
    const v = new V(body);
    const name = v.str("name", { max: 120 });
    const email = v.email("email")?.toLowerCase();
    const password = v.str("password", { trim: false });
    let existing = null as Awaited<ReturnType<typeof this.prisma.user.findUnique>>;
    if (email) {
      existing = await this.prisma.user.findUnique({ where: { username: email } });
      // Conta criada pelo painel (sem senha) pode ser assumida; com senha ou da equipe, não.
      if (existing && (hasUsablePassword(existing.passwordHash) || existing.isStaff)) v.fail("email", "Este e-mail já está cadastrado.");
      else if (await this.prisma.user.count({ where: { email: { equals: email, mode: "insensitive" }, NOT: existing ? { id: existing.id } : undefined } })) {
        v.fail("email", "Este e-mail já está cadastrado.");
      }
    }
    if (password !== undefined) for (const m of passwordErrors(password)) v.fail("password", m);
    v.done();

    const passwordHash = await hashPassword(password!);
    const user = existing
      ? await this.prisma.user.update({ where: { id: existing.id }, data: { passwordHash, firstName: name! } })
      : await this.prisma.user.create({ data: { username: email!, email: email!, firstName: name!, passwordHash } });
    await this.audit.record(req, "auth.register", { actor: user, target: tUser(user), label: `${user.firstName} <${user.email}>` });
    return this.payload(req, user.id);
  }

  /** O campo `email` aceita também o nome de usuário (ex.: o dono criado no seed). */
  @Public() @Post("login") @HttpCode(200)
  async login(@Body() body: any, @ReqDec() req: Req) {
    const ident = String(body?.email ?? "").trim();
    const password = String(body?.password ?? "");
    const candidates = ident
      ? await this.prisma.user.findMany({
          where: { OR: [{ username: { equals: ident, mode: "insensitive" } }, { email: { equals: ident, mode: "insensitive" } }] }, take: 5, orderBy: { id: "asc" },
        })
      : [];
    const ip = clientIp(req);
    const wait = await retryAfter(this.prisma, ident, ip, candidates.map((c) => c.id));
    if (wait) {
      // bloqueado: nem a senha certa é aceita; registra o bloqueio uma vez por janela
      const already = await this.prisma.auditLog.count({
        where: { action: "auth.login_blocked", ip, createdAt: { gte: new Date(Date.now() - WINDOW_MS) }, details: { path: ["identificador"], equals: normalizeIdent(ident) } },
      });
      if (!already) await this.audit.record(req, "auth.login_blocked", { details: { identificador: normalizeIdent(ident) || "(vazio)", segundos: wait } });
      throw new ApiError(429, { detail: `Muitas tentativas. Tente de novo em ${Math.max(1, Math.round(wait / 60))} minuto(s).` }, { "Retry-After": String(wait) });
    }
    for (const c of candidates) {
      if (c.isActive && (await checkPassword(password, c.passwordHash))) {
        await this.audit.record(req, "auth.login", { actor: c });
        return this.payload(req, c.id);
      }
    }
    await this.audit.record(req, "auth.login_failed", { details: { identificador: normalizeIdent(ident) || "(vazio)" } });
    throw new ApiError(400, { detail: "Usuário/e-mail ou senha incorretos." });
  }

  /** Encerra a sessão deste dispositivo. */
  @Post("logout") @HttpCode(204)
  async logout(@ReqDec() req: Req) {
    await this.audit.record(req, "auth.logout");
    await this.prisma.authSession.deleteMany({ where: { id: req.authSession!.id } });
  }

  /** Encerra TODAS as sessões do usuário. */
  @Post("logout-all") @HttpCode(204)
  async logoutAll(@ReqDec() req: Req) {
    const n = await this.prisma.authSession.count({ where: { userId: req.user!.id } });
    await this.audit.record(req, "auth.logout_all", { details: { sessoes: n } });
    await this.prisma.authSession.deleteMany({ where: { userId: req.user!.id } });
  }

  @Get("me")
  me(@ReqDec() req: Req) {
    return userOut(req.user!);
  }
}
