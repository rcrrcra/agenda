/** Nomes dos dias da semana; o índice coincide com `weekday` da API (0 = segunda). */
export const DAYS = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"];

/** Sugestões de categoria no cadastro de empresa (o campo aceita qualquer texto). */
export const COMPANY_CATEGORIES = ["Barbearia", "Clínica", "Salão de beleza", "Estética", "Consultório", "Academia", "Outro"];

/** Situações de um agendamento: texto exibido (a ordem é a usada nos gráficos e legendas). */
export const STATUS_LABELS = {
  completed: "Concluído",
  confirmed: "Confirmado",
  no_show: "Não compareceu",
  canceled: "Cancelado",
};
/** Chaves das situações, na ordem dos gráficos. */
export const STATUS_ORDER = Object.keys(STATUS_LABELS);

/** Dias da semana abreviados (índice = `weekday`). */
export const DAYS_SHORT = DAYS.map((d) => d.slice(0, 3));

/** Perfis de usuário (o perfil só é alterado pelo admin geral). */
export const ROLE_LABELS = {
  client: "Cliente",
  company_admin: "Administrador de estabelecimento",
  platform_admin: "Admin geral",
};

/** Grupos de ações do log de auditoria (prefixo do código da ação → texto do filtro). */
export const AUDIT_GROUPS = {
  auth: "Acesso",
  company: "Empresas",
  user: "Usuários e perfis",
  service: "Serviços",
  professional: "Profissionais",
  timeoff: "Bloqueios de datas",
  appointment: "Agendamentos",
  client: "Clientes",
  favorite: "Empresas preferidas",
  report: "Relatórios",
  review: "Avaliações",
  settings: "Configurações da plataforma",
  audit: "Auditoria",
  admin_site: "Django admin",
};
