/** Painel: serviços, profissionais e bloqueios de datas da empresa do cabeçalho X-Company (CRUD). */
import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Put, Req as ReqDec } from "@nestjs/common";
import { ApiError, bad, notFound } from "../common/api-error";
import { AuditService, diff, snapshot, tProfessional, tService, tTimeOff } from "../common/audit.service";
import { resolveCompany } from "../common/auth";
import { money } from "../common/appointments.service";
import { Prisma, PrismaService } from "../common/prisma.service";
import { refreshSearchText } from "../common/search";
import type { Req } from "../common/types";
import { dateCol, ymdOf } from "../common/tz";
import { V, toCamel, toSnake } from "../common/validate";
import { idParam } from "./serializers";

const LINKED = "Há agendamentos vinculados. Desative em vez de excluir.";

// ---------------------------------------------------------------- Serviços
const serviceOut = (s: { id: number; name: string; description: string }) => ({ id: s.id, name: s.name, description: s.description });

@Controller("admin/services")
export class AdminServicesController {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  private async find(req: Req, id: string) {
    const company = resolveCompany(req);
    const s = await this.prisma.service.findFirst({ where: { id: idParam(id), companyId: company.id } });
    if (!s) throw notFound();
    return { company, s };
  }

  private parse(body: any, partial: boolean) {
    const v = new V(body, partial);
    const d = { name: v.str("name", { max: 100 }), description: v.str("description", { max: 255, required: false, blank: true }) };
    v.done();
    return Object.fromEntries(Object.entries(d).filter(([, x]) => x !== undefined));
  }

  @Get() async list(@ReqDec() req: Req) {
    const company = resolveCompany(req);
    return (await this.prisma.service.findMany({ where: { companyId: company.id }, orderBy: [{ name: "asc" }, { id: "asc" }] })).map(serviceOut);
  }

  @Get(":id") async retrieve(@Param("id") id: string, @ReqDec() req: Req) {
    return serviceOut((await this.find(req, id)).s);
  }

  @Post() async create(@Body() body: any, @ReqDec() req: Req) {
    const company = resolveCompany(req);
    const s = await this.prisma.service.create({ data: { ...(this.parse(body, false) as any), companyId: company.id } });
    await refreshSearchText(this.prisma, company.id);
    await this.audit.record(req, "service.create", { company, target: tService(s) });
    return serviceOut(s);
  }

  private async update(id: string, body: any, req: Req, partial: boolean) {
    const { company, s } = await this.find(req, id);
    const d = this.parse(body, partial);
    const before = snapshot(toSnake(s), d);
    const updated = await this.prisma.service.update({ where: { id: s.id }, data: d });
    await refreshSearchText(this.prisma, company.id);
    await this.audit.record(req, "service.update", { company, target: tService(updated), details: diff(before, toSnake(updated), d) });
    return serviceOut(updated);
  }

  @Put(":id") put(@Param("id") id: string, @Body() body: any, @ReqDec() req: Req) { return this.update(id, body, req, false); }
  @Patch(":id") patch(@Param("id") id: string, @Body() body: any, @ReqDec() req: Req) { return this.update(id, body, req, true); }

  @Delete(":id") @HttpCode(204)
  async remove(@Param("id") id: string, @ReqDec() req: Req) {
    const { company, s } = await this.find(req, id);
    if (await this.prisma.appointment.count({ where: { serviceId: s.id } })) throw bad(LINKED);
    await this.prisma.service.delete({ where: { id: s.id } });
    await refreshSearchText(this.prisma, company.id);
    await this.audit.record(req, "service.delete", { company, target: tService(s), label: s.name, targetId: s.id });
  }
}

// ----------------------------------------------------------- Profissionais
const PRO_INCLUDE = {
  offers: { orderBy: { id: "asc" } },
  workingHours: { orderBy: [{ weekday: "asc" }, { startTime: "asc" }, { id: "asc" }] },
  breaks: { orderBy: [{ weekday: "asc" }, { startTime: "asc" }, { id: "asc" }] },
} satisfies Prisma.ProfessionalInclude;
type ProFull = Prisma.ProfessionalGetPayload<{ include: typeof PRO_INCLUDE }>;

