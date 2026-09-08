# RouteDelivery — Runbook de Segurança

Acompanha o relatório de pentest de 2026-09-07. Aqui está: (1) o que já foi
corrigido no código deste commit, (2) o que **você** precisa executar no servidor
(rotação de segredos, firewall, limpeza de histórico), e (3) o que ficou como
trabalho pendente com instruções.

> Nenhuma correção deste commit exige rebuild imediato para "não quebrar" — mas
> as migrations `20260907*` **precisam ser aplicadas** e alguns fluxos mudam de
> comportamento (ver "Testar depois de aplicar").

---

## 1. Já corrigido neste commit

| Item | Arquivo(s) | O que mudou |
|---|---|---|
| **C1** escalada via RLS de `users` | `migrations/20260907120000_*` | RLS reescrita: SELECT/UPDATE só da própria linha ou admin; trigger `users_enforce_privileges` bloqueia auto-promoção a operador/admin e vínculo a tenant alheio |
| **C2** `admin_update_password` sem auth | `migrations/20260907120100_*` | exige `is_admin()`; senha ≥10; overload de 2 args removida |
| **C3** `cadastrar_conta_gerencial` sem auth | `migrations/20260907120200_*` | exige `is_admin()` (ou service key, ou bootstrap quando ainda não há admin) |
| **A3** RPCs `SECURITY DEFINER` abertas | `migrations/20260907120300_*` | `delete_user_by_email_case_insensitive` e `get_cliente_public_info` trancadas; default privilege revoga EXECUTE de PUBLIC em funções novas |
| **A4** auto-aprovação de entregador | `migrations/20260907120400_*` | `cadastrar_entregador_v2` força `status='em_analise'` para não-admin |
| **A5** upload anônimo no Storage | `migrations/20260907120500_*` | policy "Anon Upload" removida |
| **A6** `grant all ... to anon` em config | `migrations/20260907120600_*` | revoga escrita de anon; leitura de `usuarios_permissoes` só autenticado |
| **A7** tabelas de preço editáveis por qualquer autenticado | `migrations/20260907120700_*` | escrita só `is_admin()` em `modais`, `precificacoes`, `preco_espera`, `preco_dinamico_*`, `servicos_opcionais`, `tabelas_precos(_faixas)`, `tabelas_comissoes(_faixas)`. `comissoes_entregadores` / `revisoes_agendamentos` ficaram de fora (têm policy de tenant) — ver A7 na secção 3 |
| **C4** (parcial) `delete-auth-user-by-email` sem auth | `functions/delete-auth-user-by-email/index.ts` + `functions/_shared/auth.ts` + `EntregadoresPanel.tsx` | função exige admin autenticado; caller passou a mandar o JWT da sessão |
| **C4** (parcial) `emitir_nota` sem auth | `functions/emitir_nota/index.ts` | exige usuário autenticado |
| **C4** `cardapioweb-webhook` sem validação de origem | `functions/cardapioweb-webhook/index.ts` + `_shared/auth.ts` + `CardapioWebPanel.tsx` | valida `X-Webhook-Token` contra `merchant_secret` (tempo constante); URL do webhook no painel deixou de apontar pro Supabase Cloud antigo; para de logar o payload inteiro |
| **A1** XML injection em `emitir_nota` | `functions/emitir_nota/index.ts` | `xmlEscape()` em tudo que entra no XML |
| **C4** (broad) rotas de function sem credencial | `infra/volumes/api/kong.yml.example` | `key-auth` + `acl` nas rotas chamadas pelo app; cron/trigger passam a mandar header `apikey` (migrations `20251230100000` / `20260129110000`) |
| **A2** Postgres exposto | `infra/docker-compose.yml` | bind `127.0.0.1:5432` |
| **C7** SQLAdmin: defaults inseguros / auth fraca / path traversal | `infra/sqladmin/main.py` + `docker-compose.yml` + `infra/.env.example` | sem fallback `admin/admin`; `SECRET_KEY`≠`JWT_SECRET`; `hmac.compare_digest`; lockout 5/15min; cookie `SameSite=strict` + `https_only`; normalização de path no Storage; porta 4000 despublicada |
| **A8** imgproxy root=`/` | `infra/docker-compose.yml` | `IMGPROXY_LOCAL_FILESYSTEM_ROOT=/var/lib/storage` |
| **C6** histórico | `.gitea/workflows/devity-checks.yml` | passo gitleaks varrendo `--all` (informativo até a limpeza) |

