/** Log de auditoria: quem fez o quê, em qual empresa, quando e de qual IP. Nunca grava senhas, tokens nem corpo de e-mail. */
import { Injectable } from "@nestjs/common";
import { Prisma, Db, PrismaService } from "./prisma.service";
import { clientIp } from "./auth";
import type { Req } from "./types";
import { fmt } from "./tz";

export const ACTIONS: Record<string, string> = {
  "auth.login": "Entrou no sistema",
  "auth.login_failed": "Tentativa de login falhou",
  "auth.register": "Criou conta",
  "auth.login_blocked": "Login bloqueado por excesso de tentativas",
  "auth.logout": "Saiu do sistema",
  "auth.logout_all": "Saiu de todos os dispositivos",
  "company.create": "Cadastrou empresa",
  "company.self_create": "Cadastrou a própria empresa",
  "settings.update": "Alterou configurações da plataforma",
  "user.update": "Alterou dados de usuário",
  "company.update": "Alterou dados da empresa",
  "company.logo_update": "Trocou o logo da empresa",
  "company.logo_remove": "Removeu o logo da empresa",
  "company.photo_add": "Adicionou foto da empresa",
  "company.photo_remove": "Removeu foto da empresa",
  "review.save": "Avaliou um atendimento",
  "company.toggle_active": "Ativou/desativou empresa",
  "company.member_add": "Adicionou administrador à empresa",
  "company.member_remove": "Removeu administrador da empresa",
  "user.create": "Cadastrou usuário",
  "user.role_change": "Alterou perfil de usuário",
  "user.toggle_active": "Ativou/desativou usuário",
  "service.create": "Criou serviço",
  "service.update": "Alterou serviço",
  "service.delete": "Excluiu serviço",
  "professional.create": "Criou profissional",
  "professional.update": "Alterou profissional",
  "professional.delete": "Excluiu profissional",
  "timeoff.create": "Criou bloqueio de datas",
  "timeoff.update": "Alterou bloqueio de datas",
  "timeoff.delete": "Excluiu bloqueio de datas",
  "appointment.create": "Criou agendamento",
  "appointment.cancel": "Cancelou agendamento",
  "appointment.complete": "Concluiu atendimento",
  "appointment.no_show": "Marcou não compareceu",
  "appointment.reopen": "Reabriu agendamento",
  "client.notes_update": "Alterou observações de cliente",
  "favorite.add": "Adicionou empresa às preferidas",
  "favorite.remove": "Removeu empresa das preferidas",
  "report.export": "Exportou planilha de atendimentos",
  "audit.export": "Exportou o log de auditoria",
};

/** Valor em formato JSON seguro: datas/decimais viram texto e texto longo é cortado. */
export function plain(v: unknown): unknown {
  if (v === null || v === undefined) return null;
  if (typeof v === "boolean" || typeof v === "number") return v;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).slice(0, 200);
}

/** Valores atuais dos campos simples que serão alterados (chame ANTES de salvar e compare com `diff`). */
export function snapshot(instance: Record<string, any>, fields: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.keys(fields).filter((k) => !Array.isArray(fields[k]) && !(typeof fields[k] === "object" && fields[k] !== null) && k in instance).map((k) => [k, plain(instance[k])]),
  );
}

/** `mudou` = campos simples que realmente mudaram (`{campo: [antes, depois]}`); `alterou` = listas aninhadas reenviadas. */
export function diff(before: Record<string, unknown>, after: Record<string, any>, fields: Record<string, unknown>) {
  const mudou = Object.fromEntries(Object.entries(before).filter(([k, old]) => old !== plain(after[k])).map(([k, old]) => [k, [old, plain(after[k])]]));
  const nested = Object.keys(fields).filter((k) => Array.isArray(fields[k]) || (typeof fields[k] === "object" && fields[k] !== null)).sort();
  return { mudou, ...(nested.length ? { alterou: nested } : {}) };
}

type Actor = { id: number; firstName: string; username: string; email: string } | null | undefined;
export type Target = { type: string; id?: number | null; label: string };

