import { useState } from "react";
import AppHeader from "./components/layout/AppHeader";
import Tabs from "./components/ui/Tabs";
import { useActiveCompany } from "./hooks/useActiveCompany";
import { useAuth } from "./hooks/useAuth";
import RegisterCompanyDialog from "./components/company/RegisterCompanyDialog";
import AuthPage from "./pages/AuthPage";
import BookPage from "./pages/BookPage";
import PublicCompanyPage from "./pages/PublicCompanyPage";
import MyAppointmentsPage from "./pages/MyAppointmentsPage";
import AdminPage from "./pages/admin/AdminPage";
import PlatformPage from "./pages/platform/PlatformPage";
import ReportsPage from "./pages/reports/ReportsPage";

/**
 * Raiz do app: decide entre login e área logada e controla a aba ativa.
 *
 * Qualquer usuário agenda nas empresas que pesquisou e adicionou. A aba "Administração" só existe para
 * quem administra alguma empresa; "Relatórios" aparece para administradores e para o admin geral; as empresas são cadastradas pelo dono do software, na aba "Plataforma".
 */
export default function App() {
  const { user, setUser, ready, logout, logoutAll, refreshUser } = useAuth();
  const { company, companies, select } = useActiveCompany(user);
  const [tab, setTab] = useState("book");
  const [registering, setRegistering] = useState(false); // janela "Cadastrar minha empresa"
  const [entering, setEntering] = useState(false); // visitante quer entrar a partir da página pública

  if (!ready) return null; // aguarda a verificação inicial do token
  if (!user) {
    // Link ?empresa=slug sem login: mostra a página pública da empresa antes de pedir o login.
    const slug = new URLSearchParams(window.location.search).get("empresa");
    if (slug && !entering) return <PublicCompanyPage slug={slug} onEnter={() => setEntering(true)} />;
    return <AuthPage onAuth={setUser} />;
  }

  const tabs = [
    { key: "book", label: "Agendar" },
    { key: "mine", label: "Meus horários" },
    ...(company ? [{ key: "admin", label: "Administração" }] : []),
    // relatórios: admin geral (tudo) e administradores de estabelecimento (só os deles)
    ...(user.is_superuser || company ? [{ key: "reports", label: "Relatórios" }] : []),
    // só o dono do software (superusuário) vê o painel da plataforma
    ...(user.is_superuser ? [{ key: "platform", label: "Plataforma" }] : []),
  ];

  /** Sai e volta para a aba inicial (evita reabrir o painel em outra conta). */
  const handleLogout = () => {
    logout();
    setTab("book");
  };

  /** Sai de todos os dispositivos e volta para a aba inicial. */
  const handleLogoutAll = () => {
    logoutAll();
    setTab("book");
  };

  return (
    // o painel usa mais largura que as telas do cliente
    <main className={["admin", "platform", "reports"].includes(tab) ? "wrap wide" : "wrap"}>
      <AppHeader user={user} onLogout={handleLogout} onLogoutAll={handleLogoutAll} onRegisterCompany={() => setRegistering(true)} />
      {registering && (
        <RegisterCompanyDialog onClose={() => setRegistering(false)} onCreated={async (c) => {
          await refreshUser();       // traz a nova empresa para a lista do usuário
          select(c.id);
          setRegistering(false);
          setTab("admin");
        }} />
      )}
      <Tabs tabs={tabs} value={tab} onChange={setTab} />
      {tab === "book" && <BookPage onDone={() => setTab("mine")} />}
      {tab === "mine" && <MyAppointmentsPage />}
      {tab === "reports" && (user.is_superuser || company) && <ReportsPage />}
      {tab === "platform" && user.is_superuser && <PlatformPage me={user} />}
      {tab === "admin" && company && (
        <AdminPage key={company.id} company={company} companies={companies}
          onSelectCompany={select} onCompaniesChanged={refreshUser} />
      )}
    </main>
  );
}
