# VPS Deployment Guide

Complete guide to deploy WP Launcher on a fresh VPS with a custom domain, HTTPS, and email verification.

## Server Requirements

| Resource | Minimum | Recommended |
|---|---|---|
| CPU | 1 vCPU | 2+ vCPU |
| RAM | 2 GB | 4 GB+ |
| Disk | 20 GB SSD | 40 GB+ SSD |
| OS | Ubuntu 22.04 / 24.04 LTS | Ubuntu 24.04 LTS |
| Ports | 80, 443 open | 80, 443 open |

Providers that work well: DigitalOcean, Hetzner, Vultr, Linode, AWS Lightsail.

> **Note**: Servers with less than 2GB RAM will have swap automatically added by the installer. For best performance, use 4GB+ RAM.

## Option A: One-Click Install (Recommended)

SSH into your VPS as root and run:

```bash
curl -sSL https://scripts.msrbuilds.com/wplauncher/install.sh | bash
```

Or install directly from GitHub:

```bash
git clone https://github.com/msrbuilds/wp-launcher.git /opt/wp-launcher
cd /opt/wp-launcher
bash install.sh
```

The installer will:
1. Add swap on low-memory servers (< 3GB RAM)
2. Install Docker & Docker Compose (if not present)
3. Clone the WP Launcher repository
4. Prompt you for domain, SSL method, and SMTP settings
5. Generate secure secrets automatically
6. Configure Traefik for Let's Encrypt SSL (Cloudflare DNS or HTTP challenge)
7. Build all Docker images
8. Start all services

