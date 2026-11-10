/** Painel: agenda da empresa (listar, reservar pela equipe, cancelar, concluir, faltou, reabrir), clientes e histórico. */
import { Body, Controller, Get, HttpCode, Param, Post, Put, Query, Req as ReqDec } from "@nestjs/common";
import { ApiError, bad, notFound } from "../common/api-error";
import { APPT_INCLUDE, AppointmentsService, STATUS_LABEL, appointmentOut } from "../common/appointments.service";
import { AuditService, tAppointment, tUser } from "../common/audit.service";
import { resolveCompany } from "../common/auth";
import { MailService } from "../common/mail.service";
import { hasUsablePassword, unusablePassword } from "../common/password";
import { Prisma, PrismaService } from "../common/prisma.service";
import type { Req } from "../common/types";
import { dayEnd, dayStart, isYmd, isoLocal, isoUtc } from "../common/tz";
import { V } from "../common/validate";
import { parseBooking, refuseIfFinished } from "./appointments.controller";
import { idParam } from "./serializers";

const dateParam = (q: Record<string, string>, key: string): string | null => {
  if (!q[key]) return null;
  if (!isYmd(q[key])) throw new ApiError(400, { [key]: "Data inválida (use AAAA-MM-DD)." });
  return q[key];
};

@Controller("admin/appointments")
export class AdminAppointmentsController {
  constructor(
    private readonly prisma: PrismaService, private readonly audit: AuditService,
    private readonly appts: AppointmentsService, private readonly mail: MailService,
  ) {}

  /** Agendamentos da empresa com filtros: professional, status (`pending` = confirmados já passados), from e to. */
  @Get()
  async list(@Query() q: Record<string, string>, @ReqDec() req: Req) {
    const company = resolveCompany(req);
    const where: Prisma.AppointmentWhereInput = { professional: { companyId: company.id } };
    if (q.professional) {
      if (!/^\d+$/.test(q.professional)) throw new ApiError(400, { professional: ["Id inválido."] });
      where.professionalId = Number(q.professional);
    }
    if (q.status === "pending") { where.status = "confirmed"; where.start = { lt: new Date() }; }
    else if (q.status) where.status = q.status;
    const from = dateParam(q, "from"), to = dateParam(q, "to");
    where.start = { ...(where.start as object), ...(from ? { gte: dayStart(from) } : {}), ...(to ? { lt: dayEnd(to) } : {}) };
    const [rows, flagged] = await Promise.all([
      this.prisma.appointment.findMany({ where, include: APPT_INCLUDE, orderBy: [{ start: "asc" }, { id: "asc" }] }),
      this.appts.flaggedCustomerIds(company.id),
    ]);
    return rows.map((a) => appointmentOut(a, flagged));
  }

  /**
   * Reserva em nome de um cliente: `customer_id` (já agendou nesta empresa) OU `new_customer_name` + `new_customer_email`.
   * Cliente novo nasce sem senha e, ao se cadastrar depois com o mesmo e-mail, assume a conta.
   */
  @Post()
  async create(@Body() body: any, @ReqDec() req: Req) {
    const company = resolveCompany(req);
    const v = new V(body);
    const customerId = v.pk("customer_id", { required: false }) as number | undefined;
    const newName = v.str("new_customer_name", { max: 120, required: false });
    const newEmail = v.email("new_customer_email", { required: false });
    // Os campos base (profissional, serviço, início, observações) são validados no mesmo objeto.
    let base: Awaited<ReturnType<typeof parseBooking>> | undefined;
    try { base = await parseBooking(this.prisma, v); } catch (e) { if (!(e instanceof ApiError)) throw e; throw e; }
    if (customerId) {
      const known = await this.prisma.appointment.count({ where: { customerId, professional: { companyId: company.id } } });
      if (!known) throw new ApiError(400, { customer_id: ["Cliente não encontrado nesta empresa. Use 'Novo cliente'."] });
    }
    if (base.pro.companyId !== company.id) throw new ApiError(400, { non_field_errors: ["Profissional de outra empresa."] });
    if (!customerId && !(newName && newEmail)) throw new ApiError(400, { non_field_errors: ["Escolha um cliente ou informe nome e e-mail."] });

    let customer: number;
    if (customerId) customer = customerId;
    else {
      const email = newEmail!.toLowerCase();
      const found = await this.prisma.user.findUnique({ where: { username: email } });
      customer = found?.id ?? (await this.prisma.user.create({ data: { username: email, email, firstName: newName!, passwordHash: unusablePassword() } })).id;
    }
    const appt = await this.appts.book(customer, { professionalId: base.pro.id, serviceId: base.service.id, start: base.start, notes: base.notes }, { actorId: req.user!.id, staff: true });
    await this.audit.record(req, "appointment.create", { company: appt.professional.company, target: tAppointment(appt), details: { origem: "equipe" } });
    return appointmentOut(appt);
  }

