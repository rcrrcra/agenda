/** Painel do dono do software (superusuário): visão geral, empresas, usuários, configurações e log de auditoria. */
import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Put, Query, Req as ReqDec } from "@nestjs/common";
import { ApiError, bad, notFound } from "../common/api-error";
import { ACTIONS, AuditService, summary, tCompany, tUser } from "../common/audit.service";
import { PlatformOnly } from "../common/auth";
import { hashPassword, passwordErrors } from "../common/password";
import { Db, Prisma, PrismaService } from "../common/prisma.service";
import { refreshSearchText, uniqueSlug } from "../common/search";
import { CLIENT, COMPANY_ADMIN, PLATFORM_ADMIN, ROLES, userRole } from "../common/roles";
import type { Req } from "../common/types";
import { dayEnd, dayStart, isYmd, isoLocal } from "../common/tz";
import { V, toCamel } from "../common/validate";
import { workbookResponse } from "../common/xlsx";
import { parseCompanyFields } from "./company.controller";
import { idParam } from "./serializers";

const LIST_LIMIT = 100;
const nameOf = (u: { firstName: string; username: string; email: string }) => `${u.firstName || u.username} <${u.email || u.username}>`;

@PlatformOnly()
@Controller("platform")
export class PlatformController {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  // ---------------------------------------------------------------- Empresas
  /** Empresa vista pelo dono: dados, totais e administradores. */
  private async companiesOut(ids: number[]) {
    if (!ids.length) return [];
    const [rows, counts] = await Promise.all([
      this.prisma.company.findMany({
        where: { id: { in: ids } },
        include: { members: { include: { user: true } }, _count: { select: { professionals: true, services: true } } },
      }),
      this.prisma.$queryRaw<{ company_id: number; n: number }[]>`
        SELECT p.company_id, COUNT(a.id)::int AS n FROM professionals p JOIN appointments a ON a.professional_id = p.id
         WHERE p.company_id = ANY(${ids}) GROUP BY p.company_id`,
    ]);
    const appts = new Map(counts.map((c) => [c.company_id, c.n]));
    const byId = new Map(rows.map((c) => [c.id, c]));
    return ids.map((id) => byId.get(id)!).filter(Boolean).map((c) => ({
      id: c.id, name: c.name, slug: c.slug, category: c.category, city: c.city, address: c.address, active: c.active, created_at: isoLocal(c.createdAt),
      professionals_count: c._count.professionals, services_count: c._count.services, appointments_count: appts.get(c.id) ?? 0,
      members: c.members.map((m) => m.user).sort((a, b) => (a.firstName || a.username).toLowerCase().localeCompare((b.firstName || b.username).toLowerCase()))
        .map((u) => ({ id: u.id, name: u.firstName, email: u.email, username: u.username })),
    }));
  }
  private async companyOut(id: number) { return (await this.companiesOut([id]))[0]; }

  /** Usuário pelo nome de usuário ou e-mail (sem diferenciar maiúsculas); erro se o e-mail for ambíguo. */
  private async findUser(identifier: unknown, db: Db = this.prisma) {
    const ident = String(identifier ?? "").trim();
    if (!ident) return null;
    const byUsername = await db.user.findFirst({ where: { username: { equals: ident, mode: "insensitive" } } });
    if (byUsername) return byUsername;
    const matches = await db.user.findMany({ where: { email: { equals: ident, mode: "insensitive" } }, take: 2 });
    if (matches.length > 1) throw bad("Há mais de uma conta com esse e-mail. Use o nome de usuário.");
    return matches[0] ?? null;
  }

  @Get("companies")
  async listCompanies(@Query() q: Record<string, string>) {
    const term = (q.q ?? "").trim();
    const where: Prisma.CompanyWhereInput = {
      ...(term ? { OR: [{ name: { contains: term, mode: "insensitive" } }, { category: { contains: term, mode: "insensitive" } }, { city: { contains: term, mode: "insensitive" } }, { slug: { contains: term, mode: "insensitive" } }, { members: { some: { user: { email: { contains: term, mode: "insensitive" } } } } }] } : {}),
      ...(q.active === "true" || q.active === "false" ? { active: q.active === "true" } : {}),
    };
    const rows = await this.prisma.company.findMany({ where, orderBy: { name: "asc" }, take: LIST_LIMIT, select: { id: true } });
    return this.companiesOut(rows.map((r) => r.id));
  }