Skip ahead to [Configure DNS](#configure-dns) after the installer finishes.

### SSL Method Choice

The installer asks you to choose an SSL certificate method:

| Method | Pros | Cons | Requires |
|---|---|---|---|
| **Cloudflare DNS** | Single wildcard cert for all subdomains | Requires Cloudflare API token | DNS on Cloudflare |
| **HTTP challenge** | Works with any DNS provider, no tokens needed | Each subdomain gets a separate cert (~2-3s on first visit) | Ports 80/443 open |

Both methods use **Let's Encrypt** for free SSL certificates. If unsure, pick **HTTP challenge** (option 2) — it works with any DNS provider.

## Option B: Manual Setup

### Step 1: Prepare the Server

SSH into your VPS and install Docker:

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER

# Install Docker Compose plugin (if not included)
sudo apt install docker-compose-plugin -y

# Install Git
sudo apt install git -y

# Log out and back in for Docker group to take effect
exit
```

Verify after re-login:

```bash
docker --version        # Docker 24+
docker compose version  # Docker Compose v2+
```

### Step 2: Configure Firewall

```bash
# Allow SSH, HTTP, HTTPS
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

### Step 3: Clone and Configure

```bash
git clone https://github.com/msrbuilds/wp-launcher.git /opt/wp-launcher
cd /opt/wp-launcher
cp .env.example .env
```

Edit `.env` with your production settings:

```bash
nano .env
```

```env
# Core
NODE_ENV=production
BASE_DOMAIN=demos.yourdomain.com
PUBLIC_URL=https://demos.yourdomain.com

# Security — generate with: openssl rand -hex 32
API_KEY=your-random-key-here
JWT_SECRET=your-random-secret-here
PROVISIONER_INTERNAL_KEY=your-random-key-here
JWT_EXPIRES_IN=7d

# TLS for demo site containers (required for production HTTPS)
ENABLE_TLS=true
CERT_RESOLVER=letsencrypt

# SMTP — use any transactional email provider
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=apikey
SMTP_PASS=your-sendgrid-api-key
SMTP_FROM=WP Launcher <noreply@yourdomain.com>

# WordPress
WP_IMAGE=wp-launcher/wordpress:latest
```

**Generate secure keys** (run these and paste the output into `.env`):

```bash
echo "API_KEY=$(openssl rand -hex 32)"
echo "JWT_SECRET=$(openssl rand -hex 32)"
echo "PROVISIONER_INTERNAL_KEY=$(openssl rand -hex 32)"
```

### Step 4: Configure Traefik for Production HTTPS

Update `traefik/traefik.yml` for Let's Encrypt with HTTP challenge:

```yaml
api:
  dashboard: true
  insecure: false

entryPoints:
  web:
    address: ":80"
    http:
      redirections:
        entryPoint:
          to: websecure
          scheme: https
  websecure:
    address: ":443"

certificatesResolvers:
  letsencrypt:
    acme:
      email: your@email.com
      storage: /acme/acme.json
      httpChallenge:
        entryPoint: web

providers:
  docker:
    endpoint: "unix:///var/run/docker.sock"
    exposedByDefault: false
    network: wp-launcher-network
    watch: true
  file:
    directory: "/etc/traefik/dynamic"
    watch: true

log:
  level: INFO
```

Create a `docker-compose.override.yml` for production TLS labels:

```yaml
services:
  api:
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.api.rule=Host(`api.${BASE_DOMAIN}`)"
      - "traefik.http.routers.api.entrypoints=websecure"
      - "traefik.http.routers.api.tls=true"
      - "traefik.http.routers.api.tls.certresolver=letsencrypt"
      - "traefik.http.routers.api.middlewares=security-headers@file,rate-limit@file"
      - "traefik.http.services.api.loadbalancer.server.port=3000"

  dashboard:
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.dashboard.rule=Host(`${BASE_DOMAIN}`)"
      - "traefik.http.routers.dashboard.entrypoints=websecure"
      - "traefik.http.routers.dashboard.tls=true"
      - "traefik.http.routers.dashboard.tls.certresolver=letsencrypt"
      - "traefik.http.routers.dashboard.middlewares=security-headers@file"
      - "traefik.http.services.dashboard.loadbalancer.server.port=80"
```

### Step 5: Build and Deploy

```bash
# Build the base WordPress image
docker build -t wp-launcher/wordpress:latest ./wordpress

# Start everything (compose builds API, dashboard, provisioner automatically)
docker compose up -d --build

# Check that all services are running
docker compose ps
```

## Configure DNS

At your domain registrar (Cloudflare, Namecheap, etc.), add these DNS records pointing to your server IP:

| Type | Name | Value | Proxy |
|---|---|---|---|
| A | `demos.yourdomain.com` | `your-server-ip` | DNS only (grey cloud) |
| A | `*.demos.yourdomain.com` | `your-server-ip` | DNS only (grey cloud) |

The wildcard record (`*`) is essential — each demo site gets a unique subdomain. The API is served at `api.demos.yourdomain.com`, which is covered by the wildcard.

> **Important**: If using Cloudflare, set **both** records to "DNS only" (grey cloud), not "Proxied" (orange cloud). Traefik handles SSL directly — Cloudflare proxy will interfere with certificate issuance and cause connection errors.

## Verify

1. Visit `https://demos.yourdomain.com` — you should see the dashboard
2. Register with an email — check your inbox for the verification link
3. Launch a demo — it should create a site at `https://random-subdomain.demos.yourdomain.com`
4. Check wp-admin access works (auto-login link from the dashboard)

## SMTP Provider Options

| Provider | Free Tier | Setup |
|---|---|---|
| **SendGrid** | 100 emails/day | `SMTP_HOST=smtp.sendgrid.net`, `SMTP_USER=apikey` |
| **Mailgun** | 100 emails/day (trial) | `SMTP_HOST=smtp.mailgun.org` |
| **Brevo (Sendinblue)** | 300 emails/day | `SMTP_HOST=smtp-relay.brevo.com` |
| **Amazon SES** | 62,000/month (with EC2) | `SMTP_HOST=email-smtp.us-east-1.amazonaws.com` |
| **Resend** | 100 emails/day | `SMTP_HOST=smtp.resend.com` |

For testing without email, Mailpit is included by default (dev mode). Access it via SSH tunnel:

```bash
# From your local machine (not the VPS):
ssh -L 9025:localhost:8025 root@your-server-ip
# Then visit http://localhost:9025
```

## Updating on Production

```bash
cd /opt/wp-launcher

# Pull latest code
git pull

# Rebuild and restart
docker compose build api dashboard provisioner
docker compose up -d

# If WordPress image changed:
docker build -t wp-launcher/wordpress:latest ./wordpress

# If you changed product configs or plugins:
bash scripts/build-wp-image.sh my-product
docker compose restart api
```

## Monitoring and Logs

```bash
# View all service logs
docker compose logs -f

# View specific service logs
docker compose logs -f api
docker compose logs -f traefik
docker compose logs -f provisioner

# Check running demo containers
docker ps --filter "label=wp-launcher.managed=true"

# Check disk usage
docker system df

# Check memory usage
free -h
```

## Backup

The only stateful data is the SQLite database in `./data/`:

```bash
# Backup
cp -r ./data ./data-backup-$(date +%Y%m%d)

# The database contains: users, site records, logs
# Demo site containers are ephemeral — no backup needed
```

## Troubleshooting

### SSL certificates not issuing
- Verify DNS records are pointing to the correct server IP
- Ensure both A records (domain and wildcard) are set to **DNS only** (not proxied) if using Cloudflare
- Check Traefik logs: `docker compose logs -f traefik`
- If using Cloudflare DNS challenge, ensure your API token has `Zone:DNS:Edit` permissions

### wp-admin redirect loop
- This means WordPress doesn't detect HTTPS behind the reverse proxy
- Ensure `wp-config-docker.php` has the `HTTP_X_FORWARDED_PROTO` check
- Rebuild the WordPress image: `docker build -t wp-launcher/wordpress:latest ./wordpress`
- Launch a new demo site (existing sites use the old image)

### Demo sites show SSL error (`ERR_SSL_UNRECOGNIZED_NAME_ALERT`)
- Ensure `ENABLE_TLS=true` is set in `.env`
- Restart the provisioner: `docker compose up -d --build provisioner`
- Launch a new demo site — existing sites won't have TLS labels

### Server runs out of memory
- Check memory: `free -h`
- Add swap if not present: `fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile`
- Reduce container memory limit in `.env`: `CONTAINER_MEMORY=134217728` (128MB)

### Demo sites not accessible
- Ensure the wildcard DNS record exists (`*.demos.yourdomain.com`)
- Check that port 80 and 443 are open: `sudo ufw status`
- Verify containers are running: `docker ps --filter "label=wp-launcher.managed=true"`
- Check demo container logs: `docker logs wp-demo-<subdomain> --tail=50`

### Email verification not working
- Check SMTP credentials in `.env`
- Ensure the API container has the correct SMTP vars: `docker compose exec api env | grep SMTP`
- Test with Mailpit first (dev mode) before switching to production SMTP
- View API logs for email errors: `docker compose logs -f api`

### Services won't start after install
- If you see "network label mismatch" errors: `docker network rm wp-launcher-network && docker compose up -d`
- Check all services: `docker compose ps`
- View logs: `docker compose logs --tail=50`
