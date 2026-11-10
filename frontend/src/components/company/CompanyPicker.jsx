/**
 * Empresas preferidas do cliente (cartões com nome, categoria e cidade) para escolher onde agendar.
 * @param {object} props
 * @param {{id: number, name: string, category: string, city: string}[]} props.companies Preferidas.
 * @param {string} props.value ID da empresa escolhida (como texto).
 * @param {(id: string) => void} props.onChange Recebe o ID da empresa clicada.
 * @param {(id: number) => void} props.onRemove Tira a empresa das preferidas.
 */
export default function CompanyPicker({ companies, value, onChange, onRemove }) {
  return (
    <div className="companies">
      {companies.map((c) => (
        <div key={c.id} className="companyWrap">
          {/* aria-pressed informa a leitores de tela qual cartão está selecionado */}
          <button type="button" className={String(c.id) === value ? "company on" : "company"}
            aria-pressed={String(c.id) === value} onClick={() => onChange(String(c.id))}>
            <strong>{c.name}</strong>
            {c.category && <small>{c.category}</small>}
            {c.city && <small>{c.city}</small>}
          </button>
          <button type="button" className="unfav" aria-label={`Remover ${c.name} das preferidas`}
            onClick={() => onRemove(c.id)}>×</button>
        </div>
      ))}
    </div>
  );
}
