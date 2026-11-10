import * as adminApi from "../../../api/admin";
import ErrorMessage from "../../../components/ui/ErrorMessage";
import { useApi } from "../../../hooks/useApi";
import ServiceRow from "./ServiceRow";

/** Catálogo geral de serviços (duração e preço são definidos em cada profissional). */
export default function ServicesView() {
  const { data: list, error, reload, setError } = useApi(adminApi.services.list);

  /** Chamado após salvar/excluir: limpa o erro e recarrega. */
  const saved = () => { setError(""); reload(); };

  return (
    <section className="card">
      <p className="muted">Catálogo geral. A duração e o preço de cada serviço são definidos em cada profissional.</p>
      <ErrorMessage message={error} />
      {list?.map((s) => <ServiceRow key={s.id} item={s} onSaved={saved} onError={setError} />)}
      <h3>Novo serviço</h3>
      <ServiceRow onSaved={saved} onError={setError} />
    </section>
  );
}
