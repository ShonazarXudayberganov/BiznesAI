#!/bin/bash
# ════════════════════════════════════════════════════════════════
#  BiznesAI — Avtomatik Deploy Skripti (Backend + Frontend + DB)
#  Ishlatish: bash deploy.sh yourdomain.com
#  Server: Ubuntu 22.04 LTS
# ════════════════════════════════════════════════════════════════

set -e  # Xato bo'lsa to'xta

DOMAIN=${1:-"localhost"}
APP_DIR="/opt/biznesai"
BOLD='\033[1m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo ""
echo -e "${BOLD}╔══════════════════════════════════════╗${NC}"
echo -e "${BOLD}║     BiznesAI Deploy Skripti v2.0     ║${NC}"
echo -e "${BOLD}║   Frontend + Backend + PostgreSQL     ║${NC}"
echo -e "${BOLD}╚══════════════════════════════════════╝${NC}"
echo -e "  Domain: ${GREEN}${DOMAIN}${NC}"
echo -e "  Dir:    ${GREEN}${APP_DIR}${NC}"
echo ""

# ── 1. Root tekshirish ──────────────────────────────────────
if [ "$EUID" -ne 0 ]; then
  echo -e "${RED}✗ Root huquqi kerak: sudo bash deploy.sh${NC}"
  exit 1
fi

# ── 2. Tizim yangilash ─────────────────────────────────────
echo -e "${YELLOW}► Tizim yangilanmoqda...${NC}"
apt-get update -qq
apt-get upgrade -y -qq

# ── 3. Docker o'rnatish ────────────────────────────────────
echo -e "${YELLOW}► Docker tekshirilmoqda...${NC}"
if ! command -v docker &>/dev/null; then
  echo -e "${YELLOW}  Docker o'rnatilmoqda...${NC}"
  curl -fsSL https://get.docker.com | sh
  systemctl enable docker
  systemctl start docker
  echo -e "${GREEN}  ✓ Docker o'rnatildi${NC}"
else
  echo -e "${GREEN}  ✓ Docker mavjud: $(docker --version)${NC}"
fi

if ! command -v docker-compose &>/dev/null; then
  echo -e "${YELLOW}  Docker Compose o'rnatilmoqda...${NC}"
  curl -SL "https://github.com/docker/compose/releases/latest/download/docker-compose-linux-$(uname -m)" \
    -o /usr/local/bin/docker-compose
  chmod +x /usr/local/bin/docker-compose
  echo -e "${GREEN}  ✓ Docker Compose o'rnatildi${NC}"
fi

# ── 4. Nginx o'rnatish ─────────────────────────────────────
echo -e "${YELLOW}► Nginx tekshirilmoqda...${NC}"
if ! command -v nginx &>/dev/null; then
  apt-get install -y -qq nginx
  echo -e "${GREEN}  ✓ Nginx o'rnatildi${NC}"
else
  echo -e "${GREEN}  ✓ Nginx mavjud${NC}"
fi

# ── 5. Certbot o'rnatish ───────────────────────────────────
echo -e "${YELLOW}► Certbot tekshirilmoqda...${NC}"
if ! command -v certbot &>/dev/null; then
  apt-get install -y -qq certbot python3-certbot-nginx
  echo -e "${GREEN}  ✓ Certbot o'rnatildi${NC}"
fi

# ── 6. Fayl nusxalash ──────────────────────────────────────
echo -e "${YELLOW}► Fayllar nusxalanmoqda...${NC}"
mkdir -p "$APP_DIR"
cp -r . "$APP_DIR/"
cd "$APP_DIR"

# ── 7. Nginx sozlash ───────────────────────────────────────
echo -e "${YELLOW}► Nginx sozlanmoqda...${NC}"
NGINX_CONF="/etc/nginx/sites-available/biznesai"

# Domain almashtirib nginx config yozish
sed "s/YOUR_DOMAIN.COM/${DOMAIN}/g" nginx/biznesai.conf > "$NGINX_CONF"

# Avval HTTP bilan ishga tushirish (SSL oldinroq)
cat > /etc/nginx/sites-available/biznesai-http <<EOF
server {
    listen 80;
    listen [::]:80;
    server_name ${DOMAIN} www.${DOMAIN};

    client_max_body_size 15m;

    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    # Backend API
    location /api/ {
        proxy_pass http://127.0.0.1:3001;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_connect_timeout 60s;
        proxy_send_timeout 120s;
        proxy_read_timeout 120s;
    }

    # Uploads
    location /uploads/ {
        proxy_pass http://127.0.0.1:3001;
        proxy_set_header Host \$host;
    }

    # Frontend
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
    }
}
EOF

ln -sf /etc/nginx/sites-available/biznesai-http /etc/nginx/sites-enabled/biznesai-http
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx

echo -e "${GREEN}  ✓ Nginx sozlandi (HTTP)${NC}"

# ── 8. Docker build va ishga tushirish ────────────────────
echo -e "${YELLOW}► Docker build boshlandi (3-7 daqiqa)...${NC}"
docker-compose down --remove-orphans 2>/dev/null || true
docker-compose build --no-cache
docker-compose up -d

echo -e "${GREEN}  ✓ Docker konteynerlar ishga tushdi${NC}"

