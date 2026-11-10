import { useState } from "react";
import * as reportsApi from "../../api/reports";
import ErrorMessage from "../../components/ui/ErrorMessage";
import { useApi } from "../../hooks/useApi";
import { STATUS_LABELS } from "../../utils/constants";
import { fmtDateTime } from "../../utils/date";
import { omitEmpty } from "../../utils/lists";
import { money } from "../../utils/reportFormat";

const PAGE_SIZE = 25;

/** Colunas da planilha: chave de ordenação (do servidor), título e como mostrar o valor. */
const COLUMNS = [
  { key: "start", title: "Data e hora", render: (r) => fmtDateTime(r.start) },
  { key: "company", title: "Estabelecimento", render: (r) => r.company },
  { key: "professional", title: "Profissional", render: (r) => r.professional },
  { key: "service", title: "Serviço", render: (r) => r.service },
  { key: "customer", title: "Cliente", render: (r) => r.customer_name },
  { key: "status", title: "Situação", render: (r) => <span className={`status st-${r.status}`}>{STATUS_LABELS[r.status]}</span> },
  { key: "price", title: "Preço", render: (r) => money(r.price), numeric: true },
];

/**
 * Planilha de atendimentos: ordenável por coluna (clique no título) e paginada, com os mesmos filtros do dashboard.
 * @param {{filters: object}} props Filtros do relatório (vazios são ignorados).
 */
export default function ReportTable({ filters }) {
  const [ordering, setOrdering] = useState("-start");
  const [page, setPage] = useState(1);
  const params = { ...omitEmpty(filters), ordering, page, page_size: PAGE_SIZE };
  const { data, error } = useApi(() => reportsApi.listAppointments(params), [JSON.stringify(params)]);

  /** Clicar no título ordena por ela; clicar de novo inverte a ordem. */
  const sortBy = (key) => {
    setOrdering(ordering === key ? `-${key}` : key);
    setPage(1);
  };
  const pages = data ? Math.max(1, Math.ceil(data.count / data.page_size)) : 1;
  const arrow = (key) => (ordering === key ? " ▲" : ordering === `-${key}` ? " ▼" : "");

  return (
    <div className="tableWrap">
      <ErrorMessage message={error} />
      <table className="sheet">
        <thead>
          <tr>
            {COLUMNS.map((c) => (
              <th key={c.key} className={c.numeric ? "num" : ""}
                aria-sort={ordering === c.key ? "ascending" : ordering === `-${c.key}` ? "descending" : "none"}>
                <button type="button" className="link" onClick={() => sortBy(c.key)}>{c.title}{arrow(c.key)}</button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data?.results.map((r) => (
            <tr key={r.id}>{COLUMNS.map((c) => <td key={c.key} className={c.numeric ? "num" : ""}>{c.render(r)}</td>)}</tr>
          ))}
          {data?.count === 0 && <tr><td colSpan={COLUMNS.length} className="muted">Nenhum atendimento neste filtro.</td></tr>}
        </tbody>
      </table>
      {data && data.count > 0 && (
        <div className="pager">
          <span className="muted">{data.count} atendimento(s) · página {data.page} de {pages}</span>
          <div className="actions">
            <button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)}>Anterior</button>
            <button type="button" disabled={page >= pages} onClick={() => setPage(page + 1)}>Próxima</button>
          </div>
        </div>
      )}
    </div>
  );
}