const proOut = (p: ProFull) => ({
  id: p.id, name: p.name, bio: p.bio, active: p.active, slot_minutes: p.slotMinutes, buffer_minutes: p.bufferMinutes,
  offers: p.offers.map((o) => ({ service: o.serviceId, duration_minutes: o.durationMinutes, price: money(o.price), slot_minutes: o.slotMinutes })),
  working_hours: p.workingHours.map((h) => ({ weekday: h.weekday, start_time: h.startTime, end_time: h.endTime, slot_minutes: h.slotMinutes })),
  breaks: p.breaks.map((b) => ({ weekday: b.weekday, start_time: b.startTime, end_time: b.endTime, label: b.label })),
});

/** Valida cada item de uma lista aninhada; erros no formato `[{}, {campo: [msg]}]` como o DRF. */
function nested<T>(items: Record<string, any>[], fn: (v: V) => T | null): T[] | { __errors: unknown[] } {
  const out: T[] = [], errs: unknown[] = []; let bad_ = false;
  for (const it of items) {
    const v = new V(it ?? {});
    const row = fn(v);
    if (Object.keys(v.errors).length) { errs.push(v.errors); bad_ = true; } else { errs.push({}); out.push(row as T); }
  }
  return bad_ ? { __errors: errs } : out;
}
const rangeCheck = (v: V, a?: string, b?: string) => { if (a && b && b <= a) v.fail("non_field_errors", "O fim deve ser depois do início."); };

@Controller("admin/professionals")
export class AdminProfessionalsController {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  private async find(req: Req, id: string) {
    const company = resolveCompany(req);
    const p = await this.prisma.professional.findFirst({ where: { id: idParam(id), companyId: company.id }, include: PRO_INCLUDE });
    if (!p) throw notFound();
    return { company, p };
  }

  /** Valida o corpo; `simple` são os campos do profissional e as listas só aparecem se foram enviadas (substituição total). */
  private async parse(body: any, partial: boolean, companyId: number) {
    const v = new V(body, partial);
    const simple: Record<string, any> = {
      name: v.str("name", { max: 120 }), bio: v.str("bio", { max: 255, required: false, blank: true }), active: v.bool("active"),
      slot_minutes: v.int("slot_minutes", { min: 5, required: false }), buffer_minutes: v.int("buffer_minutes", { min: 0, required: false }),
    };
    const lists: { offers?: any[]; working_hours?: any[]; breaks?: any[] } = {};

    const rawOffers = v.list("offers");
    if (rawOffers) {
      const r = nested(rawOffers, (iv) => {
        const service = iv.pk("service") as number;
        const row = {
          serviceId: service, durationMinutes: (iv.int("duration_minutes", { min: 5, required: false }) as number | undefined) ?? 30,
          price: iv.decimal("price", { digits: 8, places: 2, nullable: true }) ?? null, slotMinutes: (iv.int("slot_minutes", { min: 5, required: false, nullable: true }) as number | null | undefined) ?? null,
        };
        return row;
      });
      if ("__errors" in r) v.errors.offers = r.__errors;
      else {
        const ids = r.map((o) => o.serviceId);
        if (ids.length !== new Set(ids).size) v.fail("offers", "Serviço repetido na lista de serviços oferecidos.");
        else {
          const found = await this.prisma.service.findMany({ where: { id: { in: ids } }, select: { id: true, companyId: true } });
          if (found.length !== new Set(ids).size) v.fail("offers", "Pk inválido - objeto não existe.");
          else if (found.some((s) => s.companyId !== companyId)) v.fail("offers", "Há serviço que não pertence a esta empresa.");
          else lists.offers = r;
        }
      }
    }
    for (const key of ["working_hours", "breaks"] as const) {
      const raw = v.list(key);
      if (!raw) continue;
      const r = nested(raw, (iv) => {
        const weekday = iv.int("weekday", { min: 0, max: 6 }) as number;
        const start = iv.time("start_time"), end = iv.time("end_time");
        rangeCheck(iv, start, end);
        return key === "working_hours"
          ? { weekday, startTime: start!, endTime: end!, slotMinutes: (iv.int("slot_minutes", { min: 5, required: false, nullable: true }) as number | null | undefined) ?? null }
          : { weekday, startTime: start!, endTime: end!, label: iv.str("label", { max: 60, required: false, blank: true }) ?? "" };
      });
      if ("__errors" in r) v.errors[key] = r.__errors; else lists[key] = r;
    }
    v.done();
    return { simple: Object.fromEntries(Object.entries(simple).filter(([, x]) => x !== undefined)), lists };
  }

