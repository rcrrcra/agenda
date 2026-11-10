import { removeAt, updateAt } from "../../../utils/lists";

/**
 * Editor da lista de serviços que o profissional realiza,
 * cada um com duração, preço e (opcional) intervalo entre horários próprios.
 *
 * @param {object} props
 * @param {{service: number|string, duration_minutes: number|string, price: string|number, slot_minutes: string|number}[]} props.offers
 * @param {{id: number, name: string}[]} props.services Catálogo geral.
 * @param {(offers: object[]) => void} props.onChange Recebe a lista atualizada.
 */
export default function OffersEditor({ offers, services, onChange }) {
  // Serviços ainda não adicionados (cada serviço só pode aparecer uma vez).
  const unused = services.filter((s) => !offers.some((o) => Number(o.service) === s.id));

  /** Adiciona o primeiro serviço livre com valores padrão. */
  const add = () => onChange([...offers, { service: unused[0].id, duration_minutes: 30, price: "", slot_minutes: "" }]);

  return (
    <>
      {offers.map((o, i) => (
        <div className="rangeRow" key={i}>
          <select value={o.service} onChange={(e) => onChange(updateAt(offers, i, { service: e.target.value }))} aria-label="Serviço">
            {/* mostra o serviço da linha + os ainda livres, evitando duplicar */}
            {services.filter((s) => s.id === Number(o.service) || unused.includes(s)).map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
          <input type="number" min="5" step="5" required placeholder="min" aria-label="Duração em minutos"
            value={o.duration_minutes} onChange={(e) => onChange(updateAt(offers, i, { duration_minutes: e.target.value }))} />
          <input type="number" min="0" step="0.01" placeholder="R$" aria-label="Preço"
            value={o.price} onChange={(e) => onChange(updateAt(offers, i, { price: e.target.value }))} />
          {/* vazio = usa o padrão do profissional; a faixa de cada dia ainda pode sobrepor */}
          <input type="number" min="5" step="5" placeholder="grade" aria-label="Intervalo entre horários do serviço (min)"
            title="Intervalo entre horários deste serviço (vazio = padrão do profissional)"
            value={o.slot_minutes} onChange={(e) => onChange(updateAt(offers, i, { slot_minutes: e.target.value }))} />
          <button type="button" onClick={() => onChange(removeAt(offers, i))} aria-label="Remover serviço">×</button>
        </div>
      ))}
      {unused.length > 0 ? (
        <button type="button" className="link" onClick={add}>+ Adicionar serviço</button>
      ) : (
        services.length === 0 && <p className="muted">Cadastre serviços na aba Serviços primeiro.</p>
      )}
    </>
  );
}
