# Documentação dos processos

Como o sistema funciona para cada perfil: regras, telas e relatórios. Para instalar e publicar, veja [implantacao.md](implantacao.md); para rodar em desenvolvimento, o [README](../README.md).

## Perfis de usuário
O admin geral também **cadastra usuários** em Plataforma → Usuários → Novo usuário (nome, e-mail, senha inicial e perfil, inclusive outro admin geral). Senhas: mínimo de 8 caracteres, não comuns, não só números.
| Perfil | Como é definido | O que faz |
|---|---|---|
| **Cliente** | padrão de quem cria conta | só pesquisa empresas e agenda/cancela os próprios horários |
| **Administrador de estabelecimento** | o admin geral o associa a uma empresa | painel da empresa (agenda, profissionais, serviços...), concluir atendimentos e **Relatórios** só da(s) empresa(s) dele |
| **Admin geral** (dono do software) | superusuário | tudo: empresas, usuários, **perfis** e relatórios de todas as empresas |

**Cadastro da própria empresa:** qualquer usuário logado cadastra uma empresa pelo **ícone de loja** no topo (ao lado de "Sair"). A empresa
fica **ativa na hora, sem aprovação**, e quem cadastrou passa a administrá-la (a aba Administração aparece). O admin geral pode
desativá-la depois. Há um **limite de empresas por usuário** (padrão 10), alterável em Plataforma → Configurações (0 = sem limite);
ele conta só as empresas que o usuário cadastrou sozinho, não as associadas pelo admin geral. O cadastro vai para o log
(`Cadastrou a própria empresa`, origem "próprio usuário").

**Dados de usuários:** em Plataforma → Usuários, **Editar dados** altera nome, e-mail (que é o login) e redefine a senha. Mudar e-mail ou
senha de outra pessoa encerra as sessões dela. Fica no log o que mudou (antes → depois); a senha nunca é gravada (só "redefinida").

**Só o admin geral altera perfis** (aba Plataforma → Usuários → "Salvar perfil"; para administrador de estabelecimento escolhe-se
a empresa). Ninguém altera o próprio perfil. O perfil é derivado dos dados (superusuário / vínculo com empresa), então
rebaixar para cliente remove o acesso na hora.

## Atendimentos concluídos
Na agenda do painel cada agendamento tem **Concluir**, **Não compareceu** e **Cancelar** (e **Reabrir** para desfazer
um engano). Concluir/faltou só funcionam depois do horário de início; concluído não pode ser cancelado.
Um aviso na agenda mostra quantos atendimentos já passaram e aguardam conclusão. O **preço é congelado** no agendamento:
mudar a tabela depois não altera o histórico.

## Avisos aos administradores
Quando entra um agendamento (feito pelo cliente ou pela equipe) ou um agendamento é cancelado, **cada administrador do
estabelecimento recebe um e-mail** (sem ver o endereço dos outros). Quem fez a ação não recebe o próprio aviso, e uma falha
de envio nunca desfaz o agendamento.

## Clientes (aba "Clientes" do painel)
Lista os clientes da empresa com atendimentos, faltas, cancelamentos, última visita e total gasto; busca por nome/e-mail e
filtro "só quem falta com frequência". Cada cliente tem um **histórico** (só dos atendimentos nesta empresa) e **observações
internas** que só a equipe da empresa vê. O **alerta** aparece para quem tem pelo menos 2 faltas e faltas em 30% ou mais dos
atendimentos finalizados (constantes em `backend/booking/clients.py`); também marca a linha na agenda. É só um aviso:
não impede o cliente de agendar.

## Log de auditoria (Plataforma → Auditoria, só o admin geral)
Registro permanente de **quem fez o quê, em qual empresa, quando e de qual IP**: login (inclusive tentativas que falharam),
cadastro, empresas e administradores, perfis e ativação de usuários, serviços, profissionais (com os campos alterados,
antes → depois), bloqueios, dados da empresa, agendamentos (criar, cancelar, concluir, não compareceu, reabrir),
observações de clientes, empresas preferidas, exportações de planilha e alterações feitas no banco pelo Django admin (só no projeto antigo).
Filtros: período, ação (ou grupo de ações), empresa, pessoa e texto livre. É somente leitura: não há como alterar ou apagar
registros pela API nem pelo Django admin. Nunca grava senhas, tokens nem o texto das observações de clientes (só o tamanho).
Ações recusadas (sem permissão, erro de validação) e repetições sem mudança não geram registro. O IP vem de `X-Forwarded-For` (a Vercel já o preenche). A tabela cresce com o uso: planeje uma política de retenção.

## Página pública da empresa
O link da empresa (`/?empresa=<slug>`, mostrado em Administração → Empresa) abre, para quem ainda não entrou, uma página com
logo, descrição, fotos, horário de funcionamento, profissionais (serviços e nota) e a nota média. Para agendar continua sendo
necessário entrar ou criar conta. Quem já está logado vê o mesmo conteúdo em "Sobre a empresa", na tela de agendar.
API: `GET /api/public/companies/<slug>/` (sem login; nunca expõe dados de clientes nem comentários).

## Configurações da empresa (Administração → Empresa)
- **Avisos por e-mail:** ligar/desligar o aviso ao cliente e o aviso aos administradores.
- **Antecedência:** mínima para agendar e mínima para o cliente cancelar (horas; 0 = sem regra). A equipe da empresa não é limitada.
- **Horário de funcionamento:** aparece na página pública e já vem como expediente ao cadastrar um profissional novo (depois pode ser ajustado).
- **Logo e fotos** (até 8): JPG, PNG ou WebP, validados e reduzidos no servidor (sharp), até **4 MB** (limite de corpo da Vercel). Ficam no **Supabase Storage** (bucket público `media`).

