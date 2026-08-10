# Planejamento de Disparos de E-mails

Aplicacao web em React + Vite + TypeScript, com backend Node usando Supabase como banco e n8n para integrar com Google Calendar.

Nada e criado automaticamente no Supabase pelo servidor. O banco precisa existir, o schema precisa ter sido executado e os usuarios precisam existir no Supabase Auth.

## Como rodar

```sh
npm install
npm run server
npm run dev
```

Depois abra o Vite:

```txt
http://127.0.0.1:5173
```

Se quiser usar somente o backend servindo o build gerado, rode:

```sh
npm run build
npm run server
```

E abra:

```txt
http://127.0.0.1:3000
```

## Estrutura

```txt
backend/          servidor Node, autenticacao, Supabase e integracao n8n
database/         SQLs do Supabase
src/              frontend React + TypeScript
index.html        entrada do Vite
vite.config.ts    configuracao do Vite e proxy da API
```

## Supabase

Crie um arquivo `.env` com:

```txt
SUPABASE_URL=https://seu-projeto.supabase.co
SUPABASE_PUBLISHABLE_KEY=sua-chave
```

Se quiser usar service role no backend local:

```txt
SUPABASE_SERVICE_ROLE_KEY=sua-chave-service-role
```

Para enviar disparos prontos ao Google Calendar via n8n, adicione tambem:

```txt
N8N_CALENDAR_WEBHOOK_URL=https://seu-n8n/webhook/seu-caminho-do-webhook
```

Se o webhook do n8n usar autenticacao por header, configure tambem:

```txt
N8N_CALENDAR_WEBHOOK_SECRET_HEADER=X-Webhook-Secret
N8N_CALENDAR_WEBHOOK_SECRET=SEU_SEGREDO_FORTE_DO_WEBHOOK
```

Opcionalmente, ajuste o timeout da chamada ao n8n:

```txt
N8N_CALENDAR_WEBHOOK_TIMEOUT_MS=15000
```

Nunca coloque `.env`, tokens, chaves do Supabase, URL operacional real do webhook ou segredo do n8n em arquivos versionados. Use `.env.example` apenas como modelo com placeholders.

## Banco novo

Para uma instalacao nova, execute apenas este arquivo inteiro no SQL Editor do Supabase:

```txt
database/schema.sql
```

Ele cria tudo que o backend espera encontrar:

- `allowed_users`
- `base_rules`
- `dispatches`
- `campaign_options`
- `audience_options`
- `responsible_options`
- triggers de `updated_at`
- funcoes auxiliares de RLS
- indices
- views de validacao
- grants e politicas RLS para usuarios autenticados e ativos

Depois disso, crie os usuarios no Supabase Auth com os mesmos e-mails cadastrados em `allowed_users`. O schema ja inclui os usuarios permitidos atuais; para liberar outro usuario, insira uma linha em `allowed_users` com `email`, `name`, `role` e `active = TRUE`.

## Banco existente

Se o banco ja existia antes desta consolidacao, use:

```txt
database/fix-common-errors.sql
```

Esse arquivo fica como migration/recuperacao para bancos antigos com colunas ausentes, politicas antigas, tabelas faltando ou constraints desatualizadas. Em banco novo, ele nao deve ser necessario.

## Estrategia de autorizacao

O app nao usa acesso direto do frontend ao Supabase. O frontend chama o backend Node, o backend autentica pelo Supabase Auth e depois consulta `allowed_users`.

A autorizacao efetiva tem duas camadas:

- O usuario precisa estar autenticado no Supabase Auth.
- O e-mail autenticado precisa existir em `allowed_users` com `active = TRUE`.

As tabelas sensiveis ficam com RLS habilitado. O papel `anon` nao recebe CRUD nas tabelas nem nas views. Usuarios autenticados que nao estejam ativos em `allowed_users` tambem nao conseguem ler ou alterar os dados diretamente pelo PostgREST/Supabase.

O schema cria a funcao segura `public.is_allowed_user()` para centralizar essa verificacao sem depender do frontend e sem criar politicas recursivas em `allowed_users`.

