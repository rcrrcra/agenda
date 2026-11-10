/**
 * Cálculo de disponibilidade. É o ÚNICO lugar com as regras de agenda (cliente, equipe e reserva usam o mesmo):
 * expediente, pausas, bloqueios de datas, folga entre atendimentos, intervalo entre horários e conflitos.
 * Carrega os dados do dia uma vez e calcula em memória (o Django consultava o banco a cada horário).
 */
import type { Db } from "./prisma.service";
import { at, dateCol, dayEnd, dayStart, weekdayOf } from "./tz";

interface Pro { id: number; companyId: number; slotMinutes: number; bufferMinutes: number }
interface Offer { durationMinutes: number; slotMinutes: number | null }

/** O dia está bloqueado para o profissional (folga dele ou feriado da empresa toda)? */
export async function isBlocked(db: Db, pro: Pro, day: string): Promise<boolean> {
  const d = dateCol(day);
  const n = await db.timeOff.count({
    where: {
      OR: [{ professionalId: pro.id }, { professionalId: null, companyId: pro.companyId }],
      startDate: { lte: d },
      endDate: { gte: d },
    },
  });
  return n > 0;
}

/** Intervalo (min) entre horários: faixa do dia > serviço > padrão do profissional. */
export const slotStep = (pro: Pro, offer: Offer, hours: { slotMinutes: number | null }): number =>
  hours.slotMinutes || offer.slotMinutes || pro.slotMinutes;

/** Horários de início livres de um profissional para um serviço em um dia (futuros e sem conflito). */
export async function availableSlots(db: Db, pro: Pro, offer: Offer, day: string): Promise<Date[]> {
  const out: Date[] = [];
  if (await isBlocked(db, pro, day)) return out; // feriado ou folga: nenhum horário

  const wd = weekdayOf(day);
  const [hours, breaks] = await Promise.all([
    db.workingHours.findMany({ where: { professionalId: pro.id, weekday: wd }, orderBy: { startTime: "asc" } }),
    db.break.findMany({ where: { professionalId: pro.id, weekday: wd } }),
  ]);
  if (!hours.length) return out;

  const buf = pro.bufferMinutes * 60_000;
  const dur = offer.durationMinutes * 60_000;
  // Agendamentos não cancelados que podem encostar neste dia (considerando a folga antes e depois).
  const busy = (await db.appointment.findMany({
    where: {
      professionalId: pro.id,
      status: { not: "canceled" },
      start: { lt: new Date(dayEnd(day).getTime() + buf) },
      end: { gt: new Date(dayStart(day).getTime() - buf) },
    },
    select: { start: true, end: true },
  })).map((a) => [a.start.getTime(), a.end.getTime()] as const);

  const ranges = hours.map((w) => ({ w, from: at(day, w.startTime).getTime(), to: at(day, w.endTime).getTime() }));
  const pauses = breaks.map((b) => [at(day, b.startTime).getTime(), at(day, b.endTime).getTime()] as const);
  const now = Date.now();

  const free = (start: number): boolean => {
    const end = start + dur;
    if (!ranges.some((r) => r.from <= start && end <= r.to)) return false; // o atendimento inteiro cabe no expediente
    if (pauses.some(([bs, be]) => bs < end && start < be)) return false; // não toca em pausa
    return !busy.some(([as, ae]) => as < end + buf && ae > start - buf); // sem conflito (com folga)
  };

  for (const { w, from, to } of ranges) {
    const step = slotStep(pro, offer, w) * 60_000;
    if (step <= 0) continue;
    for (let cur = from; cur + dur <= to; cur += step) {
      if (cur > now && free(cur)) out.push(new Date(cur));
    }
  }
  return out;
}
