/** Lista de itens com o visual padrão do app. */
export function List({ children }) {
  return <ul className="list">{children}</ul>;
}

/**
 * Linha de lista: título, linhas de detalhe e ações à direita.
 *
 * @param {object} props
 * @param {import("react").ReactNode} props.title Texto principal (em negrito).
 * @param {boolean} [props.dimmed] Esmaece a linha (ex.: cancelado, inativo).
 * @param {import("react").ReactNode} [props.actions] Botões/links exibidos à direita.
 * @param {import("react").ReactNode} [props.children] Linhas de detalhe abaixo do título.
 */
export function ListRow({ title, dimmed = false, actions = null, children }) {
  return (
    <li className={dimmed ? "canceled" : ""}>
      <div>
        <strong>{title}</strong>
        {children}
      </div>
      {actions}
    </li>
  );
}