  /** Cadastra uma empresa (campo opcional `admin` = usuário/e-mail de quem a administra). */
  @Post("companies")
  async createCompany(@Body() body: any, @ReqDec() req: Req) {
    const raw = String(body?.admin ?? "").trim();
    const admin = raw ? await this.findUser(raw) : null;
    if (raw && !admin) throw new ApiError(400, { admin: ["Usuário não encontrado. A pessoa precisa criar conta antes."] });
    const v = new V(body);
    const f = parseCompanyFields(v);
    v.done();
    const company = await this.prisma.$transaction(async (tx) => {
      const c = await tx.company.create({ data: { ...(toCamel(Object.fromEntries(Object.entries(f).filter(([, x]) => x !== undefined))) as any), slug: await uniqueSlug(tx, f.name!) } });
      if (admin) await tx.companyMember.create({ data: { companyId: c.id, userId: admin.id } });
      await refreshSearchText(tx, c.id);
      await this.audit.record(req, "company.create", { company: c, target: tCompany(c), details: admin ? { quem: nameOf(admin) } : {} }, tx);
      return c;
    });
    return this.companyOut(company.id);
  }

  /** Só `active` pode ser alterado aqui. */
  @Patch("companies/:id")
  async patchCompany(@Param("id") id: string, @Body() body: any, @ReqDec() req: Req) {
    const company = await this.prisma.company.findUnique({ where: { id: idParam(id) } });
    if (!company) throw notFound();
    const v = new V(body, true);
    const active = v.bool("active");
    v.done();
    if (active !== undefined && active !== company.active) {
      await this.prisma.company.update({ where: { id: company.id }, data: { active } });
      await this.audit.record(req, "company.toggle_active", { company, target: tCompany(company), details: { de: company.active, para: active } });
    }
    return this.companyOut(company.id);
  }

  @Post("companies/:id/members") @HttpCode(200)
  async addMember(@Param("id") id: string, @Body() body: any, @ReqDec() req: Req) {
    const company = await this.prisma.company.findUnique({ where: { id: idParam(id) } });
    if (!company) throw notFound();
    const user = await this.findUser(body?.email);
    if (!user) throw bad("Usuário não encontrado. A pessoa precisa criar conta antes.");
    const had = await this.prisma.companyMember.findUnique({ where: { companyId_userId: { companyId: company.id, userId: user.id } } });
    if (!had) {
      await this.prisma.companyMember.create({ data: { companyId: company.id, userId: user.id } });
      await this.audit.record(req, "company.member_add", { company, target: tUser(user), label: nameOf(user) });
    }
    return this.companyOut(company.id);
  }

  @Delete("companies/:id/members/:userId") @HttpCode(200)
  async removeMember(@Param("id") id: string, @Param("userId") userId: string, @ReqDec() req: Req) {
    const company = await this.prisma.company.findUnique({ where: { id: idParam(id) } });
    if (!company) throw notFound();
    const uid = idParam(userId);
    const member = await this.prisma.user.findUnique({ where: { id: uid } });
    const { count } = await this.prisma.companyMember.deleteMany({ where: { companyId: company.id, userId: uid } });
    if (count && member) await this.audit.record(req, "company.member_remove", { company, target: tUser(member), label: nameOf(member) });
    return this.companyOut(company.id);
  }

  // ---------------------------------------------------------------- Usuários
  private async usersOut(ids: number[]) {
    if (!ids.length) return [];
    const rows = await this.prisma.user.findMany({
      where: { id: { in: ids } },
      include: { memberships: { include: { company: true }, orderBy: { id: "asc" } }, _count: { select: { appointments: true } } },
    });
    const byId = new Map(rows.map((u) => [u.id, u]));
    return ids.map((id) => byId.get(id)!).filter(Boolean).map((u) => ({
      id: u.id, name: u.firstName, email: u.email, username: u.username, is_active: u.isActive, is_superuser: u.isSuperuser, role: userRole(u),
      companies: u.memberships.map((m) => ({ id: m.companyId, name: m.company.name })), date_joined: isoLocal(u.dateJoined),
      companies_count: u.memberships.length, appointments_count: u._count.appointments,
    }));
  }

  /** Lista (com busca `q` e `limit`); também alimenta o autocomplete de administradores. */
  @Get("users")
  async listUsers(@Query() q: Record<string, string>) {
    const term = (q.q ?? "").trim();
    const limit = /^\d+$/.test(q.limit ?? "") && Number(q.limit) > 0 ? Math.min(Number(q.limit), LIST_LIMIT) : LIST_LIMIT;
    const rows = await this.prisma.user.findMany({
      where: term ? { OR: [{ firstName: { contains: term, mode: "insensitive" } }, { email: { contains: term, mode: "insensitive" } }, { username: { contains: term, mode: "insensitive" } }] } : {},
      orderBy: [{ dateJoined: "desc" }, { id: "desc" }], take: limit, select: { id: true },
    });
    return this.usersOut(rows.map((r) => r.id));
  }

