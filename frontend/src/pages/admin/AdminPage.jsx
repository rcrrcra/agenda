import { useState } from "react";
import Tabs from "../../components/ui/Tabs";
import CompanyBar from "./CompanyBar";
import AgendaView from "./agenda/AgendaView";
import ClientsView from "./clients/ClientsView";
import CompanySettings from "./company/CompanySettings";
import ProfessionalsView from "./professionals/ProfessionalsView";
import ServicesView from "./services/ServicesView";
import TimeOffView from "./timeoff/TimeOffView";

const TABS = [
  { key: "agenda", label: "Agenda" },
  { key: "pros", label: "Profissionais" },
  { key: "timeoff", label: "Bloqueios" },
  { key: "clients", label: "Clientes" },
  { key: "services", label: "Serviços" },
  { key: "company", label: "Empresa" },
];

/**
 * Painel de administração de UMA empresa. O App usa `key={company.id}`, então ao trocar de
 * empresa o painel inteiro é recriado e nenhum filtro ou formulário vaza para a outra.
 *
 * @param {object} props
 * @param {{id: number, name: string}} props.company Empresa administrada.
 * @param {{id: number, name: string}[]} props.companies Empresas do usuário (para o seletor).
 * @param {(id: number) => void} props.onSelectCompany Troca a empresa administrada.
 * @param {() => void} props.onCompaniesChanged Pede ao App para recarregar a lista de empresas.
 */
export default function AdminPage({ company, companies, onSelectCompany, onCompaniesChanged }) {
  const [view, setView] = useState("agenda");

  return (
    <>
      <CompanyBar company={company} companies={companies} onSelect={onSelectCompany} />
      <Tabs variant="sub" tabs={TABS} value={view} onChange={setView} />
      {view === "agenda" && <AgendaView companyId={company.id} />}
      {view === "pros" && <ProfessionalsView />}
      {view === "timeoff" && <TimeOffView />}
      {view === "clients" && <ClientsView />}
      {view === "services" && <ServicesView />}
      {view === "company" && <CompanySettings onSaved={onCompaniesChanged} />}
    </>
  );
}
