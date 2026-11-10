import { getPublicCompany } from "../api/public";
import CompanyProfile from "../components/company/CompanyProfile";
import ErrorMessage from "../components/ui/ErrorMessage";
import { useApi } from "../hooks/useApi";

/**
 * Página pública de uma empresa, aberta pelo link `?empresa=<slug>` por quem ainda não entrou.
 * Mostra o perfil e um botão para entrar/cadastrar e agendar (o login continua obrigatório para agendar).
 * @param {{slug: string, onEnter: () => void}} props
 */
export default function PublicCompanyPage({ slug, onEnter }) {
  const { data: company, error } = useApi(() => getPublicCompany(slug), [slug]);
  return (
    <main className="wrap">
      <section className="card">
        <ErrorMessage message={error} />
        {company && <CompanyProfile company={company} />}
        <button type="button" className="primary" onClick={onEnter}>Entrar ou criar conta para agendar</button>
      </section>
    </main>
  );
}