  /** Aplica o novo perfil (`client`, `company_admin` + empresa, `platform_admin`). Ninguém altera o próprio perfil. */
  private async changeRole(req: Req, user: { id: number }, role: unknown, companyId: unknown, db: Db) {
    if (!(ROLES as readonly string[]).includes(String(role))) throw new ApiError(400, { role: ["Perfil inválido."] });
    if (user.id === req.user!.id) throw bad("Você não pode alterar o próprio perfil.");
    if (role === PLATFORM_ADMIN) await db.user.update({ where: { id: user.id }, data: { isSuperuser: true, isStaff: true } });
    else if (role === CLIENT) {
      await db.user.update({ where: { id: user.id }, data: { isSuperuser: false, isStaff: false } });
      await db.companyMember.deleteMany({ where: { userId: user.id } });
    } else if (role === COMPANY_ADMIN) {
      const company = /^\d+$/.test(String(companyId ?? "")) ? await db.company.findUnique({ where: { id: Number(companyId) } }) : null;
      if (!company && !(await db.companyMember.count({ where: { userId: user.id } }))) throw new ApiError(400, { company: ["Escolha a empresa que o usuário vai administrar."] });
      await db.user.update({ where: { id: user.id }, data: { isSuperuser: false, isStaff: false } });
      if (company) await db.companyMember.upsert({ where: { companyId_userId: { companyId: company.id, userId: user.id } }, create: { companyId: company.id, userId: user.id }, update: {} });
    }
  }

  /** Cadastra um usuário já com o perfil escolhido. */
  @Post("users")
  async createUser(@Body() body: any, @ReqDec() req: Req) {
    const v = new V(body);
    const name = v.str("name", { max: 120 });
    const email = v.email("email")?.toLowerCase();
    const password = v.str("password", { trim: false });
    const role = body?.role === undefined ? CLIENT : body.role;
    if (!(ROLES as readonly string[]).includes(role)) v.fail("role", `"${role}" não é um escolha válida.`);
    const companyId = v.pk("company", { required: false, nullable: true }) as number | null | undefined;
    const company = companyId ? await this.prisma.company.findUnique({ where: { id: companyId } }) : null;
    if (companyId && !company) v.fail("company", `Pk inválido "${companyId}" - objeto não existe.`);
    if (email && (await this.prisma.user.count({ where: { OR: [{ username: email }, { email: { equals: email, mode: "insensitive" } }] } }))) {
      v.fail("email", "Este e-mail já está cadastrado. Para mudar o perfil, use a lista de usuários.");
    }
    if (password !== undefined) for (const m of passwordErrors(password)) v.fail("password", m);
    if (role === COMPANY_ADMIN && !company) v.fail("company", "Escolha a empresa que o usuário vai administrar.");
    v.done();
    const passwordHash = await hashPassword(password!);
    const user = await this.prisma.$transaction(async (tx) => {
      const u = await tx.user.create({ data: { username: email!, email: email!, firstName: name!, passwordHash } });
      await this.changeRole(req, u, role, company?.id, tx);
      await this.audit.record(req, "user.create", { company, target: tUser(u), label: `${u.firstName} <${u.email}>`, details: { perfil: role } }, tx);
      return u;
    });
    return (await this.usersOut([user.id]))[0];
  }

