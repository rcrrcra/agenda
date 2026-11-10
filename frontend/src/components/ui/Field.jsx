/**
 * Campo de formulário: rótulo acima do controle (input, select…).
 * @param {{label: string, children: import("react").ReactNode, className?: string}} props
 */
export default function Field({ label, children, className }) {
  return (
    <label className={className}>
      {label}
      {children}
    </label>
  );
}
