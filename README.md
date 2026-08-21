# Planejamento de Disparos de E-mails

Aplicação web em React + Vite + TypeScript, com backend Node preparado para usar Supabase como banco.

Nada é criado automaticamente no Supabase. O servidor só lê e salva dados quando as variáveis de ambiente estiverem configuradas e as tabelas já existirem.

## Como rodar

```sh
npm install
npm run dev:full
npm run server
npm run dev
& "C:\Program Files\nodejs\npm.cmd" run build
cd "C:\Users\MKT_EAD\Downloads\disparo de emails 2\disparo de emails"
npm run server

npm.cmd run check
npm.cmd run build
npm.cmd install
npm.cmd run dev

http://localhost:3000/
```

Depois abra o Vite:

```txt
http://127.0.0.1:5173
```

## Estrutura

```txt
backend/          servidor Node e integração com Supabase
database/         SQLs principais do Supabase
src/              frontend React + TypeScript
index.html        entrada do Vite
vite.config.ts    configuração do Vite e proxy da API
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

Para enviar disparos prontos ao Google Calendar via n8n, adicione também:

```txt
N8N_CALENDAR_WEBHOOK_URL=https://seu-n8n/webhook/google-calendar-disparos
```

O backend espera que estas tabelas ja existam:

- `base_rules`
- `dispatches`
- `campaign_options`
- `audience_options`
- `responsible_options`

Arquivos úteis do banco:

- `database/schema.sql`: schema completo para criar/atualizar as tabelas.
- `database/fix-common-errors.sql`: correção geral de colunas, permissões, RLS e views.
- `database/cleanup-test-data.sql`: limpeza conservadora de testes e cadastros vazios.

## Banco

O app usa somente Supabase como banco. Se as variáveis do Supabase não estiverem configuradas, a API retorna erro de configuração.

## Fluxo recomendado

1. Execute `database/schema.sql` inteiro no SQL Editor do Supabase.
2. Se o banco já existia antes das últimas alterações, execute `database/fix-common-errors.sql`.
3. Abra a aba `Cadastros` e cadastre campanhas, públicos e responsáveis.
4. Cadastre as regras de bases.
5. Cadastre os disparos usando os selects.
6. Use `Recarregar` para puxar novamente os dados do Supabase quando alterar algo direto no banco.

## Producao

Para usar fora da máquina local, hospede o backend Node em um servidor com variáveis de ambiente seguras e publique o frontend com `npm run build`. Em produção, prefira usar `SUPABASE_SERVICE_ROLE_KEY` apenas no backend, nunca no navegador.

## Rotas do backend

- `GET /api/state` lista disparos e regras de base.
- `PUT /api/state` salva disparos, regras de base e cadastros.
- `POST /api/integrations/n8n/calendar` envia ao webhook do n8n um disparo informado por `dispatchId`. Use `action: "upsert"` para criar/atualizar no Google Calendar e `action: "delete"` para remover.

## n8n + Google Calendar

Na aba `Calendário`, abra um dia, clique em `Ver completo` no disparo desejado e use o botão `Sincronizar Google Calendar`. O backend envia para o webhook do n8n um payload com:

- `action`: `upsert` ou `delete`.
- `dispatchId`: ID do disparo no app.
- `calendarEventId`: ID fixo que deve ser usado no Google Calendar para evitar duplicidade.
- `count`: sempre `1`.
- `event`: evento pronto para mapear no nó Google Calendar.
- `events`: lista com o mesmo evento, para facilitar workflows que iteram arrays.

No n8n, crie um workflow com:

1. Nó `Webhook` usando a URL configurada em `N8N_CALENDAR_WEBHOOK_URL`.
2. Nó `Google Calendar` para criar o evento usando `body.event.summary`, `body.event.description`, `body.event.start.dateTime` e `body.event.end.dateTime`.
