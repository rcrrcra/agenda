import { COMPANY_CATEGORIES } from "../../utils/constants";
import Field from "../ui/Field";

/**
 * Campos de dados da empresa, compartilhados pelo cadastro e pela edição.
 * @param {object} props
 * @param {{name: string, category: string, city: string, address: string, description: string}} props.value Valores atuais.
 * @param {(value: object) => void} props.onChange Recebe o objeto inteiro atualizado.
 */
export default function CompanyFields({ value, onChange }) {
  /** Cria um handler que altera um único campo. */
  const set = (key) => (e) => onChange({ ...value, [key]: e.target.value });
  return (
    <div className="grid2">
      <Field label="Nome da empresa">
        <input required maxLength={120} value={value.name} onChange={set("name")} />
      </Field>
      <Field label="Categoria">
        {/* datalist sugere categorias comuns, mas aceita qualquer texto */}
        <input list="company-categories" maxLength={60} placeholder="Ex.: Barbearia, Clínica"
          value={value.category} onChange={set("category")} />
        <datalist id="company-categories">
          {COMPANY_CATEGORIES.map((c) => <option key={c} value={c} />)}
        </datalist>
      </Field>
      <Field label="Cidade"><input maxLength={80} value={value.city || ""} onChange={set("city")} /></Field>
      <Field label="Endereço"><input maxLength={255} value={value.address} onChange={set("address")} /></Field>
      <Field label="Descrição"><input maxLength={255} value={value.description} onChange={set("description")} /></Field>
    </div>
  );
}