  /** Grava o profissional e substitui as listas enviadas, tudo numa transação. */
  private async save(id: number | null, companyId: number, simple: Record<string, any>, lists: Record<string, any[] | undefined>) {
    return this.prisma.$transaction(async (tx) => {
      const pro = id
        ? await tx.professional.update({ where: { id }, data: toCamel(simple) })
        : await tx.professional.create({ data: { ...(toCamel(simple) as any), companyId } });
      if (lists.offers) { await tx.professionalService.deleteMany({ where: { professionalId: pro.id } }); await tx.professionalService.createMany({ data: lists.offers.map((o) => ({ ...o, professionalId: pro.id })) }); }
      if (lists.working_hours) { await tx.workingHours.deleteMany({ where: { professionalId: pro.id } }); await tx.workingHours.createMany({ data: lists.working_hours.map((o) => ({ ...o, professionalId: pro.id })) }); }
      if (lists.breaks) { await tx.break.deleteMany({ where: { professionalId: pro.id } }); await tx.break.createMany({ data: lists.breaks.map((o) => ({ ...o, professionalId: pro.id })) }); }
      await refreshSearchText(tx, companyId);
      return tx.professional.findUniqueOrThrow({ where: { id: pro.id }, include: PRO_INCLUDE });
    });
  }

  @Get() async list(@ReqDec() req: Req) {
    const company = resolveCompany(req);
    return (await this.prisma.professional.findMany({ where: { companyId: company.id }, orderBy: [{ name: "asc" }, { id: "asc" }], include: PRO_INCLUDE })).map(proOut);
  }

  @Get(":id") async retrieve(@Param("id") id: string, @ReqDec() req: Req) { return proOut((await this.find(req, id)).p); }

  @Post() async create(@Body() body: any, @ReqDec() req: Req) {
    const company = resolveCompany(req);
    const { simple, lists } = await this.parse(body, false, company.id);
    const p = await this.save(null, company.id, simple, lists);
    await this.audit.record(req, "professional.create", { company, target: tProfessional(p) });
    return proOut(p);
  }

  private async update(id: string, body: any, req: Req, partial: boolean) {
    const { company, p } = await this.find(req, id);
    const { simple, lists } = await this.parse(body, partial, company.id);
    const before = snapshot(toSnake(p), simple);
    const updated = await this.save(p.id, company.id, simple, lists);
    // Aninhados reenviados entram no log como "alterou: [...]" (sem detalhar o conteúdo).
    await this.audit.record(req, "professional.update", { company, target: tProfessional(updated), details: diff(before, toSnake(updated), { ...simple, ...lists }) });
    return proOut(updated);
  }

  @Put(":id") put(@Param("id") id: string, @Body() body: any, @ReqDec() req: Req) { return this.update(id, body, req, false); }
  @Patch(":id") patch(@Param("id") id: string, @Body() body: any, @ReqDec() req: Req) { return this.update(id, body, req, true); }

  @Delete(":id") @HttpCode(204)
  async remove(@Param("id") id: string, @ReqDec() req: Req) {
    const { company, p } = await this.find(req, id);
    if (await this.prisma.appointment.count({ where: { professionalId: p.id } })) throw bad(LINKED);
    await this.prisma.professional.delete({ where: { id: p.id } });
    await refreshSearchText(this.prisma, company.id);
    await this.audit.record(req, "professional.delete", { company, target: tProfessional(p), label: p.name, targetId: p.id });
  }
}

// -------------------------------------------------------------- Bloqueios
const TIMEOFF_INCLUDE = { professional: { select: { name: true } } } satisfies Prisma.TimeOffInclude;
type TimeOffFull = Prisma.TimeOffGetPayload<{ include: typeof TIMEOFF_INCLUDE }>;

@Controller("admin/time-off")
export class AdminTimeOffController {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  /** Quantos agendamentos futuros confirmados caem no período bloqueado. */
  private async affected(t: TimeOffFull): Promise<number> {
    const from = dateCol(ymdOf(t.startDate)), to = dateCol(ymdOf(t.endDate));
    const rows = await this.prisma.$queryRaw<{ n: number }[]>`
      SELECT COUNT(*)::int AS n FROM appointments a JOIN professionals p ON p.id = a.professional_id
       WHERE p.company_id = ${t.companyId} AND a.status = 'confirmed' AND a.start >= now()
         AND (a.start AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN ${from}::date AND ${to}::date
         AND (${t.professionalId}::int IS NULL OR a.professional_id = ${t.professionalId}::int)`;
    return rows[0].n;
  }