### Testar depois de aplicar as migrations

1. **Login** de admin, comércio e entregador — todos continuam entrando.
2. Admin no painel "Dados de Acesso": consegue listar usuários e trocar `role`.
3. Admin em Clientes/Entregadores: "Salvar" com **nova senha** funciona
   (`admin_update_password`).
4. Auto-cadastro de entregador (`/cadastro#entregador`): cria a conta e ela
   entra como **"em análise"** (não "ativo").
5. Auto-cadastro de comércio (`/cadastro#comercio`): cria e loga como cliente.
6. Deletar um entregador no painel: remove do Auth sem erro no console.
7. Emissão de nota fiscal pelo painel financeiro: funciona.
8. Rodar a auditoria que a migration C1 imprime (procure `AUDITORIA C1` nos
   logs) e rebaixar manualmente qualquer conta privilegiada que você não
   reconheça: `update public.users set role='cliente' where id='<uuid>';`

> Criar uma **nova** conta de operador depois disso: pelo painel, logado como um
> admin existente. Se precisar recriar a primeira (nenhum admin no banco), rode
> `cadastrar_conta_gerencial` via SQL editor / service key — a validação libera
> esses dois casos.

Depois de aplicar o `kong.yml` novo, testar as integrações: iFood (status,
merchant), Zé Delivery, geocode. Se alguma retornar 401, o caller não está
mandando o header `apikey` — ver secção C4 abaixo.

---

## 2. Ações no servidor (só você pode fazer)

> **Enquanto a C6 não for feita:** as correções de código (RLS, RPCs, Kong,
> functions) fecham as escaladas via app, mas **um `SERVICE_ROLE_KEY` / `JWT_SECRET`
> vazado no histórico ignora tudo isso** — quem tiver essas chaves fala direto
> com o banco como `service_role`. A C6 continua sendo a prioridade nº 1; o resto
> desta secção pode esperar alguns dias sem aumentar o risco.

### C6 — Rotação de credenciais + limpeza de histórico  **[CRÍTICO, fazer primeiro]**

Os segredos abaixo estão recuperáveis no histórico do Git (`git show <commit>^:.env`,
`kong.yml` antigo). Trate **todos** como vazados.

**2.1. Gerar novos segredos** (no servidor, dentro de `infra/`):

```bash
openssl rand -base64 32   # novo JWT_SECRET
openssl rand -base64 32   # novo POSTGRES_PASSWORD
openssl rand -base64 24   # novo DASHBOARD_PASSWORD
openssl rand -base64 24   # novo SQLADMIN_ADMIN_PASS
openssl rand -hex 32      # novo SQLADMIN_SECRET_KEY
openssl rand -base64 64   # novo REALTIME_SECRET_KEY_BASE
openssl rand -hex 32      # IMGPROXY_KEY
openssl rand -hex 32      # IMGPROXY_SALT
```

**2.2.** Regerar `ANON_KEY` e `SERVICE_ROLE_KEY` a partir do novo `JWT_SECRET`
(script `scripts/generate-keys.sh` ou o gerador da doc do Supabase self-hosting).

**2.3.** Atualizar `infra/.env` com tudo isso, e o `.env` do app React
(`VITE_SUPABASE_ANON_KEY` novo). Rotacionar também: senha de app do Gmail
(`SMTP_PASS`), `FIREBASE_SERVICE_ACCOUNT` (gerar nova chave no console Firebase e
revogar a antiga), chave da API do Google Maps, credenciais iFood/CardápioWeb.

**2.4.** Subir tudo: `docker compose down && docker compose up -d`.
Trocar o `JWT_SECRET` **desloga todo mundo** (esperado). Tokens forjados com o
segredo antigo param de valer.

**2.5. Limpar o histórico do Git** (depois que tudo estiver rodando com as
chaves novas — se falhar antes, você ainda tem as chaves antigas para reverter):

