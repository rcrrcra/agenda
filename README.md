# Agendamento — NestJS + React + Supabase (multiempresa)

Migração do projeto Django: o **backend agora é NestJS na Vercel**, o **banco é PostgreSQL no Supabase** e as imagens ficam no
**Supabase Storage**. O front React (`frontend/`) é o mesmo, sem mudanças de código: ele só depende das rotas `/api` e do cabeçalho `X-Company`.
Todas as funcionalidades do Django foram reproduzidas (perfis, multiempresa, agenda com regras de horário, clientes e alerta de faltas,
avaliações, página pública, relatórios CSV/Excel, log de auditoria, sessões e bloqueio de login, e-mails).

## Pastas
| Pasta | O que é |
|---|---|
| `backend/` | API NestJS + Prisma (`prisma/schema.prisma`, migração SQL, `seed.ts`), testes em `test/`, função da Vercel em `api/index.js` |
| `frontend/` | React + Vite (igual ao original) |
| `docs/` | `processos.md` (regras) e `implantacao.md` (Supabase + Vercel) |
| `backend-django-referencia/` | Backend Django original, mantido só como referência |

## Rodar em desenvolvimento
```bash
cd backend && cp .env.example .env            # preencha DATABASE_URL / DIRECT_URL (Supabase ou Postgres local)
npm install
npx prisma migrate deploy                     # cria as tabelas
ADMIN_EMAIL=dono@exemplo.com ADMIN_PASSWORD='SenhaForte123' npm run seed   # admin geral + empresas de exemplo (--history para relatórios)
npm run start:dev                             # http://localhost:8000

cd ../frontend && npm install && npm run dev  # http://localhost:5173 (o Vite encaminha /api para :8000)
```
Testes: `cd backend && npm test` (Postgres embutido, 27 testes de ponta a ponta).

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

## Estrutura do backend (`backend/src`)
```
common/     prisma.service, auth (sessões por token + guard), audit.service (log), mail.service (SMTP), storage.service (Supabase Storage + sharp),
            slots (disponibilidade), appointments.service (reserva com trava), throttle (limite de login), password (hash compatível com Django),
            search, validate, tz (America/Sao_Paulo), xlsx
modules/    auth, catalog (busca, favoritas, profissionais, disponibilidade, página pública), appointments (cliente),
            company (configurações, logo, fotos, cadastro próprio), admin-catalog (serviços, profissionais, bloqueios),
            admin-agenda (agenda e clientes), platform (dono do software, auditoria), reports
```

## Diferenças em relação ao Django
- **Imagens**: até 4 MB (limite de corpo da Vercel) e guardadas no Supabase Storage.
- **Senhas**: o hash segue o formato `pbkdf2_sha256` do Django, então usuários migrados mantêm a senha. A lista de "senhas comuns" é menor que a do Django.
- **Django admin**: não existe; use o painel Plataforma e o Table Editor do Supabase.
- **E-mail**: SMTP por variáveis de ambiente (`EMAIL_HOST` etc.); sem elas o e-mail só aparece no log.
- **Horários**: guardados como texto `HH:MM:SS`; datas/horas dos agendamentos em UTC, exibidas em America/Sao_Paulo.