# ── 9. Database migration ────────────────────────────────
echo -e "${YELLOW}► Database migration...${NC}"
sleep 5  # PostgreSQL to'liq ishga tushguncha kutish
docker-compose exec -T backend node src/db/migrate.js && {
  echo -e "${GREEN}  ✓ Database migration muvaffaqiyatli${NC}"
} || {
  echo -e "${YELLOW}  ⚠ Migration xatosi — qayta urinish...${NC}"
  sleep 5
  docker-compose exec -T backend node src/db/migrate.js || {
    echo -e "${RED}  ✗ Migration ishlamadi — qo'lda ishga tushiring:${NC}"
    echo "    docker-compose exec backend node src/db/migrate.js"
  }
}

# ── 10. SSL sertifikat olish ──────────────────────────────
if [ "$DOMAIN" != "localhost" ]; then
  echo -e "${YELLOW}► SSL sertifikat olinmoqda...${NC}"
  mkdir -p /var/www/certbot

  # Test if domain resolves to this server
  SERVER_IP=$(curl -s ifconfig.me 2>/dev/null || echo "unknown")
  DOMAIN_IP=$(dig +short "$DOMAIN" 2>/dev/null | tail -1 || echo "")

  if [ "$SERVER_IP" = "$DOMAIN_IP" ]; then
    certbot certonly --nginx \
      -d "$DOMAIN" \
      -d "www.${DOMAIN}" \
      --non-interactive \
      --agree-tos \
      --email "admin@${DOMAIN}" \
      --redirect 2>/dev/null && {

      # Switch to HTTPS config
      rm -f /etc/nginx/sites-enabled/biznesai-http
      ln -sf /etc/nginx/sites-available/biznesai /etc/nginx/sites-enabled/biznesai
      nginx -t && systemctl reload nginx

      # Auto-renew cron
      (crontab -l 2>/dev/null; echo "0 12 * * * certbot renew --quiet --nginx && systemctl reload nginx") | crontab -

      echo -e "${GREEN}  ✓ SSL sertifikat olindi!${NC}"
    } || echo -e "${YELLOW}  ⚠ SSL ishlamadi, HTTP bilan davom etildi${NC}"
  else
    echo -e "${YELLOW}  ⚠ DNS hali sozlanmagan — SSL o'tkazib yuborildi${NC}"
    echo -e "  Server IP: ${SERVER_IP}, Domain IP: ${DOMAIN_IP}"
  fi
fi

# ── 11. Firewall sozlash ──────────────────────────────────
echo -e "${YELLOW}► Firewall sozlanmoqda...${NC}"
if command -v ufw &>/dev/null; then
  ufw allow 22/tcp   >/dev/null 2>&1
  ufw allow 80/tcp   >/dev/null 2>&1
  ufw allow 443/tcp  >/dev/null 2>&1
  ufw --force enable >/dev/null 2>&1
  echo -e "${GREEN}  ✓ UFW: 22, 80, 443 ochildi${NC}"
fi

# ── 12. Tekshirish ───────────────────────────────────────
echo ""
echo -e "${YELLOW}► Tekshirilmoqda...${NC}"
sleep 3

# Backend
if curl -sf "http://127.0.0.1:3001/api/health" >/dev/null 2>&1; then
  echo -e "${GREEN}  ✓ Backend ishlayapti (port 3001)${NC}"
else
  echo -e "${RED}  ✗ Backend ishlamayapti — loglarni tekshiring:${NC}"
  echo "    docker-compose logs backend"
fi

# Frontend
if curl -sf "http://127.0.0.1:3000" >/dev/null 2>&1; then
  echo -e "${GREEN}  ✓ Frontend ishlayapti (port 3000)${NC}"
else
  echo -e "${RED}  ✗ Frontend ishlamayapti — loglarni tekshiring:${NC}"
  echo "    docker-compose logs frontend"
fi

# DB
if docker-compose exec -T postgres pg_isready -U biznesai -d biznesai >/dev/null 2>&1; then
  echo -e "${GREEN}  ✓ PostgreSQL ishlayapti${NC}"
else
  echo -e "${RED}  ✗ PostgreSQL ishlamayapti${NC}"
fi

# ── Natija ────────────────────────────────────────────────
echo ""
echo -e "${BOLD}╔══════════════════════════════════════════╗${NC}"
echo -e "${BOLD}║           DEPLOY MUVAFFAQIYATLI!         ║${NC}"
echo -e "${BOLD}╚══════════════════════════════════════════╝${NC}"
echo ""
if [ "$DOMAIN" != "localhost" ]; then
  echo -e "  🌐 Sayt:     ${GREEN}https://${DOMAIN}${NC}"
  echo -e "  🔧 HTTP:     ${GREEN}http://${DOMAIN}${NC}"
else
  echo -e "  🌐 Sayt:     ${GREEN}http://SERVER_IP${NC}"
fi
echo -e "  📡 API:      ${GREEN}http://127.0.0.1:3001/api/health${NC}"
echo -e "  🗄️  DB:       ${GREEN}PostgreSQL (port 5432)${NC}"
echo ""
echo -e "  📋 Foydali buyruqlar:"
echo -e "     docker-compose ps              # Holat"
echo -e "     docker-compose logs -f         # Loglar"
echo -e "     docker-compose logs backend    # Backend loglar"
echo -e "     docker-compose restart         # Qayta ishlatish"
echo -e "     docker-compose exec backend node src/db/migrate.js  # Migration"
echo ""
echo -e "  👤 Admin kirish: Shaxsiy ma'lumotlar bilan"
echo ""
