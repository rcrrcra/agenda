import Field from "../../components/ui/Field";

/**
 * Faixa no topo do painel: mostra a empresa administrada e permite trocar (quando há mais de uma).
 * @param {object} props
 * @param {{id: number, name: string}} props.company Empresa atual.
 * @param {{id: number, name: string}[]} props.companies Todas as empresas do usuário.
 * @param {(id: number) => void} props.onSelect Troca a empresa administrada.
 */
export default function CompanyBar({ company, companies, onSelect }) {
  return (
    <div className="companybar">
      {companies.length > 1 ? (
        <Field label="Empresa">
          <select value={company.id} onChange={(e) => onSelect(Number(e.target.value))}>
            {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
      ) : (
        <h2>{company.name}</h2>
      )}
    </div>
  );
}