  private async find(req: Req, id: string) {
    const company = resolveCompany(req);
    const a = await this.prisma.appointment.findFirst({ where: { id: idParam(id), professional: { companyId: company.id } }, include: APPT_INCLUDE });
    if (!a) throw notFound();
    return { company, a };
  }

  /** Cancela qualquer agendamento da empresa e avisa o cliente por e-mail (idempotente). */
  @Post(":id/cancel") @HttpCode(200)
  async cancel(@Param("id") id: string, @ReqDec() req: Req) {
    let { company, a } = await this.find(req, id);
    refuseIfFinished(a.status);
    if (a.status !== "canceled") {
      await this.prisma.appointment.update({ where: { id: a.id }, data: { status: "canceled" } });
      a = await this.appts.load(a.id);
      await Promise.allSettled([this.mail.sendCancellation(a), this.mail.sendAdminNotice(a, "canceled", req.user!.id)]);
      await this.audit.record(req, "appointment.cancel", { company, target: tAppointment(a), details: { quem: "equipe" } });
    }
    return appointmentOut(a);
  }

  /** Muda a situação de um atendimento já iniciado (concluído / faltou / voltar a confirmado). */
  private async finish(id: string, req: Req, status: string, action: string) {
    const { company, a } = await this.find(req, id);
    if (a.status === "canceled") throw bad("Agendamento cancelado não pode ser alterado.");
    if (status !== "confirmed" && a.start.getTime() > Date.now()) throw bad("O atendimento ainda não começou.");
    await this.prisma.appointment.update({ where: { id: a.id }, data: { status } });
    await this.audit.record(req, action, { company, target: tAppointment(a), details: { de: a.status, para: status } });
    return appointmentOut(await this.appts.load(a.id));
  }

  @Post(":id/complete") @HttpCode(200) complete(@Param("id") id: string, @ReqDec() req: Req) { return this.finish(id, req, "completed", "appointment.complete"); }
  @Post(":id/no-show") @HttpCode(200) noShow(@Param("id") id: string, @ReqDec() req: Req) { return this.finish(id, req, "no_show", "appointment.no_show"); }
  @Post(":id/reopen") @HttpCode(200) reopen(@Param("id") id: string, @ReqDec() req: Req) { return this.finish(id, req, "confirmed", "appointment.reopen"); }
}

const userWhereInCompany = (companyId: number): Prisma.UserWhereInput => ({ appointments: { some: { professional: { companyId } } } });