// "str()" dos objetos, como no Django, para o texto do alvo.
export const tCompany = (c: { id: number; name: string }): Target => ({ type: "Company", id: c.id, label: c.name });
export const tUser = (u: { id: number; username: string }): Target => ({ type: "User", id: u.id, label: u.username });
export const tService = (s: { id: number; name: string }): Target => ({ type: "Service", id: s.id, label: s.name });
export const tProfessional = (p: { id: number; name: string }): Target => ({ type: "Professional", id: p.id, label: p.name });
export const tTimeOff = (t: { id: number; startDate: Date; endDate: Date; professional?: { name: string } | null }): Target => ({
  type: "TimeOff", id: t.id, label: `${t.professional?.name ?? "Todos"}: ${t.startDate.toISOString().slice(0, 10)} → ${t.endDate.toISOString().slice(0, 10)}`,
});
export const tAppointment = (a: { id: number; start: Date; customer: { username: string }; service: { name: string } }): Target => ({
  type: "Appointment", id: a.id, label: `${a.customer.username} · ${a.service.name} · ${fmt(a.start, "dd/MM HH:mm")}`,
});

const who = (u: NonNullable<Actor>) => `${u.firstName || u.username} <${u.email || u.username}>`.slice(0, 255);

export interface RecordOptions {
  company?: { id: number; name: string } | null;
  target?: Target;
  label?: string;
  actor?: Actor;
  targetId?: number;
  details?: Record<string, unknown>;
}

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  /** Grava uma ação (código de `ACTIONS`). `actor` padrão = usuário da requisição. */
  async record(req: Req | null, action: string, o: RecordOptions = {}, db: Db = this.prisma) {
    if (!ACTIONS[action]) throw new Error(`ação de auditoria desconhecida: ${action}`);
    const actor = o.actor ?? req?.user ?? null;
    const details = Object.fromEntries(
      Object.entries(o.details ?? {}).map(([k, v]) => [k, v !== null && typeof v === "object" ? v : plain(v)]),
    );
    return db.auditLog.create({
      data: {
        actorId: actor?.id ?? null,
        actorLabel: actor ? who(actor) : "",
        action,
        companyId: o.company?.id ?? null,
        companyLabel: o.company ? o.company.name.slice(0, 140) : "",
        targetType: o.target?.type ?? "",
        targetId: o.targetId ?? o.target?.id ?? null,
        targetLabel: (o.label ?? o.target?.label ?? "").slice(0, 255),
        details: details as Prisma.InputJsonValue,
        ip: req ? clientIp(req) : null,
      },
    });
  }
}

/** Repr de valores no estilo Python (como o resumo do Django mostrava). */
const pyRepr = (v: unknown): string => (v === null || v === undefined ? "None" : v === true ? "True" : v === false ? "False" : typeof v === "string" ? `'${v}'` : String(v));

const SUMMARY_KEYS = ["de", "para", "perfil", "empresa", "motivo", "identificador", "quem", "resultado", "linhas", "filtros", "periodo", "caracteres", "origem", "modelo", "campos", "segundos", "sessoes", "nota", "senha", "limite", "cadastradas"];

/** Resumo legível de uma linha para a tela (alvo e principais detalhes). */
export function summary(log: { targetLabel: string; details: unknown }): string {
  const d = (log.details ?? {}) as Record<string, any>;
  const parts: string[] = [];
  if (log.targetLabel) parts.push(log.targetLabel);
  for (const [field, [old, nw]] of Object.entries((d.mudou ?? {}) as Record<string, [unknown, unknown]>)) parts.push(`${field}: ${pyRepr(old)} → ${pyRepr(nw)}`);
  if (d.alterou?.length) parts.push("reenviou: " + d.alterou.join(", "));
  for (const key of SUMMARY_KEYS) if (key in d) parts.push(`${key}: ${typeof d[key] === "object" && d[key] !== null ? JSON.stringify(d[key]) : d[key]}`);
  return parts.join(" · ");
}
