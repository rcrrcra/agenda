/**
 * Cabeçalho do app: título, nome do usuário e botões de sair (neste dispositivo ou em todos).
 * @param {{user: {name?: string, email?: string, username?: string}, onLogout: () => void, onLogoutAll: () => void, onRegisterCompany: () => void}} props
 */
export default function AppHeader({ user, onLogout, onLogoutAll, onRegisterCompany }) {
  /** Pede confirmação antes de derrubar as sessões de todos os aparelhos. */
  const all = () => {
    if (confirm("Sair de todos os dispositivos? Você precisará entrar de novo em cada um.")) onLogoutAll();
  };
  return (
    <header>
      <h1>Agendamento</h1>
      <div className="who">
        <span className="muted">{user.name || user.email || user.username}</span>
        {/* discreto: só o ícone de loja, longe das abas; o texto aparece ao passar o mouse e para leitores de tela */}
        <button type="button" className="iconbtn" title="Cadastrar minha empresa" aria-label="Cadastrar minha empresa" onClick={onRegisterCompany}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M3 9l1.5-5h15L21 9" /><path d="M3 9a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0" /><path d="M5 12v8h14v-8" /><path d="M10 20v-5h4v5" />
          </svg>
        </button>
        <button type="button" onClick={onLogout}>Sair</button>
        <button type="button" className="link" onClick={all}>Sair de todos os dispositivos</button>
      </div>
    </header>
  );
}