  private async out(t: TimeOffFull) {
    return {
      id: t.id, professional: t.professionalId, professional_name: t.professional?.name ?? null,
      start_date: ymdOf(t.startDate), end_date: ymdOf(t.endDate), reason: t.reason, affected_appointments: await this.affected(t),
    };
  }

  private async find(req: Req, id: string) {
    const company = resolveCompany(req);
    const t = await this.prisma.timeOff.findFirst({ where: { id: idParam(id), companyId: company.id }, include: TIMEOFF_INCLUDE });
    if (!t) throw notFound();
    return { company, t };
  }

  private async parse(body: any, partial: boolean, companyId: number, current?: TimeOffFull) {
    const v = new V(body, partial);
    const d = {
      professional_id: v.pk("professional", { required: false, nullable: true }),
      start_date: v.date("start_date", { required: !partial }), end_date: v.date("end_date", { required: !partial }),
      reason: v.str("reason", { max: 120, required: false, blank: true }),
    };
    if (d.professional_id) {
      const pro = await this.prisma.professional.findUnique({ where: { id: d.professional_id as number } });
      if (!pro) v.fail("professional", `Pk inválido "${d.professional_id}" - objeto não existe.`);
      else if (pro.companyId !== companyId) v.fail("non_field_errors", "Profissional de outra empresa.");
    }
    const start = d.start_date ?? (current && ymdOf(current.startDate)), end = d.end_date ?? (current && ymdOf(current.endDate));
    if (start && end && end < start) v.fail("non_field_errors", "A data final deve ser igual ou posterior à inicial.");
    v.done();
    return Object.fromEntries(Object.entries(d).filter(([, x]) => x !== undefined));
  }

  private data(d: Record<string, any>) {
    const { start_date, end_date, ...rest } = d;
    return { ...toCamel(rest), ...(start_date ? { startDate: dateCol(start_date) } : {}), ...(end_date ? { endDate: dateCol(end_date) } : {}) };
  }

  @Get() async list(@ReqDec() req: Req) {
    const company = resolveCompany(req);
    const rows = await this.prisma.timeOff.findMany({ where: { companyId: company.id }, orderBy: [{ startDate: "asc" }, { id: "asc" }], include: TIMEOFF_INCLUDE });
    return Promise.all(rows.map((t) => this.out(t)));
  }

  @Get(":id") async retrieve(@Param("id") id: string, @ReqDec() req: Req) { return this.out((await this.find(req, id)).t); }

  @Post() async create(@Body() body: any, @ReqDec() req: Req) {
    const company = resolveCompany(req);
    const d = await this.parse(body, false, company.id);
    const t = await this.prisma.timeOff.create({ data: { ...(this.data(d) as any), companyId: company.id }, include: TIMEOFF_INCLUDE });
    await this.audit.record(req, "timeoff.create", { company, target: tTimeOff(t) });
    return this.out(t);
  }

  private async update(id: string, body: any, req: Req, partial: boolean) {
    const { company, t } = await this.find(req, id);
    const d = await this.parse(body, partial, company.id, t);
    const before = snapshot(toSnake(t), d);
    const updated = await this.prisma.timeOff.update({ where: { id: t.id }, data: this.data(d), include: TIMEOFF_INCLUDE });
    await this.audit.record(req, "timeoff.update", { company, target: tTimeOff(updated), details: diff(before, toSnake(updated), d) });
    return this.out(updated);
  }

  @Put(":id") put(@Param("id") id: string, @Body() body: any, @ReqDec() req: Req) { return this.update(id, body, req, false); }
  @Patch(":id") patch(@Param("id") id: string, @Body() body: any, @ReqDec() req: Req) { return this.update(id, body, req, true); }

  @Delete(":id") @HttpCode(204)
  async remove(@Param("id") id: string, @ReqDec() req: Req) {
    const { company, t } = await this.find(req, id);
    await this.prisma.timeOff.delete({ where: { id: t.id } });
    await this.audit.record(req, "timeoff.delete", { company, target: tTimeOff(t), label: tTimeOff(t).label, targetId: t.id });
  }
}
