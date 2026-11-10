import { useEffect, useState } from "react";
import * as bookingApi from "../api/booking";
import { searchCompanies } from "../api/companies";
import ScheduleFields from "../components/booking/ScheduleFields";
import { getPublicCompany } from "../api/public";
import CompanyProfile from "../components/company/CompanyProfile";
import CompanyPicker from "../components/company/CompanyPicker";
import CompanySearch from "../components/company/CompanySearch";
import ErrorMessage from "../components/ui/ErrorMessage";
import Field from "../components/ui/Field";
import { useAction } from "../hooks/useAction";
import { useBookingSelection } from "../hooks/useBookingSelection";
import { useApi } from "../hooks/useApi";
import { useFavorites } from "../hooks/useFavorites";

/**
 * Página do cliente para agendar. Não lista todas as empresas: o cliente pesquisa e adiciona
 * as preferidas; depois escolhe uma delas e, dentro dela, profissional, serviço, data e horário.
 *
 * Aceita o link `?empresa=<slug>`: a empresa é adicionada às preferidas e já vem selecionada.
 *
 * @param {{onDone: () => void}} props Chamado após o agendamento ser confirmado.
 */
export default function BookPage({ onDone }) {
  const { favorites, error: favError, add, remove } = useFavorites();
  const [companyId, setCompanyId] = useState("");
  const [adding, setAdding] = useState(false); // painel de pesquisa aberto
  const selection = useBookingSelection(companyId);
  const [notes, setNotes] = useState("");
  const { error, busy, run } = useAction();
  const { error: linkError, run: runLink } = useAction();

  // Link ?empresa=slug: busca a empresa, adiciona às preferidas (se faltar) e seleciona.
  useEffect(() => {
    if (!favorites) return;
    const slug = new URLSearchParams(window.location.search).get("empresa");
    if (!slug || sessionStorage.getItem("agenda_deeplink") === slug) return;
    sessionStorage.setItem("agenda_deeplink", slug); // processa o link uma única vez por sessão
    runLink(async () => {
      const [found] = await searchCompanies({ slug });
      if (!found) throw new Error("Empresa do link não encontrada.");
      if (!favorites.some((c) => c.id === found.id)) await add(found.id);
      setCompanyId(String(found.id));
    });
  }, [favorites]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sem escolha (ou empresa removida das preferidas): seleciona a primeira preferida.
  useEffect(() => {
    if (!favorites) return;
    if (!favorites.some((c) => String(c.id) === companyId)) setCompanyId(favorites[0] ? String(favorites[0].id) : "");
  }, [favorites, companyId]);

  /** Adiciona uma empresa encontrada, seleciona e fecha a pesquisa. */
  const addAndSelect = async (id) => {
    await add(id);
    setCompanyId(String(id));
    setAdding(false);
  };

  /** Confirma o agendamento; se o horário foi tomado, recarrega as opções. */
  const submit = async (e) => {
    e.preventDefault();
    const ok = await run(() => bookingApi.createAppointment({
      professional: Number(selection.proId),
      service: Number(selection.service),
      start: selection.slot,
      notes,
    }));
    if (ok) onDone();
    else selection.reloadSlots();
  };

  const selectedSlug = favorites?.find((c) => String(c.id) === companyId)?.slug;
  const { data: profile } = useApi(() => (selectedSlug ? getPublicCompany(selectedSlug) : Promise.resolve(null)), [selectedSlug]);

  if (!favorites) return <ErrorMessage message={favError} />;
  const hasFavorites = favorites.length > 0;
  const showSearch = adding || !hasFavorites; // sem preferidas, a pesquisa já abre

  return (
    <form onSubmit={submit} className="card">
      <fieldset>
        <legend>Suas empresas</legend>
        {hasFavorites && <CompanyPicker companies={favorites} value={companyId} onChange={setCompanyId} onRemove={remove} />}
        {!hasFavorites && <p className="muted">Pesquise a empresa onde quer agendar e adicione às suas preferidas.</p>}
        {showSearch
          ? <CompanySearch favoriteIds={favorites.map((c) => c.id)} onAdd={addAndSelect} />
          : <button type="button" className="link" onClick={() => setAdding(true)}>+ Adicionar empresa</button>}
      </fieldset>
      {hasFavorites && profile && profile.slug === selectedSlug && (
        <details className="aboutBox"><summary>Sobre a empresa</summary><CompanyProfile company={profile} /></details>
      )}
      {hasFavorites && (selection.loaded && selection.pros.length === 0 ? (
        <p className="muted">Esta empresa ainda não tem profissionais disponíveis.</p>
      ) : (
        <>
          <ScheduleFields selection={selection} />
          <Field label="Observações (opcional)">
            <input maxLength={255} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>
        </>
      ))}
      <ErrorMessage message={error || favError || linkError || selection.error} />
      <button className="primary" disabled={!selection.slot || busy}>
        {busy ? "Agendando…" : "Confirmar agendamento"}
      </button>
    </form>
  );
}