| Grupo de tabelas | anon SELECT | anon INSERT | anon UPDATE | anon DELETE | authenticated autorizado SELECT | authenticated autorizado INSERT | authenticated autorizado UPDATE | authenticated autorizado DELETE |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `allowed_users` | Nao | Nao | Nao | Nao | Apenas a propria linha ativa | Nao | Nao | Nao |
| `dispatches` | Nao | Nao | Nao | Nao | Sim | Sim | Sim | Sim |
| `base_rules` | Nao | Nao | Nao | Nao | Sim | Sim | Sim | Sim |
| `campaign_options` | Nao | Nao | Nao | Nao | Sim | Sim | Sim | Sim |
| `audience_options` | Nao | Nao | Nao | Nao | Sim | Sim | Sim | Sim |
| `responsible_options` | Nao | Nao | Nao | Nao | Sim | Sim | Sim | Sim |
| Views de validacao | Nao | Nao | Nao | Nao | Sim | N/A | N/A | N/A |

## Fluxo recomendado

1. Execute `database/schema.sql` inteiro no SQL Editor do Supabase.
2. Crie os usuarios no Supabase Auth.
3. Confirme que esses e-mails tambem existem em `allowed_users`.
4. Abra a aba `Cadastros` e cadastre campanhas, publicos e responsaveis.
5. Cadastre as regras de bases.
6. Cadastre os disparos usando os selects.
7. Use `Recarregar` para puxar novamente os dados do Supabase quando alterar algo direto no banco.

## Producao

Para usar fora da maquina local, hospede o backend Node em um servidor com variaveis de ambiente seguras e publique o frontend com `npm run build`. Em producao, use `SUPABASE_SERVICE_ROLE_KEY` apenas no backend, nunca no navegador.

## Seguranca de configuracao

A chamada ao n8n fica centralizada no backend em `POST /api/integrations/n8n/calendar`. O frontend nunca recebe a URL operacional do webhook nem o segredo configurado em `N8N_CALENDAR_WEBHOOK_SECRET`.

Variaveis esperadas:

| Variavel | Obrigatoria | Onde usar | Observacao |
| --- | --- | --- | --- |
| `SUPABASE_URL` | Sim | Backend | URL do projeto Supabase. |
| `SUPABASE_PUBLISHABLE_KEY` ou `SUPABASE_ANON_KEY` | Sim | Backend | Chave publica usada para autenticar chamadas ao Supabase. |
| `SUPABASE_SERVICE_ROLE_KEY` | Opcional | Backend | Use apenas no backend e somente quando necessario. |
| `N8N_CALENDAR_WEBHOOK_URL` | Sim para Google Calendar | Backend | URL operacional real do webhook. Nunca versionar. |
| `N8N_CALENDAR_WEBHOOK_SECRET_HEADER` | Opcional | Backend | Nome do header de autenticacao; padrao: `X-Webhook-Secret`. |
| `N8N_CALENDAR_WEBHOOK_SECRET` | Opcional | Backend | Segredo/token enviado ao n8n por header. Nunca versionar. |
| `N8N_CALENDAR_WEBHOOK_TIMEOUT_MS` | Opcional | Backend | Tempo limite da chamada ao n8n; padrao: `15000`. |

Antes de gerar um ZIP do projeto, confira se estes itens nao entraram no pacote:

- `.env`
- `node_modules/`
- `dist/`
- `server.stdout.log`
- `server.stderr.log`
- qualquer arquivo exportado do n8n contendo credenciais reais

Recomendacao de rotacao: se uma URL real de webhook ou segredo ja foi compartilhado em conversa, print, ZIP, historico antigo ou ambiente fora do servidor, crie um novo caminho de webhook no n8n e um novo segredo forte, atualize o `.env` do servidor e desative o webhook/segredo antigo. Nao registre o valor antigo em codigo, README, issue, commit ou mensagem de erro.

## Rotas do backend

- `POST /api/auth/login` autentica no Supabase Auth e valida o usuario em `allowed_users`.
- `GET /api/auth/me` valida a sessao atual.
- `GET /api/state` lista disparos, regras de base e cadastros.
- `PUT /api/state` salva disparos, regras de base e cadastros.
- `POST /api/integrations/n8n/calendar` envia ao webhook do n8n um disparo informado por `dispatchId`. Use `action: "upsert"` para criar/atualizar no Google Calendar e `action: "delete"` para remover.

## n8n + Google Calendar

Na aba `Calendario`, abra um dia, clique em `Ver completo` no disparo desejado e use o botao `Sincronizar Google Calendar`. O backend envia para o webhook do n8n um payload com:

- `action`: `upsert` ou `delete`.
- `dispatchId`: ID do disparo no app.
- `calendarEventId`: ID real do evento salvo em `google_calendar_event_id`.
- `count`: sempre `1`.
- `event`: evento pronto para mapear no no Google Calendar.
- `events`: lista com o mesmo evento, para facilitar workflows que iteram arrays.
