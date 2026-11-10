# Implantação (Vercel + Supabase)

Backend **NestJS** na Vercel (função serverless), banco **PostgreSQL** e imagens no **Supabase**, front React (Vite) como
um segundo projeto na Vercel. Regras de uso: [processos.md](processos.md).

```
navegador → front (Vercel, estático) → API NestJS (Vercel, /api/*) → Supabase (Postgres + Storage)
```

## 1. Supabase
1. Crie o projeto. Em **Project Settings → Database → Connection string** copie:
   - **Transaction pooler** (porta 6543) → `DATABASE_URL` (com `?pgbouncer=true`);
   - **Direct connection** (porta 5432) → `DIRECT_URL` (só para migrações).
2. **Storage → New bucket**: nome `media`, marque **Public bucket**.
3. **Project Settings → API Keys**: em **Secret keys** crie/copie uma chave `sb_secret_...` (`SUPABASE_SECRET_KEY`; só no backend, nunca no front). A `Project URL` (`SUPABASE_URL`) aparece em **Project Settings → General** (ou na página inicial do projeto). A chave antiga `service_role` ainda funciona via `SUPABASE_SERVICE_ROLE_KEY`, mas não é necessária. A chave *publishable* não é usada: o front não fala com o Supabase.
4. Aplique as tabelas (na sua máquina, com `DIRECT_URL` no `backend/.env`):
   ```bash
   cd backend && npm install && npx prisma migrate deploy
   ```
   (ou cole `backend/prisma/migrations/0001_init/migration.sql` no SQL Editor do Supabase).
5. Crie o admin geral e, se quiser, os dados de exemplo:
   ```bash
   ADMIN_EMAIL=dono@seudominio.com ADMIN_PASSWORD='SenhaForte123' npm run seed
   npm run seed -- --history        # opcional: ~90 dias de atendimentos para ver os relatórios
   ```

## 2. API na Vercel
1. **Add New → Project**, importe o repositório e defina **Root Directory = `backend`** (o `vercel.json` já traz build e rotas).
2. Variáveis de ambiente (Settings → Environment Variables), conforme `backend/.env.example`:
   `DATABASE_URL`, `DIRECT_URL`, `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `SUPABASE_BUCKET`, `FRONTEND_URL`
   (domínio do front, vários separados por vírgula) e, para e-mail, `EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_HOST_USER`,
   `EMAIL_HOST_PASSWORD`, `DEFAULT_FROM_EMAIL`. Sem `EMAIL_HOST` os e-mails só aparecem no log da função.
3. Deploy. A API fica em `https://SEU-PROJETO.vercel.app/api/...`.

## 3. Front na Vercel
Outro projeto com **Root Directory = `frontend`** (framework Vite) e a variável `VITE_API_URL=https://SEU-PROJETO-API.vercel.app/api`.
O `frontend/vercel.json` reescreve todas as rotas para `index.html`.

## Desenvolvimento local
```bash
cd backend && cp .env.example .env     # DATABASE_URL pode ser um Postgres local ou o do Supabase
npm install && npx prisma migrate deploy && npm run seed && npm run start:dev    # http://localhost:8000
cd ../frontend && npm install && npm run dev                                       # http://localhost:5173 (proxy /api → :8000)
```
Sem `SUPABASE_URL`, logo e fotos são gravados em `backend/media/` e servidos em `/media` (só para desenvolvimento).

## Testes
`cd backend && npm test` sobe um Postgres embutido, aplica a migração e roda 27 testes de ponta a ponta (perfis, agenda,
concorrência, relatórios, auditoria, bloqueio de login, imagens).

## Pontos de atenção na Vercel
- **Corpo da requisição ≤ 4,5 MB**: por isso as imagens aceitam até 4 MB (no Django eram 5 MB).
- **Funções são efêmeras**: nada de disco local; imagens vão ao Supabase Storage e os e-mails são enviados antes da resposta.
- **Conexões**: use sempre o pooler (6543) em `DATABASE_URL`; cada instância abre no máximo 3 (`DB_POOL_MAX`).
- **Concorrência de reservas**: a reserva trava a linha do profissional (`SELECT ... FOR UPDATE`) dentro de uma transação, como no Django.
- **Retenção do log de auditoria**: a tabela `audit_logs` cresce com o uso; planeje uma limpeza periódica.

## Migrar dados do Django
Os usuários do Django entram com a mesma senha: o NestJS lê o hash `pbkdf2_sha256` do Django (coluna `password_hash`).
Exporte as tabelas do `booking` e `auth_user` para as tabelas equivalentes (`users`, `companies`, ...; nomes em `schema.prisma`).
Recalcule `companies.search_text` abrindo/salvando cada empresa no painel. As imagens antigas (`media/`) devem ser enviadas ao bucket e o caminho gravado em `logo_path` / `image_path`.
