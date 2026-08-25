# RouteDelivery — Migração Supabase Cloud → Self-Hosted

## Visão Geral

```
Supabase Cloud (atual)
  └─ mtanrihprbgrrtgwcyia.supabase.co
        │
        ▼ backup + migração
Servidor Novo (Docker)
  ├─ PostgreSQL 15
  ├─ PostgREST (API REST)
  ├─ GoTrue (Auth)
  ├─ Realtime (WebSockets)
  ├─ Storage API + arquivos
  ├─ Kong (API Gateway) → porta 8000
  ├─ Studio (Dashboard) → porta 3000
  └─ Edge Functions (Deno)
```

## Pré-requisitos no Servidor Novo

- Ubuntu 22.04 ou Debian 12
- Mínimo 4 GB RAM, 40 GB disco
- IPv6 habilitado (necessário para conectar ao Supabase Cloud durante o backup)
- Portas abertas: 8000, 8443, 3000 (e 5432 se quiser acesso externo ao Postgres)

---

## Passo a Passo

### 1. No servidor novo: instalar dependências e gerar segredos

```bash
chmod +x scripts/2-setup-server.sh
sudo ./scripts/2-setup-server.sh
```

> Salve as senhas exibidas ao final!

### 2. No servidor novo: fazer backup do Supabase Cloud

```bash
chmod +x scripts/1-backup-cloud.sh
./scripts/1-backup-cloud.sh
# Gera pasta: backup_YYYYMMDD_HHMMSS/
```

### 3. Copiar docker-compose e volumes para o servidor

```bash
# Na sua máquina local:
scp -r infra/ usuario@servidor:/opt/routedelivery/
```

### 4. Configurar kong.yml (gateway de rotas)

Copie o arquivo `volumes/api/kong.yml` do repositório oficial do Supabase:
```bash
curl -o /opt/routedelivery/infra/volumes/api/kong.yml \
  https://raw.githubusercontent.com/supabase/supabase/master/docker/volumes/api/kong.yml
```

### 5. Subir os containers

```bash
cd /opt/routedelivery/infra
cp .env.example .env
# Edite o .env com as senhas geradas pelo script 2
docker compose up -d
docker compose ps   # verifique se todos estão healthy
```

### 6. Restaurar o banco de dados e storage

```bash
chmod +x scripts/3-restore.sh
./scripts/3-restore.sh ./backup_YYYYMMDD_HHMMSS
```

### 7. Deploy das Edge Functions

```bash
# No servidor (com o código do projeto):
chmod +x scripts/4-deploy-functions.sh
./scripts/4-deploy-functions.sh
```

### 8. Atualizar o .env do projeto React

```
VITE_SUPABASE_URL=http://SEU_IP:8000
VITE_SUPABASE_ANON_KEY=<ANON_KEY do novo servidor>
VITE_GOOGLE_MAPS_API_KEY=SUA_CHAVE_GOOGLE_MAPS
VITE_GOOGLE_MAPS_MAP_ID=SEU_MAP_ID
```

### 9. Build e deploy do frontend

```bash
npm run build
# Copie a pasta dist/ para o servidor web (nginx, etc.)
```

---

## Componentes incluídos no backup

| O que | Como |
|---|---|
| Schema + dados `public` | `pg_dump` formato custom |
| Metadados `storage` | `pg_dump` formato custom |
| Usuários `auth.users` | Supabase Admin API → JSON |
| Arquivos do Storage | Download via Storage API |
| Edge Functions | Código local em `supabase/functions/` |
| Migrations | SQL em `supabase/migrations/` |

---

## Verificação pós-migração

```bash
# Testar API
curl http://SEU_IP:8000/rest/v1/ -H "apikey: SEU_ANON_KEY"

# Testar Auth
curl http://SEU_IP:8000/auth/v1/health

# Testar Storage
curl http://SEU_IP:8000/storage/v1/status -H "apikey: SEU_ANON_KEY"

# Studio
http://SEU_IP:3000
```