```bash
# instalar git-filter-repo (pip install git-filter-repo)
git filter-repo --path .env --path infra/volumes/api/kong.yml --invert-paths
git filter-repo --path infra/.env --invert-paths   # se existiu com esse nome
# reconferir:
gitleaks detect --source . --log-opts="--all" -v
git push --force --all && git push --force --tags
```

Todo mundo que tem clone precisa re-clonar. Depois, no
`.gitea/workflows/devity-checks.yml`, tirar o `|| true` do passo
"Gitleaks (histórico completo)".

### A2 — Firewall / superfície de rede

No servidor `76.13.239.235`, com `ufw` (ou o firewall do provedor), **permitir
só**: 22 (SSH, idealmente restrito ao seu IP), 80, 443. **Bloquear tudo o
resto**, em especial:

- **8000 / 8443 (Kong)** — o app acessa a API por `https://routedeelivery.com/rest/...`
  via Nginx; a porta direta do Kong não precisa ficar aberta. Confirme que
  `VITE_SUPABASE_URL` aponta para `https://routedeelivery.com` (e **não** para
  `:8000`). Se estiver ok, no `docker-compose.yml` troque as portas do `kong`
  para `127.0.0.1:8000:8000` / `127.0.0.1:8443:8443`.
- **4000** — já despublicada neste commit.
- **5432** — já em `127.0.0.1` neste commit.

```bash
ufw default deny incoming
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw enable
ss -tlnp        # conferir o que ficou escutando em 0.0.0.0
```

### Studio do Supabase

A rota catch-all `/` do Kong serve o Studio, protegida só por basic-auth. Depois
de fechar a porta 8000 ela deixa de ser acessível de fora. Se quiser manter
acesso, faça por túnel SSH. Em produção, considere remover o bloco `dashboard`
do `kong.yml`.

---

## 3. Pendências (com instruções)

### C4 — webhooks e chamadas de cron sem identidade forte

