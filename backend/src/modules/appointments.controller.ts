/** Agendamentos do usuário logado (em qualquer empresa): listar, criar, consultar, cancelar e avaliar. */
import { Body, Controller, Get, HttpCode, Param, Post, Req as ReqDec } from "@nestjs/common";
import { ApiError, bad, notFound } from "../common/api-error";
import { APPT_INCLUDE, AppointmentsService, appointmentOut } from "../common/appointments.service";
import { AuditService, tAppointment } from "../common/audit.service";
import { MailService } from "../common/mail.service";
import { PrismaService } from "../common/prisma.service";
import type { Req } from "../common/types";
import { V } from "../common/validate";
import { idParam } from "./serializers";

/** Atendimento concluído ou com falta registrada não pode ser cancelado (reabra antes, se foi engano). */
export function refuseIfFinished(status: string) {
  if (status === "completed" || status === "no_show") throw bad("Este atendimento já foi finalizado e não pode ser cancelado.");
}

/**
 * Valida os campos comuns de uma reserva (professional, service, start, notes) e as regras de negócio:
 * profissional/empresa ativos e profissional que realiza o serviço. Usado pelo cliente e pela equipe.
 */
export async function parseBooking(prisma: PrismaService, v: V) {
  const professionalId = v.pk("professional") as number | undefined;
  const serviceId = v.pk("service") as number | undefined;
  const start = v.dateTime("start");
  const notes = v.str("notes", { max: 255, required: false, blank: true });
  const pro = professionalId ? await prisma.professional.findUnique({ where: { id: professionalId }, include: { company: true } }) : null;
  if (professionalId && !pro) v.fail("professional", `Pk inválido "${professionalId}" - objeto não existe.`);
  const service = serviceId ? await prisma.service.findUnique({ where: { id: serviceId } }) : null;
  if (serviceId && !service) v.fail("service", `Pk inválido "${serviceId}" - objeto não existe.`);
  v.done();
  if (!pro!.active || !pro!.company.active) throw new ApiError(400, { non_field_errors: ["Profissional indisponível."] });
  const offer = await prisma.professionalService.findUnique({ where: { professionalId_serviceId: { professionalId: pro!.id, serviceId: service!.id } } });
  if (!offer) throw new ApiError(400, { non_field_errors: ["Este profissional não realiza este serviço."] });
  return { pro: pro!, service: service!, start: start!, notes };
}

@Controller("appointments")
export class AppointmentsController {
  constructor(
    private readonly prisma: PrismaService, private readonly audit: AuditService,
    private readonly appts: AppointmentsService, private readonly mail: MailService,
  ) {}

  /** Cada usuário vê só os próprios agendamentos (ordenados pelo início). */
  @Get()
  async list(@ReqDec() req: Req) {
    const rows = await this.prisma.appointment.findMany({ where: { customerId: req.user!.id }, include: APPT_INCLUDE, orderBy: [{ start: "asc" }, { id: "asc" }] });
    return rows.map((a) => appointmentOut(a));
  }

  @Post()
  async create(@Body() body: any, @ReqDec() req: Req) {
    const { pro, service, start, notes } = await parseBooking(this.prisma, new V(body));
    const appt = await this.appts.book(req.user!.id, { professionalId: pro.id, serviceId: service.id, start, notes });
    await this.audit.record(req, "appointment.create", { company: appt.professional.company, target: tAppointment(appt), details: { origem: "cliente" } });
    return appointmentOut(appt);
  }

  private async own(id: string, req: Req) {
    const a = await this.prisma.appointment.findFirst({ where: { id: idParam(id), customerId: req.user!.id }, include: APPT_INCLUDE });
    if (!a) throw notFound();
    return a;
  }

  @Get(":id")
  async retrieve(@Param("id") id: string, @ReqDec() req: Req) {
    return appointmentOut(await this.own(id, req));
  }

  /** Cancela o agendamento e avisa por e-mail (idempotente), respeitando a antecedência mínima da empresa. */
  @Post(":id/cancel") @HttpCode(200)
  async cancel(@Param("id") id: string, @ReqDec() req: Req) {
    let appt = await this.own(id, req);
    refuseIfFinished(appt.status);
    if (appt.status !== "canceled") {
      const hours = appt.professional.company.cancelNoticeHours;
      if (hours && appt.start.getTime() - Date.now() < hours * 3_600_000) {
        throw bad(`Cancelamentos só são aceitos com ${hours}h de antecedência. Entre em contato com a empresa.`);
      }
      await this.prisma.appointment.update({ where: { id: appt.id }, data: { status: "canceled" } });
      appt = await this.appts.load(appt.id);
      await Promise.allSettled([this.mail.sendCancellation(appt), this.mail.sendAdminNotice(appt, "canceled", req.user!.id)]);
      await this.audit.record(req, "appointment.cancel", { company: appt.professional.company, target: tAppointment(appt), details: { quem: "cliente" } });
    }
    return appointmentOut(appt);
  }

  /** Avalia o atendimento (nota 1 a 5, comentário opcional): só o próprio cliente, só se concluído; pode corrigir depois. */
  @Post(":id/review") @HttpCode(200)
  async review(@Param("id") id: string, @Body() body: any, @ReqDec() req: Req) {
    const appt = await this.own(id, req);
    if (appt.status !== "completed") throw bad("Só é possível avaliar atendimentos concluídos.");
    const rating = body?.rating;
    if (!/^\d+$/.test(String(rating)) || Number(rating) < 1 || Number(rating) > 5) throw new ApiError(400, { rating: ["A nota deve ser de 1 a 5."] });
    const comment = String(body?.comment ?? "").trim();
    if (comment.length > 500) throw new ApiError(400, { comment: ["O comentário deve ter no máximo 500 caracteres."] });
    const existed = !!appt.review;
    await this.prisma.review.upsert({
      where: { appointmentId: appt.id }, create: { appointmentId: appt.id, rating: Number(rating), comment }, update: { rating: Number(rating), comment },
    });
    await this.audit.record(req, "review.save", { company: appt.professional.company, target: tAppointment(appt), details: { nota: Number(rating), origem: existed ? "alterada" : "nova" } });
    return appointmentOut(await this.appts.load(appt.id));
  }
}
