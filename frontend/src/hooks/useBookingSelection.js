import { useCallback, useEffect, useMemo, useState } from "react";
import { getProfessionals } from "../api/booking";
import { today } from "../utils/date";
import { useApi } from "./useApi";
import { useSlots } from "./useSlots";

/**
 * Estado compartilhado do fluxo "escolher profissional → serviço → data → horário"
 * dentro de uma empresa.
 *
 * Usado tanto pela página do cliente quanto pelo formulário de novo
 * agendamento da equipe, para que as duas sigam exatamente as mesmas regras.
 *
 * @param {string|number} companyId Empresa cujos profissionais são oferecidos ("" = nenhuma).
 * @param {{staff?: boolean}} [options] `staff`: reserva feita pela equipe (sem antecedência mínima).
 * @returns {object} Seleção atual, setters, horários livres e `reloadSlots`.
 *   - `loaded`: a lista de profissionais da empresa já chegou.
 *   - `reloadSlots()`: limpa o horário escolhido e recarrega a lista
 *     (chamar depois de um conflito).
 */
export function useBookingSelection(companyId, { staff = false } = {}) {
  const { data, error: loadError } = useApi(
    () => (companyId ? getProfessionals(companyId) : Promise.resolve([])), [companyId]);

  // Só profissionais DESTA empresa e com ao menos um serviço; o filtro por empresa descarta
  // a lista antiga que ainda está na tela enquanto a da nova empresa não chega.
  const pros = useMemo(
    () => (data || []).filter((p) => p.company === Number(companyId) && p.services.length > 0),
    [data, companyId]);
  const loaded = data !== null && (data.length === 0 || data.some((p) => p.company === Number(companyId)));

  const [proId, setProId] = useState("");
  const [service, setService] = useState("");
  const [date, setDate] = useState(today());
  const [slot, setSlot] = useState("");
  const current = pros.find((p) => String(p.id) === proId);

  // Mantém um profissional válido: o primeiro da empresa quando a lista (ou a empresa) muda.
  useEffect(() => {
    if (!pros.some((p) => String(p.id) === proId)) setProId(pros[0] ? String(pros[0].id) : "");
  }, [pros, proId]);

  // Ao trocar de profissional, seleciona o primeiro serviço dele.
  useEffect(() => {
    setService(current?.services[0] ? String(current.services[0].service) : "");
  }, [current]);

  const { slots, reload, error: slotsError } = useSlots(proId, service, date, staff);

  // Qualquer mudança na seleção invalida o horário escolhido.
  useEffect(() => { setSlot(""); }, [proId, service, date]);

  const reloadSlots = useCallback(() => {
    setSlot("");
    return reload();
  }, [reload]);

  return {
    loaded, pros, current,
    proId, setProId, service, setService, date, setDate,
    slots, slot, setSlot, reloadSlots,
    error: loadError || slotsError,
  };
}
