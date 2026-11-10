/**
 * Limite de tentativas de login, baseado no log de auditoria (`auth.login_failed`):
 * 5 falhas para o mesmo usuário/e-mail em 15 min bloqueiam a conta (depois do último login certo);
 * 30 falhas do mesmo IP bloqueiam o IP. Bloqueado = até a senha certa é recusada (429).
 */
import type { Db } from "./prisma.service";

export const WINDOW_MS = 15 * 60_000;
export const MAX_FAILS = 5;
export const MAX_FAILS_IP = 30;

export const normalizeIdent = (ident: unknown): string => String(ident ?? "").trim().toLowerCase().slice(0, 150);

/** Segundos até poder tentar de novo, ou 0 se não está bloqueado. */
export async function retryAfter(db: Db, ident: string, ip: string | null, candidateIds: number[]): Promise<number> {
  const now = Date.now();
  const since = new Date(now - WINDOW_MS);
  const lastOk = candidateIds.length
    ? (await db.auditLog.aggregate({ where: { action: "auth.login", actorId: { in: candidateIds } }, _max: { createdAt: true } }))._max.createdAt
    : null;

  const byAccount = await db.auditLog.findMany({
    where: {
      action: "auth.login_failed",
      createdAt: { gte: since, ...(lastOk ? { gt: lastOk } : {}) },
      details: { path: ["identificador"], equals: normalizeIdent(ident) },
    },
    orderBy: { createdAt: "desc" }, take: MAX_FAILS, select: { createdAt: true },
  });
  const byIp = ip
    ? await db.auditLog.findMany({
        where: { action: "auth.login_failed", createdAt: { gte: since }, ip },
        orderBy: { createdAt: "desc" }, take: MAX_FAILS_IP, select: { createdAt: true },
      })
    : [];

  let wait = 0;
  for (const [rows, limit] of [[byAccount, MAX_FAILS], [byIp, MAX_FAILS_IP]] as const) {
    if (rows.length >= limit) {
      // libera quando a falha mais antiga sai da janela
      wait = Math.max(wait, Math.floor((rows[limit - 1].createdAt.getTime() + WINDOW_MS - now) / 1000) + 1);
    }
  }
  return Math.max(wait, 0);
}
