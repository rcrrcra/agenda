import { useEffect, useState } from "react";

/**
 * Devolve `value` só depois que ele para de mudar por `delay` ms.
 * Útil para não consultar a API a cada tecla digitada.
 */
export function useDebounced(value, delay = 250) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer); // reinicia a contagem se o valor mudar antes
  }, [value, delay]);
  return debounced;
}
