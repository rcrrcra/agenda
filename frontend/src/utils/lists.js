/** Helpers imutáveis para listas e objetos (usados nos formulários). */

/** Cópia da lista com o item `index` mesclado com `patch`. */
export const updateAt = (list, index, patch) => list.map((item, i) => (i === index ? { ...item, ...patch } : item));

/** Cópia da lista sem o item `index`. */
export const removeAt = (list, index) => list.filter((_, i) => i !== index);

/**
 * Agrupa itens por chave preservando a ordem de chegada.
 * @param {any[]} items
 * @param {(item: any) => string} keyFn Função que devolve a chave do grupo.
 * @returns {[string, any[]][]} Pares [chave, itens].
 */
export const groupBy = (items, keyFn) => {
  const groups = new Map();
  items.forEach((item) => {
    const key = keyFn(item);
    groups.set(key, [...(groups.get(key) || []), item]);
  });
  return [...groups];
};

/** Remove de um objeto as chaves com valor vazio (evita enviar filtros em branco). */
export const omitEmpty = (obj) => Object.fromEntries(Object.entries(obj).filter(([, v]) => v));
