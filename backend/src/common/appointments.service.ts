/** Agendamentos: formato de saída (igual ao do DRF), reserva com trava de concorrência e estatísticas de faltas. */
import { Injectable } from "@nestjs/common";
import { ApiError, bad } from "./api-error";
import { MailAppointment, MailService, googleCalendarUrl } from "./mail.service";
import { Db, Prisma, PrismaService } from "./prisma.service";
import { availableSlots } from "./slots";
import { isoLocal, localDate } from "./tz";

/** Relações necessárias para serializar um agendamento. */
export const APPT_INCLUDE = {
  professional: { include: { company: true } },
  service: true,
  customer: true,
  review: true,
} satisfies Prisma.AppointmentInclude;
export type ApptFull = Prisma.AppointmentGetPayload<{ include: typeof APPT_INCLUDE }>;

export const money = (d: Prisma.Decimal | null | undefined): string | null => (d == null ? null : d.toFixed(2));

/** Agendamento no formato da API (`AppointmentSerializer`). `flagged`: clientes que faltam muito (só no painel). */
export function appointmentOut(a: ApptFull, flagged?: Set<number>) {
  const hours = a.professional.company.cancelNoticeHours;
  return {
    id: a.id,
    professional: a.professionalId,
    professional_name: a.professional.name,
    company_name: a.professional.company.name,
    service: a.serviceId,
    service_name: a.service.name,
    customer_name: a.customer.firstName || a.customer.email,
    customer_email: a.customer.email,
    customer_flagged: flagged ? flagged.has(a.customerId) : false,
    start: isoLocal(a.start),
    end: isoLocal(a.end),
    status: a.status,
    notes: a.notes,
    price: money(a.price),
    review: a.review ? { rating: a.review.rating, comment: a.review.comment } : null,
    can_review: a.status === "completed",
    can_cancel: a.status === "confirmed" && (!hours || a.start.getTime() - Date.now() >= hours * 3_600_000),
    google_calendar_url: googleCalendarUrl(a as MailAppointment),
  };
}

export const STATUS_LABEL: Record<string, string> = {
  confirmed: "Confirmado", completed: "Concluído", no_show: "Não compareceu", canceled: "Cancelado",
};

// Regra do alerta de faltas (README: "falta muito").
export const FLAG_MIN_NO_SHOWS = 2;
export const FLAG_MIN_RATE = 30; // % de faltas entre os atendimentos finalizados
export const isFlagged = (completed: number, noShow: number): boolean => {
  const finished = completed + noShow;
  return noShow >= FLAG_MIN_NO_SHOWS && finished > 0 && noShow * 100 >= FLAG_MIN_RATE * finished;
};

export interface ClientStats {
  total: number; completed: number; no_show: number; canceled: number; confirmed: number;
  last_visit: Date | null; spent: number; flagged: boolean; no_show_rate: number | null;
}

@Injectable()
export class AppointmentsService {
  constructor(private readonly prisma: PrismaService, private readonly mail: MailService) {}

  /** Totais por cliente (`Map<id, stats>`) dos atendimentos dentro da empresa. */
  async clientStats(companyId: number, customerIds?: number[], db: Db = this.prisma): Promise<Map<number, ClientStats>> {
    const filter = customerIds ? Prisma.sql`AND a.customer_id = ANY(${customerIds})` : Prisma.empty;
    const rows = await db.$queryRaw<any[]>`
      SELECT a.customer_id,
             COUNT(*)::int AS total,
             COUNT(*) FILTER (WHERE a.status = 'completed')::int AS completed,
             COUNT(*) FILTER (WHERE a.status = 'no_show')::int AS no_show,
             COUNT(*) FILTER (WHERE a.status = 'canceled')::int AS canceled,
             COUNT(*) FILTER (WHERE a.status = 'confirmed')::int AS confirmed,
             MAX(a.start) FILTER (WHERE a.status = 'completed') AS last_visit,
             COALESCE(SUM(a.price) FILTER (WHERE a.status = 'completed'), 0)::float8 AS spent
        FROM appointments a JOIN professionals p ON p.id = a.professional_id
       WHERE p.company_id = ${companyId} ${filter}
       GROUP BY a.customer_id`;
    const out = new Map<number, ClientStats>();
    for (const r of rows) {
      const done = r.completed + r.no_show;
      out.set(r.customer_id, {
        total: r.total, completed: r.completed, no_show: r.no_show, canceled: r.canceled, confirmed: r.confirmed,
        last_visit: r.last_visit, spent: Number(r.spent),
        flagged: isFlagged(r.completed, r.no_show),
        no_show_rate: done ? Math.round((r.no_show * 1000) / done) / 10 : null,
      });
    }
    return out;
  }

  /** Ids dos clientes da empresa que faltam com frequência (marca a agenda do painel). */
  async flaggedCustomerIds(companyId: number): Promise<Set<number>> {
    const stats = await this.clientStats(companyId);
    return new Set([...stats].filter(([, s]) => s.flagged).map(([id]) => id));
  }

  async load(id: number, db: Db = this.prisma): Promise<ApptFull> {
    return (await db.appointment.findUniqueOrThrow({ where: { id }, include: APPT_INCLUDE })) as ApptFull;
  }

  /**
   * Cria o agendamento com trava de concorrência, confirma ao cliente e avisa os administradores.
   * `actor`: quem reservou (não recebe o aviso de administrador). `staff`: ignora a antecedência mínima da empresa.
   */
  async book(
    customerId: number,
    d: { professionalId: number; serviceId: number; start: Date; notes?: string },
    opts: { actorId?: number; staff?: boolean } = {},
  ): Promise<ApptFull> {
    const pro = await this.prisma.professional.findUniqueOrThrow({ where: { id: d.professionalId }, include: { company: true } });
    const minNotice = pro.company.minNoticeHours;
    if (!opts.staff && minNotice && d.start.getTime() < Date.now() + minNotice * 3_600_000) {
      throw new ApiError(400, { detail: `Agendamentos nesta empresa exigem ${minNotice}h de antecedência.` });
    }
    const created = await this.prisma.$transaction(async (tx) => {
      // Trava a linha do profissional: reservas simultâneas passam uma de cada vez (evita horário duplicado).
      await tx.$queryRaw`SELECT id FROM professionals WHERE id = ${pro.id} FOR UPDATE`;
      const offer = await tx.professionalService.findUnique({ where: { professionalId_serviceId: { professionalId: pro.id, serviceId: d.serviceId } } });
      if (!offer) throw bad("Este profissional não realiza este serviço.");
      // Revalida dentro da trava: expediente, pausas, bloqueios, intervalo e conflitos.
      const slots = await availableSlots(tx, pro, offer, localDate(d.start));
      if (!slots.some((s) => s.getTime() === d.start.getTime())) throw new ApiError(400, { detail: "Horário indisponível. Escolha outro." });
      return tx.appointment.create({
        data: {
          professionalId: pro.id, serviceId: d.serviceId, customerId, start: d.start, notes: d.notes ?? "",
          end: new Date(d.start.getTime() + offer.durationMinutes * 60_000),
          price: offer.price, // congela o preço: mudar a tabela depois não altera o histórico
        },
      });
    });
    const appt = await this.load(created.id);
    // Na Vercel o processo congela após a resposta: os e-mails são aguardados (e nunca derrubam o agendamento).
    await Promise.allSettled([this.mail.sendConfirmation(appt), this.mail.sendAdminNotice(appt, "created", opts.actorId ?? customerId)]);
    return appt;
  }
}
