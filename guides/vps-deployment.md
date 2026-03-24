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
| **Cloudflare DNS** | Single wildcard cert, works with Cloudflare proxy (orange cloud) | Requires Cloudflare API token | DNS on Cloudflare |
| **HTTP challenge** | Works with any DNS provider, no tokens needed | Each subdomain gets a separate cert; **incompatible with Cloudflare proxy** | Ports 80/443 open, DNS only (no proxy) |

Both methods use **Let's Encrypt** for free SSL certificates.

> **Important**: If you use Cloudflare and want the proxy enabled (orange cloud) for DDoS protection/CDN, you **must** choose **Cloudflare DNS challenge** (option 1). HTTP challenge requires direct access to port 80, which Cloudflare proxy intercepts — causing Error 525 (SSL handshake failed). See [Cloudflare Proxy Compatibility](#cloudflare-proxy-compatibility).

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

# Optional: change the host port the API is exposed on (default: 3737)
# Only needed if port 3737 conflicts with another service on this server.
# Internal Docker networking always uses port 3737 regardless of this setting.
# API_PORT=3737

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
      - "traefik.http.services.api.loadbalancer.server.port=3737"

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

| Type | Name | Value |
|---|---|---|
| A | `demos.yourdomain.com` | `your-server-ip` |
| A | `*.demos.yourdomain.com` | `your-server-ip` |

The wildcard record (`*`) is essential — each demo site gets a unique subdomain. The API is served at `api.demos.yourdomain.com`, which is covered by the wildcard.

### Cloudflare Proxy Compatibility

Your SSL method determines whether you can use Cloudflare proxy (orange cloud):

| SSL Method | Cloudflare Proxy | Cloudflare SSL Mode | Notes |
|---|---|---|---|
| **Cloudflare DNS challenge** | Orange cloud (proxied) | Full | Recommended. Wildcard cert + CDN + DDoS protection |
| **HTTP challenge** | Grey cloud (DNS only) | N/A | Traefik handles SSL directly. Cloudflare proxy **will break** cert issuance (Error 525) |

**If you chose Cloudflare DNS challenge (option 1):**
- Enable orange cloud (proxied) on all A records
- Set Cloudflare SSL/TLS mode to **"Full"**
- Once certs are confirmed working, you can switch to **"Full (Strict)"**
- Check cert status: `docker compose logs traefik | grep -i "certificate obtained"`

**If you chose HTTP challenge (option 2):**
- Keep all records as **DNS only** (grey cloud) — do NOT enable Cloudflare proxy
- Traefik handles SSL directly via Let's Encrypt
- If you later want Cloudflare proxy, switch to the DNS challenge method (see [Switching SSL Methods](#switching-ssl-methods))

### Switching SSL Methods

To switch from HTTP challenge to Cloudflare DNS challenge after installation:

1. Set up a Cloudflare API token (see [Cloudflare DNS Setup](cloudflare-dns-setup.md))
2. Add credentials to `.env`:
   ```bash
   echo "CF_API_EMAIL=your-cloudflare-email" >> /opt/wp-launcher/.env
   echo "CF_DNS_API_TOKEN=your-api-token" >> /opt/wp-launcher/.env
   ```
3. Update `traefik/traefik.yml` — replace the `httpChallenge` section:
   ```yaml
   certificatesResolvers:
     letsencrypt:
       acme:
         email: your@email.com
         storage: /acme/acme.json
         dnsChallenge:
           provider: cloudflare
           resolvers:
             - "1.1.1.1:53"
             - "8.8.8.8:53"
   ```
4. Add CF env vars to the Traefik service in `docker-compose.override.yml`:
   ```yaml
   services:
     traefik:
       environment:
         - CF_API_EMAIL=${CF_API_EMAIL}
         - CF_DNS_API_TOKEN=${CF_DNS_API_TOKEN}
   ```
5. Reset certs and restart:
   ```bash
   docker compose stop traefik
   docker volume rm wp-launcher_traefik-certs
   docker compose up -d traefik
   ```
6. Once certs are obtained, enable Cloudflare proxy (orange cloud) on your DNS records

## Verify

1. Visit `https://demos.yourdomain.com` — you should see the dashboard
2. Register with an email — check your inbox for the verification link
3. Launch a demo — it should create a site at `https://random-subdomain.demos.yourdomain.com`
4. Check wp-admin access works (auto-login link from the dashboard)

## Email Provider Options

WP Launcher supports two email delivery methods:

| Method | How it works | When to use |
|---|---|---|
| **SMTP** (default) | Connects to SMTP server on port 587/465 | When your VPS allows outbound SMTP |
| **Brevo HTTP API** | Sends via HTTPS (port 443) | When SMTP ports are blocked (DigitalOcean, some cloud providers) |

> **Important**: Many VPS providers (DigitalOcean, Vultr, etc.) block outbound SMTP ports (25, 465, 587) on new servers to prevent spam. If you get "Connection timeout" errors when sending email, switch to `EMAIL_PROVIDER=brevo`.

### Option 1: Brevo HTTP API (Recommended for VPS)

Uses Brevo's HTTP API over port 443 — works everywhere, even when SMTP ports are blocked.

1. Create a free Brevo account at [brevo.com](https://www.brevo.com) (300 emails/day free)
2. Go to **Settings > SMTP & API > API Keys**
3. Create a new API key and copy it
4. Set in `.env`:

```env
EMAIL_PROVIDER=brevo
BREVO_API_KEY=xkeysib-your-api-key-here
SMTP_FROM=WP Launcher <noreply@yourdomain.com>
```

Then restart: `docker compose up -d api --force-recreate`

### Option 2: SMTP Providers

| Provider | Free Tier | Setup |
|---|---|---|
| **SendGrid** | 100 emails/day | `SMTP_HOST=smtp.sendgrid.net`, `SMTP_USER=apikey` |
| **Mailgun** | 100 emails/day (trial) | `SMTP_HOST=smtp.mailgun.org` |
| **Brevo (Sendinblue)** | 300 emails/day | `SMTP_HOST=smtp-relay.brevo.com` |
| **Amazon SES** | 62,000/month (with EC2) | `SMTP_HOST=email-smtp.us-east-1.amazonaws.com` |
| **Resend** | 100 emails/day | `SMTP_HOST=smtp.resend.com` |

#### SMTP_SECURE Setting

> **Critical:** `SMTP_SECURE` must match your SMTP port. Getting this wrong causes a "Connection timeout" error and emails will not send.

| Port | SMTP_SECURE | Protocol | Used By |
|---|---|---|---|
| **587** | `false` | STARTTLS (connects plain, upgrades to TLS) | Most providers (SendGrid, Brevo, Mailgun, SES, Resend) |
| **465** | `true` | Implicit TLS (direct encrypted connection) | Legacy / some providers |
| **25** | `false` | Plain SMTP (no encryption) | Not recommended |

**Common mistake:** Setting `SMTP_SECURE=true` with port 587. Port 587 uses STARTTLS — it starts as a plain connection and upgrades to TLS. Setting `secure=true` makes the app try a direct TLS handshake on port 587, which hangs and times out. **Always use `SMTP_SECURE=false` with port 587.**

### Testing with Mailpit

For testing without real email, Mailpit is included by default (dev mode). Access it via SSH tunnel:

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
- Check Traefik logs: `docker compose logs traefik | grep -i "acme\|cert\|error"`
- **Error 525 (SSL handshake failed)**: You're using HTTP challenge with Cloudflare proxy enabled. Either disable Cloudflare proxy (grey cloud) or switch to DNS challenge (see [Switching SSL Methods](#switching-ssl-methods))
- **"no valid A records found"**: DNS hasn't propagated yet — wait a few minutes and retry
- **Using HTTP challenge**: Ensure DNS records are set to **DNS only** (grey cloud, not proxied)
- **Using Cloudflare DNS challenge**: Ensure your API token has `Zone:DNS:Edit` permissions and CF env vars are set in both `.env` and `docker-compose.override.yml`
- **Certs stuck**: Reset ACME data and retry: `docker compose stop traefik && docker volume rm wp-launcher_traefik-certs && docker compose up -d traefik`

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
- Check demo container logs: `docker logs wp-site-<subdomain> --tail=50`

### Email verification not working
- Check SMTP credentials in `.env`
- Ensure the API container has the correct SMTP vars: `docker compose exec api env | grep SMTP`
- **"Connection timeout" error**: Almost always caused by `SMTP_SECURE=true` with port 587. Port 587 uses STARTTLS and requires `SMTP_SECURE=false`. Fix: `sed -i 's/SMTP_SECURE=true/SMTP_SECURE=false/' .env && docker compose restart api`
- Test with Mailpit first (dev mode) before switching to production SMTP
- View API logs for email errors: `docker compose logs -f api`

### Services won't start after install
- If you see "network label mismatch" errors: `docker network rm wp-launcher-network && docker compose up -d`
- Check all services: `docker compose ps`
- View logs: `docker compose logs --tail=50`