- **`cardapioweb-webhook`**: ✅ FEITO neste commit. O CardápioWeb não assina o
  payload — ele manda um token estático no header `X-Webhook-Token`
  (doc: https://docs.cardapioweb.com/webhooks/visao-geral). A função agora
  compara esse header (em tempo constante) contra
  `integracoes_cardapioweb.merchant_secret`, com fallback opcional na env
  `CARDAPIOWEB_WEBHOOK_TOKEN`.
  **Você precisa:** no painel do RouteDelivery (Configurações → Integração
  Cardápio Web), abrir cada integração e preencher o campo **Webhook Token**
  com o mesmo valor configurado no portal do CardápioWeb
  (Configurações → Integrações → API Open Delivery → Webhook). Enquanto o campo
  ficar em branco a função aceita qualquer requisição (só loga um WARN) — é
  compat pra não derrubar o que já roda, mas configure logo.
  Também: a URL do webhook no painel estava fixa no ref do Supabase Cloud
  antigo; passou a usar `VITE_SUPABASE_URL` — confirme que essa env aponta para
  `https://routedeelivery.com`.
- **`push-notification`**: hoje confia no `record` que vem no body. Trocar por:
  (a) header `x-webhook-secret` validado com `requireSharedSecret(req, 'PUSH_WEBHOOK_SECRET')`
  — o trigger `handle_new_delivery_webhook` passa a mandar esse header; e
  (b) **reler** a entrega do banco por `record.id` com service_role, ignorando os
  campos do body.
- **`ifood-sync`**: recebeu `key-auth` no Kong e o cron agora manda `apikey`.
  Se preferir isolar do resto, use um `PUSH_WEBHOOK_SECRET` dedicado igual acima.
- **`ifood-merchant` / `emitir_nota`**: além de exigir login, restringir por
  comércio — dentro da função, checar
  `supa.rpc('user_can_access_cliente', { target_cliente_id: cliente_id })` com o
  token do chamador antes de agir.
- Rever `VERIFY_JWT` nos containers do `docker-compose.yml`: pode voltar a
  `"true"` nas functions que sempre recebem JWT de usuário
  (`ifood-update-status`, `ze-sync`, `ifood-merchant`, `emitir_nota`), deixando
  `"false"` só nos webhooks.

### A7 (resto) — `comissoes_entregadores` e `revisoes_agendamentos`

Essas duas têm policies de tenant (de `20251203130000`) mas também herdaram
policies permissivas antigas (`USING(true)`) de `20251128152000`. Com acesso ao
banco, listar as policies de escrita (`select policyname,cmd,qual from
pg_policies where tablename in ('comissoes_entregadores','revisoes_agendamentos')`)
e remover as que não checam tenant nem admin, deixando só as `*_tenant_*` e uma
`_admin_write` com `is_admin()`.

### A3 — auditar as demais funções `SECURITY DEFINER`

Com acesso ao banco, rodar:

```sql
select p.proname,
       pg_get_function_identity_arguments(p.oid) as args,
       has_function_privilege('anon', p.oid, 'EXECUTE')          as anon_exec,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') as auth_exec,
       (p.proconfig is null or not exists (
          select 1 from unnest(p.proconfig) c where c like 'search_path=%')) as sem_search_path
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.prosecdef
order by anon_exec desc, sem_search_path desc, p.proname;
```

Para cada função com `anon_exec = true` que não seja de cadastro público:
`revoke execute on function public.<nome>(<args>) from public, anon;`
Para cada uma com `sem_search_path = true`: recriar com
`set search_path = ''` e objetos qualificados por schema.
Migrations candidatas listadas no relatório (anexo).

### A5 — Storage: bucket `images` é público

Fotos de CNH / comprovante de residência ficam legíveis por URL (o caminho tem
UUID aleatório, mas ainda assim). Migrar documentos sensíveis para um bucket
privado + `createSignedUrl` no app. Também: limitar `content-type` no upload e
monitorar uso de disco (`FILE_SIZE_LIMIT` é por arquivo, não tem quota total).

### A8 — assinatura de URL do imgproxy

Definir `IMGPROXY_KEY` / `IMGPROXY_SALT` no `.env` e passá-los ao serviço
`imgproxy` no `docker-compose.yml`:

```yaml
      IMGPROXY_KEY: ${IMGPROXY_KEY}
      IMGPROXY_SALT: ${IMGPROXY_SALT}
```

O storage-api do Supabase já assina as URLs de transformação quando essas
variáveis existem.

### C7 — SQLAdmin: endurecimento restante

- **CSRF token** por formulário (o `SameSite=strict` já mitiga bastante, mas
  não é completo): usar `starlette-wtf` ou tokens manuais nos templates
  `templates/*.html`.
- **Editor SQL read-only por padrão**: conectar o editor com um role de banco
  sem privilégio de escrita e exigir confirmação para comandos DML/DDL.
- **Auditoria**: logar toda query executada no editor (quem, quando, o quê).
- **MFA (TOTP)** no login do painel.
- Não fazer `automap` de `auth.*` / `storage.*` no CRUD genérico.

### M-items (relatório)

- **M1** CORS `*` em todas as rotas do Kong → allowlist de origens.
- **M3** functions logam payloads inteiros / e-mails / tokens → reduzir para IDs.
- **M4** sessão do app em `localStorage` → CSP forte; avaliar cookies HttpOnly.
- **M5** certificado fiscal A1 em `config_fiscal` em texto → cifrar em repouso
  com chave fora do banco; nunca retornar em `select *`.

### Higiene

- Fixar versões e gerar `deno.lock` nas Edge Functions (hoje importam de
  `deno.land/std` e `esm.sh` sem lock).
- Postgres `log_min_messages=fatal` (`docker-compose.yml`) esconde tentativas de
  ataque → subir para `warning` e centralizar logs.
- Testes automatizados de RLS (pgTAP ou script que loga como cada papel).
- Limpar arquivos soltos: `check_rules.ts`, `infra/scripts/_tmp_truncate.sql`.

---

## Ordem sugerida

1. **Hoje:** C6 (rotação) → A2 (firewall) → aplicar migrations `20260907*` →
   aplicar `kong.yml` novo → testar (secção 1).
2. **Esta semana:** limpeza de histórico (C6.5) → A3 auditoria → C4 webhooks.
3. **2–4 semanas:** A5, A8, C7 restante, M-items, higiene.
4. Re-rodar o pentest.
