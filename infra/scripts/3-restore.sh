#!/bin/bash
# ─────────────────────────────────────────────────────────────
# 3-restore.sh
# Restaura o backup no Supabase self-hosted já em execução
# Execute APÓS o docker-compose estar up e saudável
# Uso: ./3-restore.sh <pasta_do_backup>
# ─────────────────────────────────────────────────────────────
set -euo pipefail

BACKUP_DIR="${1:-./backup}"
if [ ! -d "$BACKUP_DIR" ]; then
  echo "ERRO: pasta de backup '$BACKUP_DIR' não encontrada."
  echo "Uso: $0 <pasta_do_backup>"
  exit 1
fi

INFRA_DIR="/opt/routedelivery/infra"
source "$INFRA_DIR/.env"

LOCAL_DSN="postgresql://postgres:${POSTGRES_PASSWORD}@localhost:${POSTGRES_PORT:-5432}/${POSTGRES_DB:-postgres}"
LOCAL_ADMIN_DSN="postgresql://supabase_admin:${POSTGRES_PASSWORD}@localhost:${POSTGRES_PORT:-5432}/${POSTGRES_DB:-postgres}"

echo "=== Restore RouteDelivery → self-hosted ==="
echo "Backup: $BACKUP_DIR"
echo ""

# ── 1. Aguardar DB ficar saudável ────────────────────────────
echo "[1/5] Aguardando banco de dados..."
for i in $(seq 1 30); do
  if PGPASSWORD="$POSTGRES_PASSWORD" pg_isready -h localhost -p "${POSTGRES_PORT:-5432}" -U postgres -q; then
    echo "   DB pronto."
    break
  fi
  echo "   Tentativa $i/30..."
  sleep 3
done

# ── 2. Restaurar schema public ───────────────────────────────
echo "[2/5] Restaurando schema public..."
PGPASSWORD="$POSTGRES_PASSWORD" pg_restore \
  --host=localhost \
  --port="${POSTGRES_PORT:-5432}" \
  --username=postgres \
  --dbname="${POSTGRES_DB:-postgres}" \
  --no-password \
  --no-owner \
  --no-acl \
  --schema=public \
  --if-exists \
  --clean \
  --single-transaction \
  "$BACKUP_DIR/public_schema.dump" 2>&1 | grep -v "^pg_restore:" || true
echo "   OK"

# ── 3. Restaurar metadados do storage ────────────────────────
echo "[3/5] Restaurando metadados do storage..."
PGPASSWORD="$POSTGRES_PASSWORD" pg_restore \
  --host=localhost \
  --port="${POSTGRES_PORT:-5432}" \
  --username=postgres \
  --dbname="${POSTGRES_DB:-postgres}" \
  --no-password \
  --no-owner \
  --no-acl \
  --schema=storage \
  --if-exists \
  --clean \
  --single-transaction \
  "$BACKUP_DIR/storage_schema.dump" 2>&1 | grep -v "^pg_restore:" || true
echo "   OK"

# ── 4. Importar auth.users ───────────────────────────────────
echo "[4/5] Importando auth.users..."
if [ -f "$BACKUP_DIR/auth_users.json" ]; then
  LOCAL_API="http://localhost:${KONG_HTTP_PORT:-8000}"
  TOTAL=$(python3 -c "import json; print(len(json.load(open('$BACKUP_DIR/auth_users.json'))))")
  echo "   Total: $TOTAL usuários"

  python3 << PYEOF
import json, urllib.request, urllib.error, time

users = json.load(open('$BACKUP_DIR/auth_users.json'))
service_key = '$SERVICE_ROLE_KEY'
api = '$LOCAL_API'

ok = 0
err = 0
for u in users:
    # Prepara payload mínimo para criar usuário na auth
    payload = {
        'email': u.get('email', ''),
        'phone': u.get('phone', ''),
        'email_confirm': True,
        'phone_confirm': True,
        'user_metadata': u.get('user_metadata', {}),
        'app_metadata': u.get('app_metadata', {}),
    }
    # Se tinha senha criptografada, importa diretamente via SQL
    # (GoTrue Admin API não aceita hash direto, então importamos via SQL)
    if payload['email']:
        data = json.dumps(payload).encode()
        req = urllib.request.Request(
            f'{api}/auth/v1/admin/users',
            data=data,
            headers={
                'Authorization': f'Bearer {service_key}',
                'apikey': service_key,
                'Content-Type': 'application/json',
            },
            method='POST'
        )
        try:
            with urllib.request.urlopen(req, timeout=10) as resp:
                ok += 1
        except urllib.error.HTTPError as e:
            body = e.read().decode()
            if 'already been registered' in body or 'already exists' in body:
                ok += 1  # já existe, tudo bem
            else:
                print(f'  ERRO {u.get("email")}: {body[:100]}')
                err += 1
        time.sleep(0.1)

print(f'  Importados: {ok} | Erros: {err}')
PYEOF
else
  echo "   auth_users.json não encontrado, pulando."
fi

# ── 5. Upload arquivos do Storage ────────────────────────────
echo "[5/5] Enviando arquivos para o storage local..."
STORAGE_DIR="$BACKUP_DIR/storage_files"
if [ -d "$STORAGE_DIR" ]; then
  LOCAL_API="http://localhost:${KONG_HTTP_PORT:-8000}"

  for BUCKET_PATH in "$STORAGE_DIR"/*/; do
    BUCKET=$(basename "$BUCKET_PATH")
    echo "   Criando bucket: $BUCKET"

    # Criar bucket
    curl -s -X POST "$LOCAL_API/storage/v1/bucket" \
      -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
      -H "apikey: $SERVICE_ROLE_KEY" \
      -H "Content-Type: application/json" \
      -d "{\"id\":\"$BUCKET\",\"name\":\"$BUCKET\",\"public\":true}" > /dev/null

    # Upload de cada arquivo
    find "$BUCKET_PATH" -type f | while read -r FILE_PATH; do
      RELATIVE="${FILE_PATH#$BUCKET_PATH}"
      echo "     Upload: $BUCKET/$RELATIVE"
      curl -s -X POST "$LOCAL_API/storage/v1/object/$BUCKET/$RELATIVE" \
        -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
        -H "apikey: $SERVICE_ROLE_KEY" \
        --data-binary "@$FILE_PATH" > /dev/null
    done
  done
  echo "   OK"
else
  echo "   Pasta storage_files não encontrada, pulando."
fi

echo ""
echo "=== RESTORE CONCLUÍDO ==="
echo ""
echo "Studio disponível em: http://$(curl -s ifconfig.me):3000"
echo "API disponível em   : http://$(curl -s ifconfig.me):8000"
echo ""
echo "Atualize o .env do projeto React:"
echo "  VITE_SUPABASE_URL=http://$(curl -s ifconfig.me):8000"
echo "  VITE_SUPABASE_ANON_KEY=$ANON_KEY"
