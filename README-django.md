# Agendamento — Django + React (multiempresa)

Cada **empresa** (barbearia, clínica, salão...) tem seus próprios serviços, profissionais, horários, bloqueios e agenda,
isolados das demais. Login obrigatório, e-mail de confirmação/cancelamento e link "Adicionar ao Google Agenda".

## Documentação
- [docs/processos.md](docs/processos.md): como o sistema funciona (perfis, agenda, relatórios, auditoria, segurança...).
- [docs/implantacao.md](docs/implantacao.md): Docker, domínio, HTTPS, banco, backup e operação.

## Rodar em desenvolvimento
### Backend
```bash
cd backend

# Windows (PowerShell):
C:\python\Python314\python.exe -m venv venv
.\venv\Scripts\Activate.ps1
# Se o PowerShell bloquear o script: Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
# Linux/macOS: python3 -m venv venv && source venv/bin/activate

pip install -r requirements.txt
python manage.py migrate
python manage.py createsuperuser      # dono do software: entra no Django admin (/admin/) e no app (aba "Plataforma")
python manage.py seed_demo            # opcional: barbearia e clínica de exemplo (use --history para 90 dias de atendimentos)
python manage.py runserver
```
Para administrar as empresas de exemplo, cadastre-se no app e rode
`python manage.py seed_demo --owner seu@email.com` (ou vincule o usuário à empresa em `/admin/`, que em desenvolvimento fica ligado).

**Bancos criados antes do suporte a empresas:** `python manage.py migrate` move serviços, profissionais e bloqueios
existentes para uma "Empresa padrão" e torna os usuários da equipe (`is_staff`) administradores dela.

**Login do dono:** na tela de entrada do app use o *nome de usuário* criado no `createsuperuser` (ou o e-mail, se ele tiver um).
Para administrar uma empresa específica, adicione-se como administrador dela na aba Plataforma → Empresas.

### Frontend
```bash
cd frontend
npm install
npm run dev        # http://localhost:5173 (e http://IP-DO-PC:5173 na rede)

# Acesso pelo celular (mesmo Wi-Fi): no backend rode `python manage.py runserver 0.0.0.0:8000`,
# no front `npm run dev` e abra http://IP-DO-PC:5173. Se não abrir, libere as portas 5173 e 8000 no firewall.
```

## API (resumo)
| Rota | Quem usa |
|---|---|
| `POST /api/auth/register/`, `/login/` (e-mail ou usuário), `GET /auth/me/` | todos (`me` traz as empresas administradas) |
| `POST /api/companies/register/` | qualquer usuário: cadastrar a própria empresa (limite por usuário) |
| `GET/PUT /api/platform/settings/` | dono: limite de empresas por usuário |
| `POST /api/platform/users/`, `PATCH /platform/users/<id>/` | dono: cadastrar usuário; editar nome, e-mail, senha, perfil e acesso |
| `POST /api/platform/companies/` | dono: cadastrar empresa (campo opcional `admin` = usuário/e-mail) |
| `GET /api/platform/users/?q=&limit=` | dono: pesquisa de usuários (autocomplete de administradores) |
| `GET /api/companies/search/?q=` ou `?slug=` | cliente: pesquisa (mín. 2 letras, até 20 resultados) |
| `GET/POST /api/favorites/`, `DELETE /api/favorites/<id empresa>/` | cliente: empresas preferidas |
| `/api/platform/...` (stats, companies, users) | só superusuário; `PATCH /platform/users/<id>/` com `role` (`client`, `company_admin` + `company`, `platform_admin`) altera o perfil |
| `GET /api/platform/audit/?from=&to=&action=&company=&actor=&q=&page=`, `/platform/audit/options/` | só admin geral: log de auditoria (somente leitura) |
| `GET /api/reports/options/`, `summary/`, `appointments/`, `export/` | admin geral e administradores (filtros: `from`, `to`, `company`, `professional`, `service`, `status`) |
| `GET /api/admin/clients/?q=&flagged=1`, `GET/PUT /api/admin/clients/<id>/` | painel: clientes, histórico e observações internas (`notes`) |
| `POST /api/admin/appointments/<id>/complete/`, `no-show/`, `reopen/` | painel: concluir, faltou, reabrir |
| `GET /api/public/companies/<slug>/` | público: página da empresa |
| `GET/PUT /api/admin/company/`, `POST/DELETE .../logo/`, `POST .../photos/`, `DELETE .../photos/<id>/` | painel: configurações, logo e fotos |
| `POST /api/appointments/<id>/review/` | cliente: avaliar atendimento concluído (`rating` 1–5, `comment`) |
| `POST /api/auth/logout/`, `/auth/logout-all/` | encerrar a sessão deste dispositivo / de todos |
| `GET /api/reports/export-xlsx/`, `GET /api/platform/audit/export/` | Excel do relatório / do log de auditoria |
| `GET /api/professionals/?company=<id>` | cliente: profissionais de uma empresa |
| `GET /api/availability/?professional=&service=&date=` | horários livres |
| `GET/POST /api/appointments/`, `POST .../{id}/cancel/` | cliente: seus agendamentos (em qualquer empresa) |
| `/api/admin/...` (services, professionals, time-off, appointments, customers, company) | painel: exige o cabeçalho `X-Company: <id>` e que o usuário administre essa empresa |

