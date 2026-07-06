#!/bin/bash
# ─────────────────────────────────────────────────────────────
# 1-backup-cloud.sh
# Execute este script NO SERVIDOR NOVO (tem IPv6/conectividade)
# Faz o dump completo do Supabase Cloud → arquivos locais
# ─────────────────────────────────────────────────────────────
set -euo pipefail

CLOUD_DB_HOST="db.mtanrihprbgrrtgwcyia.supabase.co"
CLOUD_DB_PORT="5432"
CLOUD_DB_USER="postgres"
CLOUD_DB_PASS="jYYVcBINpMbH3Kci"
CLOUD_DB_NAME="postgres"
CLOUD_DSN="postgresql://${CLOUD_DB_USER}:${CLOUD_DB_PASS}@${CLOUD_DB_HOST}:${CLOUD_DB_PORT}/${CLOUD_DB_NAME}?sslmode=require"

SUPABASE_URL="https://mtanrihprbgrrtgwcyia.supabase.co"
SERVICE_ROLE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im10YW5yaWhwcmJncnJ0Z3djeWlhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MzAzNTY5MiwiZXhwIjoyMDc4NjExNjkyfQ.zEz6fE9fL3NE6I3fJL3bS20ySVnfV1goNMu-Crt9u8M"

BACKUP_DIR="./backup_$(date +%Y%m%d_%H%M%S)"
mkdir -p "$BACKUP_DIR"

echo "=== RouteDelivery — Backup Supabase Cloud ==="
echo "Destino: $BACKUP_DIR"
echo ""

# ── 1. Dump schema + dados do schema public ──────────────────
echo "[1/4] Dump schema public..."
PGPASSWORD="$CLOUD_DB_PASS" pg_dump \
  --host="$CLOUD_DB_HOST" \
  --port="$CLOUD_DB_PORT" \
  --username="$CLOUD_DB_USER" \
  --dbname="$CLOUD_DB_NAME" \
  --no-password \
  --format=custom \
  --no-acl \
  --no-owner \
  --schema=public \
  --file="$BACKUP_DIR/public_schema.dump"
echo "   OK: $BACKUP_DIR/public_schema.dump"

# ── 2. Dump schema storage (metadados dos arquivos) ──────────
echo "[2/4] Dump schema storage (metadados)..."
PGPASSWORD="$CLOUD_DB_PASS" pg_dump \
  --host="$CLOUD_DB_HOST" \
  --port="$CLOUD_DB_PORT" \
  --username="$CLOUD_DB_USER" \
  --dbname="$CLOUD_DB_NAME" \
  --no-password \
  --format=custom \
  --no-acl \
  --no-owner \
  --schema=storage \
  --file="$BACKUP_DIR/storage_schema.dump"
echo "   OK: $BACKUP_DIR/storage_schema.dump"

# ── 3. Export auth.users via Admin API ───────────────────────
echo "[3/4] Exportando auth.users via API..."
PAGE=1
PAGE_SIZE=1000
AUTH_FILE="$BACKUP_DIR/auth_users.json"
echo "[]" > "$AUTH_FILE"

while true; do
  RESPONSE=$(curl -s \
    "${SUPABASE_URL}/auth/v1/admin/users?page=${PAGE}&per_page=${PAGE_SIZE}" \
    -H "Authorization: Bearer ${SERVICE_ROLE_KEY}" \
    -H "apikey: ${SERVICE_ROLE_KEY}")

  COUNT=$(echo "$RESPONSE" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d.get('users', d if isinstance(d, list) else [])))" 2>/dev/null || echo 0)

  if [ "$COUNT" = "0" ]; then
    break
  fi

  # Merge com arquivo existente
  python3 -c "
import sys, json
existing = json.load(open('$AUTH_FILE'))
new_data = json.loads(sys.stdin.read())
users = new_data.get('users', new_data if isinstance(new_data, list) else [])
existing.extend(users)
json.dump(existing, open('$AUTH_FILE', 'w'), indent=2)
" <<< "$RESPONSE"

  echo "   Página $PAGE: $COUNT usuários"
  PAGE=$((PAGE + 1))

  if [ "$COUNT" -lt "$PAGE_SIZE" ]; then
    break
  fi
done

TOTAL=$(python3 -c "import json; print(len(json.load(open('$AUTH_FILE'))))")
echo "   OK: $TOTAL usuários em $AUTH_FILE"

# ── 4. Download arquivos do Storage ──────────────────────────
echo "[4/4] Baixando arquivos do Storage..."
STORAGE_DIR="$BACKUP_DIR/storage_files"
mkdir -p "$STORAGE_DIR"

# Lista todos os buckets
BUCKETS=$(curl -s \
  "${SUPABASE_URL}/storage/v1/bucket" \
  -H "Authorization: Bearer ${SERVICE_ROLE_KEY}" \
  -H "apikey: ${SERVICE_ROLE_KEY}" | python3 -c "import sys,json; [print(b['name']) for b in json.load(sys.stdin)]" 2>/dev/null)

for BUCKET in $BUCKETS; do
  echo "   Bucket: $BUCKET"
  mkdir -p "$STORAGE_DIR/$BUCKET"

  # Lista arquivos do bucket (com paginação)
  OFFSET=0
  LIMIT=100
  while true; do
    FILES=$(curl -s \
      "${SUPABASE_URL}/storage/v1/object/list/${BUCKET}" \
      -X POST \
      -H "Authorization: Bearer ${SERVICE_ROLE_KEY}" \
      -H "apikey: ${SERVICE_ROLE_KEY}" \
      -H "Content-Type: application/json" \
      -d "{\"prefix\":\"\",\"limit\":${LIMIT},\"offset\":${OFFSET}}" \
      | python3 -c "import sys,json; [print(f['name']) for f in json.load(sys.stdin) if not f.get('id') is None]" 2>/dev/null)

    COUNT=0
    for FILE in $FILES; do
      COUNT=$((COUNT + 1))
      FILE_DIR="$STORAGE_DIR/$BUCKET/$(dirname "$FILE")"
      mkdir -p "$FILE_DIR"
      curl -s \
        "${SUPABASE_URL}/storage/v1/object/${BUCKET}/${FILE}" \
        -H "Authorization: Bearer ${SERVICE_ROLE_KEY}" \
        -H "apikey: ${SERVICE_ROLE_KEY}" \
        --output "$STORAGE_DIR/$BUCKET/$FILE"
    done

    echo "     offset=$OFFSET: $COUNT arquivos"
    if [ "$COUNT" -lt "$LIMIT" ]; then
      break
    fi
    OFFSET=$((OFFSET + LIMIT))
  done
done
echo "   OK: arquivos em $STORAGE_DIR/"

echo ""
echo "=== BACKUP CONCLUÍDO: $BACKUP_DIR ==="
ls -lh "$BACKUP_DIR/"
