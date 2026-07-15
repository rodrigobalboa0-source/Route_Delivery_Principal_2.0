#!/bin/bash
# ─────────────────────────────────────────────────────────────
# 2-setup-server.sh
# Execute como root no servidor novo para instalar Docker
# e preparar o ambiente Supabase self-hosted
# ─────────────────────────────────────────────────────────────
set -euo pipefail

echo "=== Setup Servidor — RouteDelivery ==="

# ── Instalar Docker ──────────────────────────────────────────
if ! command -v docker &> /dev/null; then
  echo "[1/5] Instalando Docker..."
  curl -fsSL https://get.docker.com | sh
  systemctl enable docker
  systemctl start docker
  # Adiciona usuário atual ao grupo docker (evita sudo)
  usermod -aG docker "$USER" || true
else
  echo "[1/5] Docker já instalado: $(docker --version)"
fi

# ── Instalar Docker Compose ──────────────────────────────────
if ! docker compose version &> /dev/null 2>&1; then
  echo "[2/5] Instalando Docker Compose plugin..."
  apt-get update -qq
  apt-get install -y docker-compose-plugin
else
  echo "[2/5] Docker Compose já instalado: $(docker compose version)"
fi

# ── Instalar utilitários ─────────────────────────────────────
echo "[3/5] Instalando postgresql-client, curl, python3..."
apt-get update -qq
apt-get install -y postgresql-client curl python3 jq openssl

# ── Criar estrutura de diretórios ───────────────────────────
echo "[4/5] Criando estrutura /opt/routedelivery..."
mkdir -p /opt/routedelivery/{infra,backup}
mkdir -p /opt/routedelivery/infra/volumes/{api,db/init,functions}
mkdir -p /opt/routedelivery/infra/volumes/storage

# ── Gerar segredos ───────────────────────────────────────────
echo "[5/5] Gerando segredos iniciais..."
POSTGRES_PASSWORD=$(openssl rand -base64 32 | tr -d '/+=' | head -c 32)
JWT_SECRET=$(openssl rand -base64 64 | tr -d '/+=' | head -c 64)
REALTIME_KEY=$(openssl rand -base64 64 | tr -d '/+=' | head -c 64)
DASHBOARD_PASSWORD=$(openssl rand -base64 16 | tr -d '/+=' | head -c 16)

# Gerar ANON_KEY e SERVICE_ROLE_KEY usando JWT_SECRET
ANON_KEY=$(python3 -c "
import hmac, hashlib, base64, json, time

secret = b'${JWT_SECRET}'
header = base64.urlsafe_b64encode(json.dumps({'alg':'HS256','typ':'JWT'}).encode()).rstrip(b'=').decode()
payload = base64.urlsafe_b64encode(json.dumps({'role':'anon','iss':'supabase','iat':int(time.time()),'exp':int(time.time())+315360000}).encode()).rstrip(b'=').decode()
msg = f'{header}.{payload}'.encode()
sig = base64.urlsafe_b64encode(hmac.new(secret, msg, hashlib.sha256).digest()).rstrip(b'=').decode()
print(f'{header}.{payload}.{sig}')
")

SERVICE_ROLE_KEY=$(python3 -c "
import hmac, hashlib, base64, json, time

secret = b'${JWT_SECRET}'
header = base64.urlsafe_b64encode(json.dumps({'alg':'HS256','typ':'JWT'}).encode()).rstrip(b'=').decode()
payload = base64.urlsafe_b64encode(json.dumps({'role':'service_role','iss':'supabase','iat':int(time.time()),'exp':int(time.time())+315360000}).encode()).rstrip(b'=').decode()
msg = f'{header}.{payload}'.encode()
sig = base64.urlsafe_b64encode(hmac.new(secret, msg, hashlib.sha256).digest()).rstrip(b'=').decode()
print(f'{header}.{payload}.{sig}')
")

# Escrever .env
cat > /opt/routedelivery/infra/.env <<EOF
POSTGRES_HOST=db
POSTGRES_DB=postgres
POSTGRES_PORT=5432
POSTGRES_PASSWORD=${POSTGRES_PASSWORD}

JWT_SECRET=${JWT_SECRET}
JWT_EXPIRY=3600
ANON_KEY=${ANON_KEY}
SERVICE_ROLE_KEY=${SERVICE_ROLE_KEY}

SITE_URL=http://$(curl -s ifconfig.me)
API_EXTERNAL_URL=http://$(curl -s ifconfig.me):8000
SUPABASE_PUBLIC_URL=http://$(curl -s ifconfig.me):8000
ADDITIONAL_REDIRECT_URLS=

KONG_HTTP_PORT=8000
KONG_HTTPS_PORT=8443
STUDIO_PORT=3000

DASHBOARD_USERNAME=supabase
DASHBOARD_PASSWORD=${DASHBOARD_PASSWORD}

SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=routedeelivery@gmail.com
SMTP_PASS=PREENCHA_SENHA_APP_GMAIL
SMTP_ADMIN_EMAIL=routedeelivery@gmail.com
ENABLE_EMAIL_AUTOCONFIRM=true
ENABLE_EMAIL_SIGNUP=true
ENABLE_ANONYMOUS_USERS=false
DISABLE_SIGNUP=false

REALTIME_SECRET_KEY_BASE=${REALTIME_KEY}

IMGPROXY_ENABLE_WEBP_DETECTION=true
STUDIO_DEFAULT_ORGANIZATION=RouteDelivery
STUDIO_DEFAULT_PROJECT=RouteDelivery
LOGFLARE_API_KEY=
EOF

echo ""
echo "=== SETUP CONCLUÍDO ==="
echo ""
echo "  Postgres Password : ${POSTGRES_PASSWORD}"
echo "  Dashboard Password: ${DASHBOARD_PASSWORD}"
echo "  JWT Secret        : ${JWT_SECRET}"
echo ""
echo "Arquivo .env criado em /opt/routedelivery/infra/.env"
echo "GUARDE essas senhas em local seguro!"
echo ""
echo "Próximo passo: execute 3-restore.sh"