  /** Nome, e-mail (que é o login) e/ou senha. Mudar e-mail ou senha de OUTRA pessoa encerra as sessões dela. */
  private async updateProfile(req: Req, user: Awaited<ReturnType<PrismaService["user"]["findUniqueOrThrow"]>>, data: any, db: Db) {
    const changed: Record<string, [string, string]> = {}, extra: Record<string, unknown> = {}, patch: Record<string, unknown> = {};
    const name = "name" in data ? String(data.name ?? "").trim() : null;
    const email = "email" in data ? String(data.email ?? "").trim().toLowerCase() : null;
    const password = data.password || null;
    if (name !== null) {
      if (!name || name.length > 120) throw new ApiError(400, { name: ["Informe o nome (até 120 caracteres)."] });
      if (name !== user.firstName) { changed["nome"] = [user.firstName, name]; patch.firstName = name; }
    }
    if (email !== null && email !== (user.email || "").toLowerCase()) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ApiError(400, { email: ["E-mail inválido."] });
      if (await db.user.count({ where: { OR: [{ username: email }, { email: { equals: email, mode: "insensitive" } }], NOT: { id: user.id } } })) {
        throw new ApiError(400, { email: ["Este e-mail já está cadastrado."] });
      }
      changed["e-mail"] = [user.email, email]; patch.email = email; patch.username = email;
    }
    if (password) {
      const errs = passwordErrors(String(password));
      if (errs.length) throw new ApiError(400, { password: errs });
      patch.passwordHash = await hashPassword(String(password));
      extra.senha = "redefinida";
    }
    if (!Object.keys(changed).length && !Object.keys(extra).length) return;
    const saved = await db.user.update({ where: { id: user.id }, data: patch });
    if (user.id !== req.user!.id && (("e-mail" in changed) || password)) await db.authSession.deleteMany({ where: { userId: user.id } }); // a pessoa precisa entrar de novo
    await this.audit.record(req, "user.update", { target: tUser(saved), label: nameOf(saved), details: { mudou: changed, ...extra } }, db);
  }

  /** Altera nome/e-mail/senha, o PERFIL (`role`) e/ou `is_active`. */
  @Patch("users/:id")
  async patchUser(@Param("id") id: string, @Body() body: any, @ReqDec() req: Req) {
    const uid = idParam(id);
    const found = await this.prisma.user.findUnique({ where: { id: uid }, include: { memberships: true } });
    if (!found) throw notFound();
    const data = body ?? {};
    const v = new V(data, true);
    const active = v.bool("is_active");
    v.done();
    await this.prisma.$transaction(async (tx) => {
      const oldRole = userRole(found), oldActive = found.isActive;
      await this.updateProfile(req, found, data, tx);
      if (data.role !== undefined && data.role !== null && data.role !== "") await this.changeRole(req, found, data.role, data.company, tx);
      const user = await tx.user.findUniqueOrThrow({ where: { id: uid }, include: { memberships: true } });
      if (active === false && user.isSuperuser) throw new ApiError(400, { non_field_errors: ["Não é possível desativar um superusuário."] });
      if (active !== undefined) await tx.user.update({ where: { id: uid }, data: { isActive: active } });
      const who = nameOf(user);
      if (userRole(user) !== oldRole) {
        const company = /^\d+$/.test(String(data.company ?? "")) ? await tx.company.findUnique({ where: { id: Number(data.company) } }) : null;
        await this.audit.record(req, "user.role_change", { company, target: tUser(user), label: who, details: { de: oldRole, para: userRole(user) } }, tx);
      }
      if (active !== undefined && active !== oldActive) {
        if (!active) await tx.authSession.deleteMany({ where: { userId: uid } }); // desativar derruba as sessões abertas
        await this.audit.record(req, "user.toggle_active", { target: tUser(user), label: who, details: { de: oldActive, para: active } }, tx);
      }
    });
    return (await this.usersOut([uid]))[0];
  }

  // ----------------------------------------------------------- Configurações
  @Get("settings")
  async getSettings() {
    return { max_companies_per_user: (await this.prisma.platformSettings.upsert({ where: { id: 1 }, create: { id: 1 }, update: {} })).maxCompaniesPerUser };
  }

  @Put("settings")
  async putSettings(@Body() body: any, @ReqDec() req: Req) {
    const value = body?.max_companies_per_user;
    if (!/^\d+$/.test(String(value)) || Number(value) < 0 || Number(value) > 1000) {
      throw new ApiError(400, { max_companies_per_user: ["Use um número de 0 a 1000 (0 = sem limite)."] });
    }
    const cfg = await this.prisma.platformSettings.upsert({ where: { id: 1 }, create: { id: 1 }, update: {} });
    const updated = await this.prisma.platformSettings.update({ where: { id: 1 }, data: { maxCompaniesPerUser: Number(value) } });
    if (cfg.maxCompaniesPerUser !== updated.maxCompaniesPerUser) {
      await this.audit.record(req, "settings.update", { label: "Máximo de empresas por usuário", details: { mudou: { max_companies_per_user: [cfg.maxCompaniesPerUser, updated.maxCompaniesPerUser] } } });
    }
    return { max_companies_per_user: updated.maxCompaniesPerUser };
  }

  /** Visão geral: totais e as 5 empresas com mais agendamentos. */
  @Get("stats")
  async stats() {
    const now = new Date();
    const [companies, activeCompanies, users, activeUsers, professionals, total, upcoming, canceled, last30, top] = await Promise.all([
      this.prisma.company.count(), this.prisma.company.count({ where: { active: true } }),
      this.prisma.user.count(), this.prisma.user.count({ where: { isActive: true } }),
      this.prisma.professional.count(), this.prisma.appointment.count(),
      this.prisma.appointment.count({ where: { status: "confirmed", start: { gte: now } } }),
      this.prisma.appointment.count({ where: { status: "canceled" } }),
      this.prisma.appointment.count({ where: { createdAt: { gte: new Date(now.getTime() - 30 * 86_400_000) } } }),
      this.prisma.$queryRaw<{ id: number; name: string; n: number }[]>`
        SELECT c.id, c.name, COUNT(a.id)::int AS n FROM companies c JOIN professionals p ON p.company_id = c.id JOIN appointments a ON a.professional_id = p.id
         GROUP BY c.id, c.name HAVING COUNT(a.id) > 0 ORDER BY n DESC, c.name ASC LIMIT 5`,
    ]);
    return {
      companies: { total: companies, active: activeCompanies }, users: { total: users, active: activeUsers }, professionals,
      appointments: { total, upcoming, canceled, created_last_30_days: last30 },
      top_companies: top.map((c) => ({ id: c.id, name: c.name, appointments: c.n })),
    };
  }

  // ------------------------------------------------------ Log de auditoria
  /** Filtros: from/to (datas), action (código ou grupo), company (id), actor (nome/e-mail) e q (alvo, IP ou empresa). */
  private auditWhere(q: Record<string, string>): Prisma.AuditLogWhereInput {
    const and: Prisma.AuditLogWhereInput[] = [];
    for (const k of ["from", "to"]) if (q[k] && !isYmd(q[k])) throw bad("Data inválida (use AAAA-MM-DD).");
    if (q.from) and.push({ createdAt: { gte: dayStart(q.from) } });
    if (q.to) and.push({ createdAt: { lt: dayEnd(q.to) } });
    if (q.action) and.push(ACTIONS[q.action] ? { action: q.action } : { action: { startsWith: `${q.action}.` } });
    if (/^\d+$/.test(q.company ?? "")) and.push({ companyId: Number(q.company) });
    if (q.actor) and.push({ actorLabel: { contains: q.actor.trim(), mode: "insensitive" } });
    if (q.q) { const t = q.q.trim(); and.push({ OR: [{ targetLabel: { contains: t, mode: "insensitive" } }, { ip: { startsWith: t } }, { companyLabel: { contains: t, mode: "insensitive" } }] }); }
    return { AND: and };
  }

  @Get("audit")
  async auditLog(@Query() q: Record<string, string>) {
    const where = this.auditWhere(q);
    const size = /^\d+$/.test(q.page_size ?? "") && Number(q.page_size) > 0 ? Math.min(Number(q.page_size), 200) : 50;
    const page = /^\d+$/.test(q.page ?? "") && Number(q.page) > 0 ? Number(q.page) : 1;
    const [count, rows] = await Promise.all([
      this.prisma.auditLog.count({ where }),
      this.prisma.auditLog.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: (page - 1) * size, take: size }),
    ]);
    return {
      count, page, page_size: size,
      results: rows.map((a) => ({
        id: a.id, created_at: isoLocal(a.createdAt), actor: a.actorLabel || "(anônimo)", action: a.action, action_label: ACTIONS[a.action] ?? a.action,
        company: a.companyLabel, target_type: a.targetType, target: a.targetLabel, summary: summary(a), details: a.details, ip: a.ip,
      })),
    };
  }

  /** Excel do log com os filtros atuais (até 20.000 registros mais recentes). */
  @Get("audit/export")
  async auditExport(@Query() q: Record<string, string>, @ReqDec() req: Req) {
    const where = this.auditWhere(q);
    const rows = await this.prisma.auditLog.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 20_000 });
    await this.audit.record(req, "audit.export", { details: { filtros: Object.fromEntries(Object.entries(q).filter(([, v]) => v)) } });
    const { fmt } = await import("../common/tz");
    return workbookResponse("auditoria.xlsx", [["Auditoria", ["Quando", "Quem", "Ação", "Empresa", "Tipo do alvo", "Alvo", "Detalhes", "IP"],
      rows.map((a) => [fmt(a.createdAt, "dd/MM/yyyy HH:mm:ss"), a.actorLabel || "(anônimo)", ACTIONS[a.action] ?? a.action, a.companyLabel, a.targetType, a.targetLabel, summary(a), a.ip])]]);
  }

  @Get("audit/options")
  async auditOptions() {
    return {
      actions: Object.entries(ACTIONS).map(([code, label]) => ({ code, label })),
      companies: await this.prisma.company.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    };
  }
}
