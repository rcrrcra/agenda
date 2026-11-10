/**
 * Barra de abas (também usada como seletor de modo dentro de formulários).
 *
 * @param {object} props
 * @param {{key: string, label: string}[]} props.tabs Abas disponíveis.
 * @param {string} props.value Chave da aba ativa.
 * @param {(key: string) => void} props.onChange Chamado ao clicar em uma aba.
 * @param {"main"|"sub"|"inline"} [props.variant] `main` = navegação principal,
 *   `sub` = sub-navegação, `inline` = sub-navegação sem margem (dentro de cards).
 */
export default function Tabs({ tabs, value, onChange, variant = "main" }) {
  const className = { main: "", sub: "subnav", inline: "subnav inline" }[variant];
  return (
    <nav className={className}>
      {tabs.map((t) => (
        // type="button" evita enviar o formulário quando as abas ficam dentro de um <form>
        <button type="button" key={t.key} className={t.key === value ? "on" : ""} onClick={() => onChange(t.key)}>
          {t.label}
        </button>
      ))}
    </nav>
  );
}
