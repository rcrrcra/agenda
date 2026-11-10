/**
 * Relatórios de atendimentos: resumo do dashboard, tabela paginada e exportação (CSV e Excel).
 * Acesso: admin geral (todas as empresas) e administradores (só as empresas deles). Filtros (query string):
 * `from`/`to` (AAAA-MM-DD, padrão: últimos 30 dias), `company`, `professional`, `service` (ids separados por vírgula)
 * e `status` (`confirmed`, `completed`, `no_show`, `canceled` ou `pending` = confirmado já passado).
 * Receita = soma do preço (congelado no agendamento) dos atendimentos CONCLUÍDOS.
 */
import { Controller, Get, Query, Req as ReqDec, StreamableFile } from "@nestjs/common";
import { ApiError, forbidden } from "../common/api-error";
import { STATUS_LABEL } from "../common/appointments.service";
import { AuditService } from "../common/audit.service";
import { ReportsAccess } from "../common/auth";
import { Prisma, PrismaService } from "../common/prisma.service";
import type { Req } from "../common/types";
import { addDays, dayEnd, dayStart, fmt, isYmd, isoLocal, today } from "../common/tz";
import { workbookResponse } from "../common/xlsx";

const DEFAULT_DAYS = 30, MAX_DAYS = 800, DAILY_LIMIT_DAYS = 62, EXPORT_LIMIT = 50_000;
const WEEKDAYS = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"];
const STATUSES = ["confirmed", "completed", "no_show", "canceled"];

interface Filters { from: string; to: string; companyIds: number[]; professionals: number[]; services: number[]; status: string }

const METRICS = Prisma.raw(`
  COUNT(a.id)::int AS total,
  COUNT(a.id) FILTER (WHERE a.status = 'confirmed')::int AS confirmed,
  COUNT(a.id) FILTER (WHERE a.status = 'completed')::int AS completed,
  COUNT(a.id) FILTER (WHERE a.status = 'no_show')::int AS no_show,
  COUNT(a.id) FILTER (WHERE a.status = 'canceled')::int AS canceled,
  COALESCE(SUM(a.price) FILTER (WHERE a.status = 'completed'), 0)::float8 AS revenue,
  COALESCE(SUM(a.price) FILTER (WHERE a.status = 'confirmed'), 0)::float8 AS revenue_expected,
  AVG(r.rating)::float8 AS rating_avg,
  COUNT(r.id)::int AS rating_count`);
const FROM = Prisma.raw(`FROM appointments a JOIN professionals p ON p.id = a.professional_id JOIN companies c ON c.id = p.company_id
  JOIN services s ON s.id = a.service_id LEFT JOIN reviews r ON r.appointment_id = a.id`);
const LOCAL = "a.start AT TIME ZONE 'America/Sao_Paulo'";

const r1 = (n: number) => Math.round(n * 10) / 10;
/** Acrescenta as taxas calculadas e arredonda (como o `_clean` do Django). */
function clean(row: Record<string, any>) {
  const out: Record<string, any> = { ...row };
  out.rating_avg = row.rating_avg ? r1(row.rating_avg) : null;
  out.rating_count ??= 0;
  const done = out.completed + out.no_show;
  out.attendance_rate = done ? r1((out.completed / done) * 100) : null; // compareceu / (compareceu + faltou)
  out.cancel_rate = out.total ? r1((out.canceled / out.total) * 100) : null;
  out.avg_ticket = out.completed ? Math.round((out.revenue / out.completed) * 100) / 100 : null;
  return out;
}

const idList = (raw: string | undefined, key: string): number[] => {
  const parts = (raw ?? "").trim().split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.some((p) => !/^\d+$/.test(p))) throw new ApiError(400, { [key]: ["Use ids numéricos separados por vírgula."] });
  return parts.map(Number);
};
const dayParam = (raw: string | undefined, key: string, def: string): string => {
  if (!raw?.trim()) return def;
  if (!isYmd(raw.trim())) throw new ApiError(400, { [key]: ["Data inválida (use AAAA-MM-DD)."] });
  return raw.trim();
};
const daysBetween = (a: string, b: string) => Math.round((dayStart(b).getTime() - dayStart(a).getTime()) / 86_400_000);

@ReportsAccess()
@Controller("reports")
export class ReportsController {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  private scope(req: Req): Promise<number[]> | number[] {
    return req.user!.isSuperuser
      ? this.prisma.company.findMany({ select: { id: true } }).then((r) => r.map((c) => c.id))
      : req.user!.memberships.map((m) => m.companyId);
  }

