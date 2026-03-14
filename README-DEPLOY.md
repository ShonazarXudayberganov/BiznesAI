# BiznesAI — Server Deploy Qo'llanmasi

## Loyiha Tuzilishi

```
biznesai/
├── frontend/
│   ├── src/
│   │   ├── App.jsx        ← Asosiy React ilovasi (3600+ qator)
│   │   └── main.jsx       ← React kirish nuqtasi
│   ├── public/
│   │   └── favicon.svg
│   ├── index.html         ← HTML shabloni
│   ├── package.json       ← npm bog'liqliklar
│   ├── vite.config.js     ← Vite sozlamalari
│   ├── Dockerfile         ← Docker (build + nginx)
│   └── nginx-spa.conf     ← Ichki nginx SPA config
├── nginx/
│   └── biznesai.conf      ← Tashqi nginx (SSL + reverse proxy)
├── docker-compose.yml
├── deploy.sh              ← Bir buyruqli deploy
└── README-DEPLOY.md
```

---

## Server Talablari

| Xususiyat | Minimum | Tavsiya |
|-----------|---------|---------|
| OS        | Ubuntu 22.04 LTS | Ubuntu 22.04 LTS |
| CPU       | 1 vCore | 2 vCore |
| RAM       | 1 GB    | 2 GB |
| Disk      | 10 GB   | 20 GB |
| Narx      | ~$5/oy  | ~$10/oy |

**Hosting tavsiyalari:** DigitalOcean, Hetzner, Linode, Vultr, Timeweb.uz

---

## 1. DNS Sozlash (birinchi!)

Hosting panelida **A Record** yarating:

```
Tur   Nomi     Qiymati
A     @        SERVER_IP_MANZILI
A     www      SERVER_IP_MANZILI
```

> ⚠️ DNS tarqalishi 5-30 daqiqa talab qiladi. SSL olishdan oldin tayyorlanishi shart.

---

## 2. Fayllarni Serverga Yuklash

**Variant A — SCP orqali:**
```bash
# Arxiv yaratish (local kompyuterda)
tar -czf biznesai.tar.gz biznesai/

# Serverga yuklash
scp biznesai.tar.gz root@SERVER_IP:/opt/

# Serverda ochish
ssh root@SERVER_IP
cd /opt && tar -xzf biznesai.tar.gz
cd biznesai
```

**Variant B — Git orqali:**
```bash
# Serverda
git clone https://github.com/SIZNING_REPO/biznesai.git /opt/biznesai
cd /opt/biznesai
```

---

## 3. Deploy Qilish

```bash
cd /opt/biznesai
chmod +x deploy.sh

# Domain bilan (SSL ham oladi)
bash deploy.sh yourdomain.com

# Yoki IP bilan (SSL siz)
bash deploy.sh
```

### Deploy nima qiladi?
1. ✅ Docker o'rnatadi
2. ✅ Nginx o'rnatadi
3. ✅ SSL sertifikat oladi (certbot)
4. ✅ React ilovasini build qiladi
5. ✅ Docker konteyner ishga tushiradi
6. ✅ Nginx konfiguratsiya qiladi
7. ✅ Firewall sozlaydi (22, 80, 443)
8. ✅ Auto SSL yangilash cron qo'shadi

**Vaqt:** ~5-10 daqiqa

---

## 4. Qo'lda O'rnatish (agar deploy.sh ishlamasa)

### Docker o'rnatish
```bash
curl -fsSL https://get.docker.com | sh
systemctl enable docker && systemctl start docker
```

### Ilovani build qilish
```bash
cd /opt/biznesai
docker-compose build
docker-compose up -d
```

### Nginx sozlash
```bash
# Config nusxalash va domain almashtirish
sed -i 's/YOUR_DOMAIN.COM/yourdomain.com/g' nginx/biznesai.conf
cp nginx/biznesai.conf /etc/nginx/sites-available/biznesai

# HTTP config (SSL oldinroq)
ln -sf /etc/nginx/sites-available/biznesai-http /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx

# SSL olish
certbot certonly --nginx -d yourdomain.com -d www.yourdomain.com \
  --non-interactive --agree-tos --email admin@yourdomain.com

# HTTPS config yoqish
ln -sf /etc/nginx/sites-available/biznesai /etc/nginx/sites-enabled/biznesai
rm /etc/nginx/sites-enabled/biznesai-http
nginx -t && systemctl reload nginx
```

---

## 5. Tekshirish

```bash
# Konteyner holati
docker-compose ps

# Loglar
docker-compose logs -f

# Nginx holati
systemctl status nginx

# Test
curl -I https://yourdomain.com
```

---

## 6. Yangilash

Agar App.jsx ni o'zgartirsangiz:

```bash
cd /opt/biznesai
# Yangi App.jsx ni frontend/src/ ga nusxalang

docker-compose build --no-cache frontend
docker-compose up -d
```

---

## 7. Foydali Buyruqlar

```bash
docker-compose ps              # Konteyner holati
docker-compose logs -f         # Real-vaqt loglar
docker-compose restart         # Qayta ishlatish
docker-compose down            # To'xtatish
docker-compose up -d           # Ishga tushirish

nginx -t                       # Config tekshirish
systemctl reload nginx         # Nginx qayta yuklash

certbot renew                  # SSL yangilash
```

---

## 8. Demo Kirish Ma'lumotlari

| Maydon | Qiymat |
|--------|--------|
| Email  | (shaxsiy) |
| Parol  | (shaxsiy) |
| Rol    | Admin |

> ⚠️ **Muhim:** Admin ma'lumotlarini xavfsiz saqlang!

---

## 9. Muammolarni Hal Qilish

**"Site can't be reached"**
```bash
# Nginx ishlayaptimi?
systemctl status nginx
# Docker ishlayaptimi?
docker-compose ps
# Port ochiqmi?
ufw status
curl http://127.0.0.1:3000
```

**"SSL Certificate Error"**
```bash
# DNS to'g'ri sozlanganmi?
dig yourdomain.com
# Sertifikat holati
certbot certificates
# Qayta urinish
certbot certonly --nginx -d yourdomain.com
```

**Docker build xatosi**
```bash
# Cachelarni tozalash
docker system prune -f
docker-compose build --no-cache
```

---

## 10. Arxitektura

```
Internet
    │
    ▼
[Nginx :443 SSL]
    │
    ▼
[Docker: Frontend :3000]
(React SPA + Nginx Alpine)
    │
    ▼
[Browser localStorage]
(Foydalanuvchilar, sessiyalar, to'lovlar)
```

> **Eslatma:** Hozirgi versiyada barcha ma'lumotlar browser localStorage'da saqlanadi.
> Bu demo/MVP uchun yaxshi. Ishlab chiqish davom etsa, backend (FastAPI + PostgreSQL) qo'shish tavsiya etiladi.

---

*BiznesAI v2.0 — Strategik Agent*
