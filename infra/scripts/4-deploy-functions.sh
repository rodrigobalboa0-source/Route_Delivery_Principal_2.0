#!/bin/bash
# ─────────────────────────────────────────────────────────────
# 4-deploy-functions.sh
# Copia as Edge Functions para o volume e reinicia o container
# Execute do diretório raiz do projeto RouteDelivery
# ─────────────────────────────────────────────────────────────
set -euo pipefail

FUNCTIONS_SRC="./supabase/functions"
FUNCTIONS_DEST="/opt/routedelivery/infra/volumes/functions"

echo "=== Deploy Edge Functions ==="

if [ ! -d "$FUNCTIONS_SRC" ]; then
  echo "ERRO: pasta $FUNCTIONS_SRC não encontrada. Execute da raiz do projeto."
  exit 1
fi

echo "Copiando functions para $FUNCTIONS_DEST..."
cp -r "$FUNCTIONS_SRC/"* "$FUNCTIONS_DEST/"

# Criar função main (roteador) se não existir
if [ ! -f "$FUNCTIONS_DEST/main/index.ts" ]; then
  mkdir -p "$FUNCTIONS_DEST/main"
  cat > "$FUNCTIONS_DEST/main/index.ts" << 'EOF'
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const functions: Record<string, string> = {
  "cardapioweb-webhook": "/home/deno/functions/cardapioweb-webhook/index.ts",
  "delete-auth-user-by-email": "/home/deno/functions/delete-auth-user-by-email/index.ts",
  "geocode": "/home/deno/functions/geocode/index.ts",
  "ifood-auth": "/home/deno/functions/ifood-auth/index.ts",
  "ifood-merchant": "/home/deno/functions/ifood-merchant/index.ts",
  "ifood-sync": "/home/deno/functions/ifood-sync/index.ts",
  "ifood-update-status": "/home/deno/functions/ifood-update-status/index.ts",
  "push-notification": "/home/deno/functions/push-notification/index.ts",
  "ze-sync": "/home/deno/functions/ze-sync/index.ts",
}

serve(async (req) => {
  const url = new URL(req.url)
  const parts = url.pathname.split("/").filter(Boolean)
  // /functions/v1/<name>
  const name = parts[parts.length - 1]

  if (functions[name]) {
    const mod = await import(functions[name])
    return mod.default(req)
  }

  return new Response(JSON.stringify({ error: "Function not found", name }), {
    status: 404,
    headers: { "Content-Type": "application/json" },
  })
})
EOF
fi

echo "Reiniciando edge-functions container..."
docker restart supabase-edge-functions 2>/dev/null || \
  (cd /opt/routedelivery/infra && docker compose restart edge-functions)

echo ""
echo "=== Functions deployadas ==="
ls "$FUNCTIONS_DEST/"
