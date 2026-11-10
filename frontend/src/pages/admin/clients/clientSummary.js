import { fmtDate } from "../../../utils/date";
import { money } from "../../../utils/reportFormat";

/** Resumo de uma linha: atendimentos, faltas e última visita. */
export const clientSummary = (c) =>
  `${c.completed} atendimento(s) · ${c.no_show} falta(s)${c.no_show_rate !== null ? ` (${String(c.no_show_rate).replace(".", ",")}%)` : ""}` +
  `${c.last_visit ? ` · última visita ${fmtDate(c.last_visit.slice(0, 10))}` : ""} · ${money(c.spent)}`;