  /** Filtros validados dentro do escopo do usuário. `override` troca o período (comparação com o período anterior). */
  private async filters(req: Req, q: Record<string, string>, override?: [string, string]): Promise<Filters> {
    const scope = await this.scope(req);
    let from: string, to: string;
    if (override) [from, to] = override;
    else {
      to = dayParam(q.to, "to", today());
      from = dayParam(q.from, "from", addDays(to, -(DEFAULT_DAYS - 1)));
      if (from > to) throw new ApiError(400, { from: ["A data inicial é maior que a final."] });
      if (daysBetween(from, to) > MAX_DAYS) throw new ApiError(400, { from: [`Período máximo: ${MAX_DAYS} dias.`] });
    }
    const companies = idList(q.company, "company");
    if (companies.length && !companies.every((c) => scope.includes(c))) throw forbidden("Você não tem acesso a esta empresa.");
    let status = q.status ?? "";
    if (status && status !== "pending" && !STATUSES.includes(status)) throw new ApiError(400, { status: ["Situação inválida."] });
    return { from, to, companyIds: companies.length ? companies : scope, professionals: idList(q.professional, "professional"), services: idList(q.service, "service"), status };
  }

  private sqlWhere(f: Filters): Prisma.Sql {
    const parts = [Prisma.sql`p.company_id = ANY(${f.companyIds}::int[])`, Prisma.sql`a.start >= ${dayStart(f.from)}`, Prisma.sql`a.start < ${dayEnd(f.to)}`];
    if (f.professionals.length) parts.push(Prisma.sql`a.professional_id = ANY(${f.professionals}::int[])`);
    if (f.services.length) parts.push(Prisma.sql`a.service_id = ANY(${f.services}::int[])`);
    if (f.status === "pending") parts.push(Prisma.sql`a.status = 'confirmed' AND a.start < now()`);
    else if (f.status) parts.push(Prisma.sql`a.status = ${f.status}`);
    return Prisma.sql`WHERE ${Prisma.join(parts, " AND ")}`;
  }

  private prismaWhere(f: Filters): Prisma.AppointmentWhereInput {
    return {
      professional: { companyId: { in: f.companyIds } },
      start: { gte: dayStart(f.from), lt: dayEnd(f.to), ...(f.status === "pending" ? { lt: new Date(Math.min(dayEnd(f.to).getTime(), Date.now())) } : {}) },
      ...(f.professionals.length ? { professionalId: { in: f.professionals } } : {}),
      ...(f.services.length ? { serviceId: { in: f.services } } : {}),
      ...(f.status === "pending" ? { status: "confirmed" } : f.status ? { status: f.status } : {}),
    };
  }

  private async totals(f: Filters) {
    const rows = await this.prisma.$queryRaw<any[]>(Prisma.sql`SELECT ${METRICS} ${FROM} ${this.sqlWhere(f)}`);
    return clean(rows[0]);
  }