## Estrutura do frontend (`frontend/src`)
```
api/          Chamadas HTTP: client.js (fetch, token, X-Company, erros), auth.js, companies.js, booking.js, admin.js
hooks/        useApi, useAction, useAuth, useActiveCompany, useSlots, useDebounced,
              useBookingSelection (fluxo empresa→profissional→serviço→data→horário)
utils/        Funções puras: calendar.js (semana/dia), date.js, format.js (preço de serviço), reportFormat.js (R$ e % dos relatórios), lists.js, constants.js
components/
  charts/     ColumnChart, RankBars, StatusLegend (gráficos em SVG/CSS, sem biblioteca)
  ui/         Field, ErrorMessage, Tabs, List/ListRow
  booking/    SlotPicker, ScheduleFields (cliente e equipe) e ReviewBox (avaliação)
  company/    CompanyProfile e RatingBadge (perfil público), CompanyPicker (cliente escolhe a empresa) e CompanyFields (cadastro/edição) e UserPicker (autocomplete de usuários)
  layout/     AppHeader
pages/        AuthPage, BookPage, MyAppointmentsPage, PublicCompanyPage
  admin/      AdminPage, CompanyBar e uma pasta por tela: agenda/, professionals/, services/, timeoff/, company/
  platform/   painel do dono: visão geral, empresas, usuários (perfis), auditoria
  admin/clients/  lista e histórico de clientes
  reports/    ReportsPage (dashboard), ReportFilters, SummaryCards, ReportTable
styles/       base.css (tokens/formulários), layout.css, components.css, admin.css
```
Regra de organização: páginas só montam a tela; regras de dados ficam em `hooks/` e `api/`;
conversões de formato ficam em funções puras (`utils/` e `professionalFormState.js`).

## Estrutura do backend (`backend/booking`)
`models.py` (dados), `tenancy.py` (escopo por empresa via `X-Company`), `slots.py` (regras de horário),
`serializers.py`, `views.py`, `urls.py`, `emails.py`, `admin.py`, `roles.py` (perfis), `platform.py` (painel do dono),
`reports.py` (dashboard, tabela e CSV/Excel), `xlsx.py`, `company_profile.py` (configurações, imagens e página pública), `images.py`, `tokens.py` (sessões), `throttle.py` (limite de login), `clients.py` (histórico e alerta de faltas), `audit.py` (log de auditoria), `search.py` e `migrations/`.

## Convenções de documentação
- **Backend (Python):** todo módulo, classe e função tem docstring; regras não óbvias (trava contra reserva dupla,
  cálculo de horários, isolamento por empresa, substituição de listas aninhadas) têm comentário na própria linha.
- **Frontend (JS):** funções, hooks e componentes têm JSDoc (`@param`/`@returns`); funções de uma linha e trechos
  menos óbvios têm comentário curto ao lado.

