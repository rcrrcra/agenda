import { useState } from "react";
import * as platformApi from "../../api/platform";
import ErrorMessage from "../../components/ui/ErrorMessage";
import Field from "../../components/ui/Field";
import { useAction } from "../../hooks/useAction";
import { useApi } from "../../hooks/useApi";
import { useDebounced } from "../../hooks/useDebounced";
import { AUDIT_GROUPS } from "../../utils/constants";
import { addDays, fmtDateTime, today } from "../../utils/date";
import { omitEmpty } from "../../utils/lists";

const PAGE_SIZE = 50;

/**
 * Log de auditoria (só o admin geral): quem fez o quê, em qual empresa, quando e de qual IP.
 * Filtros: período, ação (ou grupo de ações), empresa, pessoa e texto livre. É somente leitura:
 * os registros não podem ser alterados nem apagados.
 */
export default function AuditView() {
  const [filters, setFilters] = useState({ from: addDays(today(), -29), to: today(), action: "", company: "", actor: "", q: "" });
  const [page, setPage] = useState(1);
  const dActor = useDebounced(filters.actor.trim());
  const dQ = useDebounced(filters.q.trim());
  const { data: options } = useApi(platformApi.getAuditOptions);
  const params = omitEmpty({ ...filters, actor: dActor, q: dQ });
  const { error: exportError, busy, run } = useAction();
  const { data, error } = useApi(() => platformApi.getAudit({ ...params, page, page_size: PAGE_SIZE }), [JSON.stringify(params), page]);

  /** Cria um handler que altera um filtro e volta para a primeira página. */
  const set = (key) => (e) => { setFilters({ ...filters, [key]: e.target.value }); setPage(1); };
  const pages = data ? Math.max(1, Math.ceil(data.count / data.page_size)) : 1;

  // Ações agrupadas por tipo (<optgroup>), com a opção de escolher o grupo inteiro.
  const groups = Object.entries(AUDIT_GROUPS).map(([prefix, title]) => ({
    prefix, title, actions: (options?.actions || []).filter((a) => a.code.startsWith(`${prefix}.`)),
  }));

  return (
    <section className="card">
      <p className="muted">Registro permanente das ações no sistema. Somente leitura.</p>
      <div className="filters">
        <Field label="De"><input type="date" value={filters.from} max={filters.to || undefined} onChange={set("from")} /></Field>
        <Field label="Até"><input type="date" value={filters.to} min={filters.from || undefined} onChange={set("to")} /></Field>
        <Field label="Ação">
          <select value={filters.action} onChange={set("action")}>
            <option value="">Todas</option>
            {groups.map((g) => (
              <optgroup key={g.prefix} label={g.title}>
                <option value={g.prefix}>Todas de “{g.title}”</option>
                {g.actions.map((a) => <option key={a.code} value={a.code}>{a.label}</option>)}
              </optgroup>
            ))}
          </select>
        </Field>
        <Field label="Empresa">
          <select value={filters.company} onChange={set("company")}>
            <option value="">Todas</option>
            {options?.companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
        <Field label="Quem fez"><input type="search" placeholder="Nome ou e-mail" value={filters.actor} onChange={set("actor")} /></Field>
        <Field label="Buscar"><input type="search" placeholder="Alvo, empresa ou IP" value={filters.q} onChange={set("q")} /></Field>
      </div>
      <div className="tableHead">
        <span className="muted">{data ? `${data.count} registro(s) neste filtro` : ""}</span>
        <button type="button" disabled={busy} onClick={() => run(() => platformApi.exportAuditXlsx(params))}>
          {busy ? "Gerando…" : "Exportar para Excel"}
        </button>
      </div>
      <ErrorMessage message={error || exportError} />
      <div className="tableWrap">
        <table className="sheet">
          <thead>
            <tr><th>Quando</th><th>Quem</th><th>Ação</th><th>Empresa</th><th>Detalhes</th><th>IP</th></tr>
          </thead>
          <tbody>
            {data?.results.map((r) => (
              <tr key={r.id}>
                <td>{fmtDateTime(r.created_at)}</td>
                <td>{r.actor}</td>
                <td>{r.action_label}</td>
                <td>{r.company || "—"}</td>
                <td className="wrap">{r.summary || "—"}</td>
                <td>{r.ip || "—"}</td>
              </tr>
            ))}
            {data?.count === 0 && <tr><td colSpan={6} className="muted">Nenhum registro neste filtro.</td></tr>}
          </tbody>
        </table>
      </div>
      {data && data.count > 0 && (
        <div className="pager">
          <span className="muted">página {data.page} de {pages}</span>
          <div className="actions">
            <button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)}>Anterior</button>
            <button type="button" disabled={page >= pages} onClick={() => setPage(page + 1)}>Próxima</button>
          </div>
        </div>
      )}
    </section>
  );
}
