import { useState } from "react";
import * as adminApi from "../../../api/admin";

/**
 * Linha editável de serviço. Sem `item`, funciona como formulário de criação.
 * @param {object} props
 * @param {{id: number, name: string, description: string}} [props.item] Serviço existente.
 * @param {() => void} props.onSaved Chamado após salvar, criar ou excluir.
 * @param {(message: string) => void} props.onError Recebe mensagens de erro da API.
 */
export default function ServiceRow({ item, onSaved, onError }) {
  const isNew = !item;
  const [draft, setDraft] = useState({ name: item?.name || "", description: item?.description || "" });

  /** Executa uma ação; em caso de erro repassa a mensagem ao pai. */
  const perform = async (fn) => {
    try {
      await fn();
      onSaved();
    } catch (err) {
      onError(err.message);
    }
  };

  /** Cria (limpando o formulário) ou atualiza o serviço. */
  const save = (e) => {
    e.preventDefault();
    perform(async () => {
      if (isNew) {
        await adminApi.services.create(draft);
        setDraft({ name: "", description: "" });
      } else {
        await adminApi.services.update(item.id, draft);
      }
    });
  };

  /** Exclui após confirmação (a API recusa se houver agendamentos). */
  const remove = () => {
    if (!confirm(`Excluir "${item.name}"?`)) return;
    perform(() => adminApi.services.remove(item.id));
  };

  return (
    <form className="row wrap-row" onSubmit={save}>
      <input required placeholder="Nome" aria-label="Nome" value={draft.name}
        onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
      <input placeholder="Descrição (opcional)" aria-label="Descrição" value={draft.description}
        onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
      <button className="primary">{isNew ? "Adicionar" : "Salvar"}</button>
      {!isNew && <button type="button" className="danger" onClick={remove}>Excluir</button>}
    </form>
  );
}