@Controller("admin")
export class AdminClientsController {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService, private readonly appts: AppointmentsService) {}

  /** Busca clientes DA EMPRESA (quem já agendou nela) por nome ou e-mail; até 10. */
  @Get("customers")
  async customers(@Query("q") q = "", @ReqDec() req: Req) {
    const company = resolveCompany(req);
    q = q.trim();
    const rows = await this.prisma.user.findMany({
      where: { ...userWhereInCompany(company.id), ...(q ? { OR: [{ email: { contains: q, mode: "insensitive" } }, { firstName: { contains: q, mode: "insensitive" } }] } : {}) },
      orderBy: [{ firstName: "asc" }, { email: "asc" }], take: 10,
    });
    return rows.map((u) => ({ id: u.id, name: u.firstName, email: u.email }));
  }

  private row(u: { id: number; firstName: string; email: string }, st: Awaited<ReturnType<AppointmentsService["clientStats"]>> extends Map<number, infer S> ? S | undefined : never) {
    return { id: u.id, name: u.firstName || u.email, email: u.email, ...(st ? { ...st, last_visit: st.last_visit ? isoUtc(st.last_visit) : null } : {}) };
  }

  /** Clientes da empresa com totais e alerta de faltas. `q` (nome/e-mail), `flagged=1` (só quem falta muito). */
  @Get("clients")
  async clients(@Query() q: Record<string, string>, @ReqDec() req: Req) {
    const company = resolveCompany(req);
    const term = (q.q ?? "").trim();
    const users = await this.prisma.user.findMany({
      where: { ...userWhereInCompany(company.id), ...(term ? { OR: [{ firstName: { contains: term, mode: "insensitive" } }, { email: { contains: term, mode: "insensitive" } }] } : {}) },
      orderBy: { id: "asc" }, take: 1000,
    });
    const stats = await this.appts.clientStats(company.id, users.map((u) => u.id));
    let rows = users.filter((u) => stats.has(u.id)).map((u) => ({ u, s: stats.get(u.id)! }));
    if (q.flagged === "1") rows = rows.filter((r) => r.s.flagged);
    // quem falta mais primeiro; depois o atendimento mais recente
    rows.sort((a, b) => b.s.no_show - a.s.no_show || Number(a.s.last_visit === null) - Number(b.s.last_visit === null) || (b.s.last_visit?.getTime() ?? 0) - (a.s.last_visit?.getTime() ?? 0));
    return rows.slice(0, 100).map((r) => this.row(r.u, r.s));
  }

  /** Histórico de um cliente NESTA empresa e suas observações internas (PUT `notes`). */
  private async detail(id: string, req: Req, body?: any) {
    const company = resolveCompany(req);
    const user = await this.prisma.user.findFirst({ where: { id: idParam(id), ...userWhereInCompany(company.id) } });
    if (!user) throw notFound("Cliente não encontrado nesta empresa.");
    if (body !== undefined) {
      const notes = body?.notes ?? "";
      if (typeof notes !== "string" || notes.length > 2000) throw new ApiError(400, { notes: ["Texto inválido ou maior que 2000 caracteres."] });
      const trimmed = notes.trim();
      await this.prisma.customerNote.upsert({
        where: { companyId_customerId: { companyId: company.id, customerId: user.id } },
        create: { companyId: company.id, customerId: user.id, notes: trimmed }, update: { notes: trimmed },
      });
      // grava só o tamanho do texto: as observações internas podem ser sensíveis
      await this.audit.record(req, "client.notes_update", { company, target: tUser(user), label: `${user.firstName || user.email} <${user.email}>`, details: { caracteres: trimmed.length } });
    }
    const [note, history, stats] = await Promise.all([
      this.prisma.customerNote.findUnique({ where: { companyId_customerId: { companyId: company.id, customerId: user.id } } }),
      this.prisma.appointment.findMany({ where: { customerId: user.id, professional: { companyId: company.id } }, include: { professional: true, service: true }, orderBy: [{ start: "desc" }, { id: "desc" }] }),
      this.appts.clientStats(company.id, [user.id]),
    ]);
    return {
      ...this.row(user, stats.get(user.id)),
      notes: note?.notes ?? "",
      appointments: history.map((a) => ({
        id: a.id, start: isoLocal(a.start), service: a.service.name, professional: a.professional.name, status: a.status,
        status_label: STATUS_LABEL[a.status], price: a.price == null ? null : Number(a.price), notes: a.notes,
      })),
    };
  }

  @Get("clients/:id") get(@Param("id") id: string, @ReqDec() req: Req) { return this.detail(id, req); }
  @Put("clients/:id") put(@Param("id") id: string, @Body() body: any, @ReqDec() req: Req) { return this.detail(id, req, body ?? {}); }
}
