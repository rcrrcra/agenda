import { useState } from "react";
import Tabs from "../../components/ui/Tabs";
import AuditView from "./AuditView";
import CompaniesView from "./CompaniesView";
import OverviewView from "./OverviewView";
import SettingsView from "./SettingsView";
import UsersView from "./UsersView";

const TABS = [
  { key: "overview", label: "Visão geral" },
  { key: "companies", label: "Empresas" },
  { key: "users", label: "Usuários" },
  { key: "audit", label: "Auditoria" },
  { key: "settings", label: "Configurações" },
];

/**
 * Painel do dono do software (superusuário): visão geral, empresas, usuários e log de auditoria de toda a plataforma.
 * @param {{me: {id: number}}} props `me` é o usuário logado.
 */
export default function PlatformPage({ me }) {
  const [view, setView] = useState("overview");
  return (
    <>
      <Tabs variant="sub" tabs={TABS} value={view} onChange={setView} />
      {view === "overview" && <OverviewView />}
      {view === "companies" && <CompaniesView />}
      {view === "users" && <UsersView me={me} />}
      {view === "audit" && <AuditView />}
      {view === "settings" && <SettingsView />}
    </>
  );
}
