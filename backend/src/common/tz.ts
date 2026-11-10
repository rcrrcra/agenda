/** Datas e fusos: tudo é gravado em UTC e exibido/calculado em America/Sao_Paulo (como no Django). */
import { DateTime } from "luxon";

export const TZ = "America/Sao_Paulo";

const YMD = /^\d{4}-\d{2}-\d{2}$/;

/** Valida AAAA-MM-DD (data real). */
export function isYmd(s: unknown): s is string {
  return typeof s === "string" && YMD.test(s) && DateTime.fromISO(s, { zone: TZ }).isValid;
}

/** Data local (AAAA-MM-DD) de um instante. */
export const localDate = (d: Date): string => DateTime.fromJSDate(d, { zone: TZ }).toISODate()!;

/** Hoje, no fuso local. */
export const today = (): string => localDate(new Date());

/** Soma `n` dias a uma data AAAA-MM-DD. */
export const addDays = (ymd: string, n: number): string =>
  DateTime.fromISO(ymd, { zone: TZ }).plus({ days: n }).toISODate()!;

/** Dia da semana no padrão do Django/Python: segunda = 0 ... domingo = 6. */
export const weekdayOf = (ymd: string): number => DateTime.fromISO(ymd, { zone: TZ }).weekday - 1;

/** Instante em que o dia local começa (00:00 em São Paulo). */
export const dayStart = (ymd: string): Date => DateTime.fromISO(ymd, { zone: TZ }).startOf("day").toJSDate();

/** Instante do início do dia seguinte (limite exclusivo do dia). */
export const dayEnd = (ymd: string): Date => dayStart(addDays(ymd, 1));

/** Instante de `ymd` às `hhmmss` (ex.: "09:00:00") no fuso local. */
export const at = (ymd: string, hhmmss: string): Date =>
  DateTime.fromISO(`${ymd}T${hhmmss}`, { zone: TZ }).toJSDate();

/** Formata um instante no horário local (tokens do luxon, ex.: "dd/MM/yyyy 'às' HH:mm"). */
export const fmt = (d: Date, pattern: string): string => DateTime.fromJSDate(d, { zone: TZ }).toFormat(pattern);

/** ISO 8601 no fuso local com deslocamento, igual ao que o DRF devolvia (ex.: 2026-11-03T09:00:00-03:00). */
export const isoLocal = (d: Date): string =>
  DateTime.fromJSDate(d, { zone: TZ }).toISO({ suppressMilliseconds: true })!;

/** ISO 8601 em UTC com "Z" e sem milissegundos zerados (formato de `datetime` em UTC no DRF). */
export const isoUtc = (d: Date): string => d.toISOString().replace(".000Z", "Z");

/** Converte AAAA-MM-DD no `Date` (meia-noite UTC) usado pelas colunas `date` do Prisma. */
export const dateCol = (ymd: string): Date => new Date(`${ymd}T00:00:00.000Z`);

/** AAAA-MM-DD de uma coluna `date` do Prisma. */
export const ymdOf = (d: Date): string => d.toISOString().slice(0, 10);

/** Lê um datetime ISO 8601; sem deslocamento é interpretado no fuso local. `null` se inválido. */
export function parseDateTime(s: unknown): Date | null {
  if (typeof s !== "string") return null;
  const dt = DateTime.fromISO(s.trim(), { zone: TZ });
  return dt.isValid ? dt.toJSDate() : null;
}
