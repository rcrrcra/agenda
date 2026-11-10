/**
 * Mensagem de erro acessível (`role="alert"`). Não renderiza nada sem mensagem.
 * @param {{message?: string}} props
 */
export default function ErrorMessage({ message }) {
  if (!message) return null;
  return <p className="error" role="alert">{message}</p>;
}
