import { useCallback, useState } from "react";

/**
 * Executa ações assíncronas (salvar, cancelar…) controlando erro e "ocupado".
 *
 * Substitui o padrão repetido `try/catch + setError + setLoading`.
 *
 * @returns {{
 *   error: string,
 *   setError: (msg: string) => void,
 *   busy: boolean,
 *   run: (fn: () => Promise<any>) => Promise<boolean>
 * }} `run` devolve `true` se a ação deu certo e `false` se falhou (erro fica em `error`).
 */
export function useAction() {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const run = useCallback(async (fn) => {
    setError("");
    setBusy(true);
    try {
      await fn();
      return true;
    } catch (e) {
      setError(e.message);
      return false;
    } finally {
      setBusy(false);
    }
  }, []);

  return { error, setError, busy, run };
}