  /** Métricas por grupo: `select`/`group` são trechos SQL fixos deste arquivo (nunca vêm do usuário). */
  private async grouped(f: Filters, select: string, group: string, order = "total DESC, label ASC", limit?: number) {
    const rows = await this.prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT ${Prisma.raw(select)}, ${METRICS} ${FROM} ${this.sqlWhere(f)}
      GROUP BY ${Prisma.raw(group)} ORDER BY ${Prisma.raw(order)} ${limit ? Prisma.sql`LIMIT ${limit}` : Prisma.empty}`);
    return rows.map(clean);
  }

  /** Clientes distintos (sem contar cancelados) separados em novos e recorrentes (já tinham atendimento antes do período). */
  private async customerMix(f: Filters) {
    const cur = await this.prisma.$queryRaw<{ customer_id: number }[]>(Prisma.sql`
      SELECT DISTINCT a.customer_id ${FROM} ${this.sqlWhere(f)} AND a.status <> 'canceled'`);
    const ids = cur.map((r) => r.customer_id);
    if (!ids.length) return { total: 0, new: 0, recurring: 0 };
    const back = await this.prisma.$queryRaw<{ customer_id: number }[]>(Prisma.sql`
      SELECT DISTINCT a.customer_id FROM appointments a JOIN professionals p ON p.id = a.professional_id
       WHERE a.customer_id = ANY(${ids}::int[]) AND p.company_id = ANY(${f.companyIds}::int[]) AND a.start < ${dayStart(f.from)} AND a.status <> 'canceled'`);
    return { total: ids.length, new: ids.length - back.length, recurring: back.length };
  }

  /** Opções dos filtros dentro do escopo do usuário. */
  @Get("options")
  async options(@ReqDec() req: Req) {
    const scope = await this.scope(req);
    const [companies, professionals, services] = await Promise.all([
      this.prisma.company.findMany({ where: { id: { in: scope } }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
      this.prisma.professional.findMany({ where: { companyId: { in: scope } }, orderBy: { name: "asc" }, select: { id: true, name: true, companyId: true } }),
      this.prisma.service.findMany({ where: { companyId: { in: scope } }, orderBy: { name: "asc" }, select: { id: true, name: true, companyId: true } }),
    ]);
    return { companies, professionals: professionals.map((p) => ({ id: p.id, name: p.name, company: p.companyId })), services: services.map((s) => ({ id: s.id, name: s.name, company: s.companyId })) };
  }

  /** Dashboard: totais, comparação com o período anterior, clientes novos x recorrentes e rankings. */
  @Get("summary")
  async summary(@Query() q: Record<string, string>, @ReqDec() req: Req) {
    const f = await this.filters(req, q);
    const days = daysBetween(f.from, f.to) + 1;
    const monthly = days > DAILY_LIMIT_DAYS;
    const prevEnd = addDays(f.from, -1), prevStart = addDays(prevEnd, -(days - 1));
    const prev = await this.filters(req, q, [prevStart, prevEnd]);

    const bucket = monthly ? `to_char(date_trunc('month', ${LOCAL}), 'YYYY-MM-DD')` : `to_char(${LOCAL}, 'YYYY-MM-DD')`;
    const [totals, prevTotals, customers, prevCustomers, byPeriod, weekdays, byPro, bySvc, byCompany] = await Promise.all([
      this.totals(f), this.totals(prev), this.customerMix(f), this.customerMix(prev),
      this.grouped(f, `${bucket} AS label`, "label", "label ASC"),
      this.grouped(f, `EXTRACT(ISODOW FROM ${LOCAL})::int AS weekday`, "weekday", "weekday ASC"),
      this.grouped(f, "a.professional_id, p.name AS label, c.name AS company", "a.professional_id, p.name, c.name", "total DESC, label ASC", 15),
      this.grouped(f, "a.service_id, s.name AS label, c.name AS company", "a.service_id, s.name, c.name", "total DESC, label ASC", 15),
      this.grouped(f, "p.company_id AS \"professional__company_id\", c.name AS label", "p.company_id, c.name", "total DESC, label ASC", 15),
    ]);
    const zero = clean({ total: 0, confirmed: 0, completed: 0, no_show: 0, canceled: 0, revenue: 0, revenue_expected: 0, rating_count: 0 });
    const byWeekday = WEEKDAYS.map((label, i) => ({ ...zero, ...(weekdays.find((w) => w.weekday === i + 1) ?? {}), label }));
    return {
      period: { from: f.from, to: f.to, days, granularity: monthly ? "month" : "day" },
      totals,
      previous: { from: prevStart, to: prevEnd, totals: prevTotals, customers: prevCustomers },
      customers,
      by_period: byPeriod,
      by_weekday: byWeekday,
      by_professional: byPro.map(({ ...r }) => r),
      by_service: bySvc,
      by_company: byCompany,
    };
  }

  /** Tabela de atendimentos, paginada e ordenável (`ordering=-start`, `page`, `page_size`). */
  @Get("appointments")
  async appointments(@Query() q: Record<string, string>, @ReqDec() req: Req) {
    const f = await this.filters(req, q);
    const key = q.ordering || "-start";
    const dir: "asc" | "desc" = key.startsWith("-") ? "desc" : "asc";
    const orders: Record<string, Prisma.AppointmentOrderByWithRelationInput> = {
      start: { start: dir }, company: { professional: { company: { name: dir } } }, professional: { professional: { name: dir } },
      service: { service: { name: dir } }, customer: { customer: { firstName: dir } }, status: { status: dir }, price: { price: dir },
    };
    const order = orders[key.replace(/^-/, "")];
    if (!order) throw new ApiError(400, { ordering: ["Ordenação inválida."] });
    const size = /^\d+$/.test(q.page_size ?? "") && Number(q.page_size) > 0 ? Math.min(Number(q.page_size), 200) : 50;
    const page = /^\d+$/.test(q.page ?? "") && Number(q.page) > 0 ? Number(q.page) : 1;
    const where = this.prismaWhere(f);
    const [count, rows] = await Promise.all([
      this.prisma.appointment.count({ where }),
      this.prisma.appointment.findMany({
        where, orderBy: [order, { start: "desc" }, { id: "desc" }], skip: (page - 1) * size, take: size,
        include: { professional: { include: { company: true } }, service: true, customer: true },
      }),
    ]);
    return {
      count, page, page_size: size,
      results: rows.map((a) => ({
        id: a.id, start: isoLocal(a.start), end: isoLocal(a.end), company: a.professional.company.name, professional: a.professional.name, service: a.service.name,
        customer_name: a.customer.firstName || a.customer.email, customer_email: a.customer.email, status: a.status, status_label: STATUS_LABEL[a.status],
        price: a.price == null ? null : Number(a.price), notes: a.notes,
      })),
    };
  }

  private exportRows(f: Filters) {
    return this.prisma.appointment.findMany({
      where: this.prismaWhere(f), orderBy: [{ start: "asc" }, { id: "asc" }], take: EXPORT_LIMIT,
      include: { professional: { include: { company: true } }, service: true, customer: true },
    });
  }

  /** CSV (separador `;`, UTF-8 com BOM: abre direto no Excel em português). */
  @Get("export")
  async exportCsv(@Query() q: Record<string, string>, @ReqDec() req: Req) {
    const f = await this.filters(req, q);
    const rows = await this.exportRows(f);
    await this.audit.record(req, "report.export", { details: { periodo: `${f.from} a ${f.to}`, filtros: Object.fromEntries(Object.entries(q).filter(([, v]) => v)) } });
    // Evita injeção de fórmula: texto iniciado por = + - @ vira texto literal.
    const safe = (t: unknown) => { const s = t == null ? "" : String(t); return /^[=+\-@\t\r]/.test(s) ? "'" + s : s; };
    const cell = (s: string) => (/[;"\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
    const lines = [["Data", "Início", "Fim", "Empresa", "Profissional", "Serviço", "Cliente", "E-mail", "Situação", "Preço (R$)", "Observações"],
      ...rows.map((a) => [fmt(a.start, "dd/MM/yyyy"), fmt(a.start, "HH:mm"), fmt(a.end, "HH:mm"), safe(a.professional.company.name), safe(a.professional.name), safe(a.service.name),
        safe(a.customer.firstName || a.customer.email), safe(a.customer.email), STATUS_LABEL[a.status], a.price == null ? "" : a.price.toFixed(2).replace(".", ","), safe(a.notes)])];
    const body = "﻿" + lines.map((l) => l.map(cell).join(";")).join("\r\n") + "\r\n";
    return new StreamableFile(Buffer.from(body, "utf8"), { type: "text/csv; charset=utf-8", disposition: `attachment; filename="atendimentos_${f.from}_${f.to}.csv"` });
  }

  /** Excel: abas Resumo, Profissionais, Serviços e Atendimentos. */
  @Get("export-xlsx")
  async exportXlsx(@Query() q: Record<string, string>, @ReqDec() req: Req) {
    const f = await this.filters(req, q);
    await this.audit.record(req, "report.export", { details: { periodo: `${f.from} a ${f.to}`, formato: "xlsx", filtros: Object.fromEntries(Object.entries(q).filter(([, v]) => v)) } });
    const [t, mix, pros, svcs, rows] = await Promise.all([
      this.totals(f), this.customerMix(f),
      this.grouped(f, "a.professional_id, p.name AS label, c.name AS company", "a.professional_id, p.name, c.name"),
      this.grouped(f, "a.service_id, s.name AS label, c.name AS company", "a.service_id, s.name, c.name"),
      this.exportRows(f),
    ]);
    const br = (ymd: string) => ymd.split("-").reverse().join("/");
    const e = (v: unknown) => (v === null || v === undefined ? "" : (v as string | number));
    const resumo = [["Período", `${br(f.from)} a ${br(f.to)}`], ["Atendimentos", t.total], ["Concluídos", t.completed], ["Faltas", t.no_show], ["Cancelados", t.canceled], ["Confirmados", t.confirmed],
      ["Taxa de comparecimento (%)", e(t.attendance_rate)], ["Receita (R$)", t.revenue], ["Ticket médio (R$)", e(t.avg_ticket)], ["Nota média", e(t.rating_avg)], ["Avaliações", t.rating_count],
      ["Clientes novos", mix.new], ["Clientes recorrentes", mix.recurring]];
    const head = ["Nome", "Empresa", "Atendimentos", "Concluídos", "Faltas", "Cancelados", "Receita (R$)", "Nota média", "Avaliações"];
    const group = (g: any[]) => g.map((r) => [r.label, r.company ?? "", r.total, r.completed, r.no_show, r.canceled, r.revenue, e(r.rating_avg), r.rating_count]);
    return workbookResponse(`atendimentos_${f.from}_${f.to}.xlsx`, [
      ["Resumo", ["Indicador", "Valor"], resumo], ["Profissionais", head, group(pros)], ["Serviços", head, group(svcs)],
      ["Atendimentos", ["Data", "Início", "Fim", "Empresa", "Profissional", "Serviço", "Cliente", "E-mail", "Situação", "Preço (R$)", "Observações"],
        rows.map((a) => [fmt(a.start, "dd/MM/yyyy"), fmt(a.start, "HH:mm"), fmt(a.end, "HH:mm"), a.professional.company.name, a.professional.name, a.service.name,
          a.customer.firstName || a.customer.email, a.customer.email, STATUS_LABEL[a.status], a.price == null ? null : Number(a.price), a.notes])]]);
  }
}
