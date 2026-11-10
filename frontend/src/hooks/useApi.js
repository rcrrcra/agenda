import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Carrega dados de uma função assíncrona ao montar e quando `deps` mudam.
 *
 * Ignora respostas antigas: se os filtros mudarem rápido, só a última
 * requisição atualiza a tela.
 *
 * @template T
 * @param {() => Promise<T>} fetcher Função que busca os dados.
 * @param {any[]} [deps] Quando mudam, os dados são recarregados.
 * @returns {{data: T|null, error: string, reload: () => Promise<void>, setError: Function}}
 *   `data` é `null` até a primeira resposta chegar.
 */
export function useApi(fetcher, deps = []) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const latest = useRef(0); // contador para descartar respostas fora de ordem

  const reload = useCallback(() => {
    const id = ++latest.current;
    return fetcher()
      .then((result) => {
        if (id !== latest.current) return;
        setData(result);
        setError("");
      })
      .catch((e) => {
        if (id === latest.current) setError(e.message);
      });
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { reload(); }, [reload]);

  return { data, error, reload, setError };
}
