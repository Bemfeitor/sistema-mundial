#!/usr/bin/env bash
# Deploy do Sistema Ótica Mundial na VPS (Docker + proxy existente com HTTPS).
# Uso (como root):  bash deploy.sh            -> instala/atualiza
# Variáveis opcionais: DOMAIN, REPO, APP_DIR
set -euo pipefail

DOMAIN="${DOMAIN:-oticasmundial.allanturing.com}"
REPO="${REPO:-git@github-sistema:Bemfeitor/sistema-mundial.git}"
APP_DIR="${APP_DIR:-/opt/sistema-mundial}"
KEY=/root/.ssh/sistema_mundial_deploy

say() { printf '\n\033[1;34m==> %s\033[0m\n' "$*"; }

# 1. Docker
if ! command -v docker >/dev/null 2>&1; then
  say "Instalando Docker"
  curl -fsSL https://get.docker.com | sh
fi
docker compose version >/dev/null

# 2. Chave de deploy (somente leitura) para o repositório privado
mkdir -p /root/.ssh && chmod 700 /root/.ssh
if [ ! -f "$KEY" ]; then
  ssh-keygen -t ed25519 -N "" -C "deploy-sistema-mundial@$(hostname)" -f "$KEY" >/dev/null
fi
grep -q "Host github-sistema" /root/.ssh/config 2>/dev/null || cat >> /root/.ssh/config <<EOF

Host github-sistema
  HostName github.com
  User git
  IdentityFile $KEY
  IdentitiesOnly yes
  StrictHostKeyChecking accept-new
EOF
chmod 600 /root/.ssh/config

if ! ssh -o BatchMode=yes -T github-sistema 2>&1 | grep -qi "successfully authenticated"; then
  say "Adicione esta chave no GitHub (repositório > Settings > Deploy keys > Add deploy key, SEM marcar 'Allow write access'):"
  echo
  cat "$KEY.pub"
  echo
  read -r -p "Depois de adicionar, tecle Enter para continuar... " _ </dev/tty
fi

# 3. Código
if [ -d "$APP_DIR/.git" ]; then
  say "Atualizando código"
  git -C "$APP_DIR" pull --ff-only
else
  say "Clonando código"
  git clone "$REPO" "$APP_DIR"
fi
cd "$APP_DIR"

# 4. Segredos do modo demonstração (gerados uma vez)
if [ ! -f .env.production ]; then
  CODE=$(tr -dc 'A-HJ-NP-Z2-9' </dev/urandom | head -c 10)
  cat > .env.production <<EOF
DEMO_ACCESS_CODE=$CODE
SESSION_SECRET=$(openssl rand -hex 32)
APP_URL=https://$DOMAIN
EOF
  chmod 600 .env.production
fi

# 5. Detectar proxy (Traefik) já em uso nas portas 80/443
TRAEFIK=$(docker ps --format '{{.Names}} {{.Image}}' | awk 'tolower($2) ~ /traefik/ {print $1; exit}')
if [ -n "$TRAEFIK" ]; then
  ARGS=$(docker inspect "$TRAEFIK" --format '{{join .Args " "}} {{join .Config.Cmd " "}}')
  # arquivo de configuração estática montado (traefik.yml), se houver
  CFG=$(docker inspect "$TRAEFIK" --format '{{range .Mounts}}{{.Source}} {{end}}' | tr ' ' '\n' | grep -E 'traefik\.ya?ml$|traefik\.toml$' | head -1 || true)
  [ -n "$CFG" ] && [ -f "$CFG" ] && ARGS="$ARGS $(tr '\n' ' ' < "$CFG")"
  RESOLVER=$(echo "$ARGS" | grep -oE 'certificatesresolvers[.:]+ *[A-Za-z0-9_-]+' | head -1 | sed -E 's/.*[.:] *//')
  EP=$(echo "$ARGS" | grep -oE 'entrypoints\.[A-Za-z0-9_-]+\.address=:443' | head -1 | cut -d. -f2)
  [ -z "$EP" ] && EP=$(echo "$ARGS" | grep -oE '[A-Za-z0-9_-]+: *address: *":443"' | head -1 | cut -d: -f1)
  NET=$(docker inspect "$TRAEFIK" --format '{{range $k, $v := .NetworkSettings.Networks}}{{$k}} {{end}}' | tr ' ' '\n' | grep -v '^$' | grep -v '^bridge$' | head -1)
  RESOLVER=${RESOLVER:-letsencrypt}; EP=${EP:-websecure}; NET=${NET:-bridge}
  say "Traefik: container=$TRAEFIK rede=$NET entrypoint=$EP certresolver=$RESOLVER"
  cat > docker-compose.prod.yml <<EOF
services:
  otica:
    build: .
    container_name: sistema-mundial
    restart: unless-stopped
    env_file: .env.production
    networks: [proxy]
    labels:
      - traefik.enable=true
      - traefik.docker.network=$NET
      - traefik.http.routers.sistema-mundial.rule=Host(\`$DOMAIN\`)
      - traefik.http.routers.sistema-mundial.entrypoints=$EP
      - traefik.http.routers.sistema-mundial.tls=true
      - traefik.http.routers.sistema-mundial.tls.certresolver=$RESOLVER
      - traefik.http.services.sistema-mundial.loadbalancer.server.port=3000
networks:
  proxy:
    external: true
    name: $NET
EOF
else
  say "Nenhum Traefik encontrado: subindo Caddy próprio (HTTPS automático) nas portas 80/443"
  cat > Caddyfile <<EOF
$DOMAIN {
  reverse_proxy otica:3000
}
EOF
  cat > docker-compose.prod.yml <<EOF
services:
  otica:
    build: .
    container_name: sistema-mundial
    restart: unless-stopped
    env_file: .env.production
  caddy:
    image: caddy:2.8
    restart: unless-stopped
    ports: ["80:80", "443:443"]
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy_data:/data
volumes:
  caddy_data:
EOF
fi

# 6. Build e subida
say "Construindo e subindo (pode levar alguns minutos)"
docker compose -f docker-compose.prod.yml up -d --build
sleep 8
docker compose -f docker-compose.prod.yml ps
curl -s -o /dev/null -w "Teste interno: HTTP %{http_code}\n" --max-time 20 \
  "http://$(docker inspect sistema-mundial --format '{{range .NetworkSettings.Networks}}{{.IPAddress}} {{end}}' | awk '{print $1}'):3000/login" || true

say "Pronto: https://$DOMAIN"
echo "Código de acesso do modo demonstração: $(grep DEMO_ACCESS_CODE .env.production | cut -d= -f2)"