## Avaliações
Depois de **concluído**, o cliente avalia o atendimento (1 a 5 estrelas e comentário opcional; pode alterar depois) em "Meus horários".
A nota média por profissional aparece nos relatórios e na página pública.

## Segurança de login e sessões
- **Limite de tentativas:** 5 falhas seguidas por identificador (e-mail/usuário) em 15 min bloqueiam o login por um tempo (HTTP 429 com `Retry-After`);
  também há um limite por IP (30). Login correto zera a contagem. O bloqueio é gravado no log de auditoria (`auth.login_blocked`).
  Contrapartida: quem souber o e-mail de alguém pode bloqueá-lo temporariamente. Atrás de proxy, configure o IP real do cliente.
- **Sessões:** cada login cria uma sessão própria (só o hash do token fica no banco). Expira após 14 dias sem uso ou 30 dias de idade
  (`SESSION_IDLE_DAYS`, `SESSION_MAX_DAYS`). "Sair" encerra este dispositivo; "Sair de todos os dispositivos" encerra todos.
  Desativar o usuário também derruba as sessões. Tokens antigos (anteriores a esta versão) deixam de valer: é preciso entrar de novo.

## Relatórios (aba "Relatórios")
Para o admin geral e administradores de estabelecimento. Filtros: **período** (atalhos 7/30/90 dias, mês, 12 meses),
**estabelecimento**, **profissional**, **serviço** e **situação**. Mostra indicadores (total, concluídos, faltas,
cancelados, taxas de comparecimento/cancelamento, receita, ticket médio, receita prevista), gráficos (evolução por dia ou
por mês, por profissional, serviço, estabelecimento e dia da semana) e uma **planilha** ordenável e paginada, com
**exportação CSV** (separador `;`, abre direto no Excel). Receita = soma dos atendimentos **concluídos**.
Também mostra a **comparação com o período anterior** (mesma duração), **clientes novos x recorrentes** (novo = sem atendimento
anterior ao período na empresa), **nota média** e avaliações por profissional. **Exportação em Excel (.xlsx)** com abas Resumo,
Profissionais, Serviços e Atendimentos (o log de auditoria também exporta em .xlsx).
Para ver o dashboard cheio: `npm run seed -- --history` (na pasta `backend/`)`.

## Como funciona
- **Qualquer usuário** cria conta, **pesquisa** empresas (por nome, profissional, serviço, categoria ou endereço/cidade,
  sem diferenciar acentos), adiciona as **preferidas** e agenda com os profissionais delas. Não há lista geral de empresas.
- **Dono do software** (superusuário): aba **"Plataforma"** com visão geral, todas as empresas
  (ativar/desativar, definir administradores) e usuários (ativar/desativar).
- O dono do software (superusuário) também cadastra empresas, em "Plataforma" → "Empresas" → "Nova empresa", escolhendo o administrador pesquisando entre os usuários cadastrados. Os demais usuários cadastram a própria empresa pelo ícone de loja (veja "Perfis de usuário").
  Uma pessoa pode administrar várias empresas e trocar entre elas no painel.
- Cada empresa tem um link de agendamento: `http://localhost:5173/?empresa=<identificador>` (aparece na aba "Empresa" do painel).
- O painel só mostra e altera dados da empresa selecionada; a API recusa (403/404) qualquer acesso a outra empresa.

## Intervalo entre horários
É de quantos em quantos minutos os horários são oferecidos (ex.: 9:00, 9:30, 10:00). Vale o mais específico:
1. **faixa de atendimento do dia** (campo "grade" em cada faixa, na tela do profissional);
2. **serviço do profissional** (campo "grade" na linha do serviço);
3. **padrão do profissional** ("Intervalo padrão entre horários").
Campo vazio = herda o próximo nível. A folga entre atendimentos (`buffer`) continua por profissional.

## Painel de administração (aba "Administração")
- **Agenda:** em **Lista** (por dia) ou **Calendário** (semana ou dia, por profissional; clique no horário para ver detalhes e concluir/cancelar). Agendamentos da empresa, com filtro por período, profissional e situação; cancelar avisa o cliente por e-mail.
  O botão **Novo agendamento** reserva para um cliente da empresa ou novo (telefone/balcão) com as mesmas regras de horário.
  Cliente novo é criado sem senha e recebe o e-mail de confirmação; se se cadastrar depois com o mesmo e-mail, assume a conta.
- **Profissionais:** serviços oferecidos (duração e preço próprios), horários e pausas por dia da semana, intervalo entre horários (padrão, por serviço e por dia) e folga entre atendimentos.
- **Bloqueios:** feriados (empresa toda) e folgas/férias (um profissional). Agendamentos já confirmados não são cancelados sozinhos; o painel avisa quantos são.
- **Serviços:** catálogo da empresa.
- **Empresa:** nome, categoria, cidade, endereço, descrição, ativa/inativa e link de agendamento, além das configurações acima. Empresa inativa some para os clientes.

## Django admin
Não existe no NestJS. A visão técnica é o painel **Plataforma** do app e o **Table Editor / SQL Editor do Supabase**. O Django admin continua disponível apenas no projeto de referência (`backend-django-referencia/`).
