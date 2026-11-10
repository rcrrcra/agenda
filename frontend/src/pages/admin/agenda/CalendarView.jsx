import { useMemo, useState } from "react";
import * as adminApi from "../../../api/admin";
import Field from "../../../components/ui/Field";
import Tabs from "../../../components/ui/Tabs";
import { useApi } from "../../../hooks/useApi";
import { hourRange, layoutEvents, localDay, weekStart } from "../../../utils/calendar";
import { DAYS_SHORT } from "../../../utils/constants";
import { addDays, fmtTime, today } from "../../../utils/date";
import { groupBy } from "../../../utils/lists";

const PX_PER_MIN = 0.9;
const MODES = [{ key: "week", label: "Semana" }, { key: "day", label: "Dia" }];

/**
 * Calendário da agenda, por semana (um dia por coluna) ou por dia (uma coluna por profissional).
 * Cancelados não aparecem. Clicar num horário mostra os detalhes e as ações abaixo do calendário.
 *
 * @param {object} props
 * @param {{id: number, name: string}[]} props.professionals Profissionais da empresa (para o filtro e as colunas).
 * @param {(a: object) => import("react").ReactNode} props.renderDetail Detalhe do agendamento escolhido.
 * @param {number} props.refreshKey Muda quando algo foi alterado fora daqui, para recarregar.
 */
export default function CalendarView({ professionals, renderDetail, refreshKey }) {
  const [mode, setMode] = useState("week");
  const [anchor, setAnchor] = useState(today());
  const [pro, setPro] = useState("");
  const [selected, setSelected] = useState(null);

  const from = mode === "week" ? weekStart(anchor) : anchor;
  const to = mode === "week" ? addDays(from, 6) : anchor;
  const { data } = useApi(
    () => adminApi.listAppointments({ from, to, ...(pro ? { professional: pro } : {}) }), [from, to, pro, refreshKey]);
  const items = useMemo(() => (data || []).filter((a) => a.status !== "canceled"), [data]);

  const [h0, h1] = hourRange(items);
  const hours = Array.from({ length: h1 - h0 }, (_, i) => h0 + i);
  const columns = mode === "week"
    ? Array.from({ length: 7 }, (_, i) => ({ key: addDays(from, i), title: `${DAYS_SHORT[i]} ${addDays(from, i).slice(8)}/${addDays(from, i).slice(5, 7)}`, today: addDays(from, i) === today() }))
    : (pro ? professionals.filter((p) => String(p.id) === pro) : professionals).map((p) => ({ key: p.id, title: p.name }));
  const byCol = Object.fromEntries(groupBy(items, (a) => (mode === "week" ? localDay(a.start) : a.professional)));
  const shift = (n) => setAnchor(addDays(anchor, mode === "week" ? 7 * n : n));
  const current = items.find((a) => a.id === selected);

  return (
    <div className="calendar">
      <div className="calBar">
        <Tabs variant="sub" tabs={MODES} value={mode} onChange={setMode} />
        <div className="actions">
          <button type="button" onClick={() => shift(-1)} aria-label="Anterior">‹</button>
          <button type="button" onClick={() => setAnchor(today())}>Hoje</button>
          <button type="button" onClick={() => shift(1)} aria-label="Próximo">›</button>
        </div>
        <Field label="Dia"><input type="date" value={anchor} onChange={(e) => e.target.value && setAnchor(e.target.value)} /></Field>
        <Field label="Profissional">
          <select value={pro} onChange={(e) => setPro(e.target.value)}>
            <option value="">Todos</option>
            {professionals.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </Field>
      </div>
      <div className="calScroll">
        <div className="calGrid" style={{ gridTemplateColumns: `48px repeat(${columns.length}, minmax(110px, 1fr))` }}>
          <div />
          {columns.map((c) => <div key={c.key} className={`calHead${c.today ? " today" : ""}`}>{c.title}</div>)}
          <div className="calHours" style={{ height: hours.length * 60 * PX_PER_MIN }}>
            {hours.map((h) => <span key={h} style={{ top: (h - h0) * 60 * PX_PER_MIN }}>{String(h).padStart(2, "0")}:00</span>)}
          </div>
          {columns.map((c) => (
            <div key={c.key} className="calCol" style={{ height: hours.length * 60 * PX_PER_MIN }}>
              {hours.map((h) => <i key={h} style={{ top: (h - h0) * 60 * PX_PER_MIN }} />)}
              {layoutEvents(byCol[c.key] || [], h0).map((e) => (
                <button key={e.id} type="button" className={`calEvent st-${e.status}${e.id === selected ? " sel" : ""}`}
                  style={{ top: e.top * PX_PER_MIN, height: Math.max(e.height * PX_PER_MIN, 20), left: `${(e.lane / e.lanes) * 100}%`, width: `${100 / e.lanes}%` }}
                  title={`${fmtTime(e.start)} ${e.service_name} · ${e.customer_name}`} onClick={() => setSelected(e.id)}>
                  <b>{fmtTime(e.start)}</b> {mode === "week" && !pro ? `${e.professional_name} · ` : ""}{e.customer_name}
                </button>
              ))}
            </div>
          ))}
        </div>
      </div>
      {data?.length === 0 && <p className="muted">Nenhum agendamento neste período.</p>}
      {current && <div className="calDetail">{renderDetail(current)}</div>}
    </div>
  );
}
