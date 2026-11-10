import { useCallback, useEffect, useRef, useState } from "react";
import { getSlots } from "../api/booking";

/**
 * Carrega os horários livres para (profissional, serviço, data).
 *
 * @param {string} professional ID do profissional ("" enquanto não escolhido).
 * @param {string} service ID do serviço.
 * @param {string} date AAAA-MM-DD.
 * @param {boolean} [staff] Reserva feita pela equipe (ignora a antecedência mínima).
 * @returns {{slots: string[], reload: () => Promise<void>, error: string}}
 */
export function useSlots(professional, service, date, staff = false) {
  const [slots, setSlots] = useState([]);
  const [error, setError] = useState("");
  const latest = useRef(0); // descarta respostas de consultas antigas

  const reload = useCallback(() => {
    const id = ++latest.current;
    if (!professional || !service || !date) {
      setSlots([]);
      return Promise.resolve();
    }
    return getSlots(professional, service, date, staff)
      .then((r) => {
        if (id !== latest.current) return;
        setSlots(r.slots);
        setError("");
      })
      .catch((e) => {
        if (id !== latest.current) return;
        setSlots([]);
        setError(e.message);
      });
  }, [professional, service, date, staff]);

  // Limpa a lista antiga imediatamente para não mostrar horários de outra seleção.
  useEffect(() => { setSlots([]); reload(); }, [reload]);

  return { slots, reload, error };
}
