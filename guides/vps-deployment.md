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

## Option A: One-Click Install (Recommended)

SSH into your VPS as root and run:

```bash
curl -sSL https://scripts.msrbuilds.com/wplauncher/install.sh | bash
```

The installer will:
1. Install Docker & Docker Compose (if not present)
2. Clone the WP Launcher repository
3. Prompt you for domain, SSL method, and SMTP settings
4. Generate secure secrets automatically
5. Configure Traefik for Let's Encrypt SSL (Cloudflare DNS or HTTP challenge)
6. Build all Docker images
7. Start all services

Skip ahead to [Configure DNS](#configure-dns) after the installer finishes.

## Option B: Manual Setup

### Step 1: Prepare the Server

SSH into your VPS and install Docker + Node.js:

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER

# Install Docker Compose plugin (if not included)
sudo apt install docker-compose-plugin -y

# Install Node.js 20 (needed for the build script)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install nodejs -y

# Install Git
sudo apt install git -y

# Log out and back in for Docker group to take effect
exit
```

Verify after re-login:

```bash
docker --version        # Docker 24+
docker compose version  # Docker Compose v2+
node --version          # v20+
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
git clone https://github.com/msrbuilds/wp-launcher.git
cd wp-launcher
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

# Security — generate secure random strings
API_KEY=$(openssl rand -hex 32)
JWT_SECRET=$(openssl rand -hex 32)
JWT_EXPIRES_IN=7d

# SMTP — use any transactional email provider
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=apikey
SMTP_PASS=your-sendgrid-api-key
SMTP_FROM=WP Launcher <noreply@yourdomain.com>

# WordPress
WP_IMAGE=wp-launcher/wordpress:latest

# Let's Encrypt wildcard SSL (Cloudflare DNS)
CF_API_EMAIL=your@email.com
CF_DNS_API_TOKEN=your-cloudflare-dns-api-token
```

**Generate secure keys** (run these and paste the output into `.env`):

```bash
echo "API_KEY=$(openssl rand -hex 32)"
echo "JWT_SECRET=$(openssl rand -hex 32)"
```

### Step 4: Configure Traefik for Production HTTPS

Update `traefik/traefik.yml` for Let's Encrypt:

```yaml
api:
  dashboard: true

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
      dnsChallenge:
        provider: cloudflare
        resolvers:
          - "1.1.1.1:53"
          - "8.8.8.8:53"

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

Update `docker-compose.yml` Traefik labels for HTTPS:

- Add `CF_API_EMAIL` and `CF_DNS_API_TOKEN` environment variables to the Traefik service
- Add `tls.certresolver=letsencrypt` to all router labels
- Add `tls.domains` for wildcard cert

### Step 5: Build and Deploy

```bash
# Build the base WordPress image
bash scripts/build-wp-image.sh

# Build your product images
bash scripts/build-wp-image.sh my-product
# bash scripts/build-wp-image.sh another-product  (repeat for each)

# Start everything
docker compose up -d

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

> **Note**: If using Cloudflare, set the wildcard record to "DNS only" (grey cloud), not "Proxied". Traefik handles SSL directly.

## Verify

1. Visit `https://demos.yourdomain.com` — you should see the dashboard
2. Register with an email — check your inbox for the verification link
3. Launch a demo — it should create a site at `https://random-subdomain.demos.yourdomain.com`
4. Visit `https://demos.yourdomain.com/admin` — log in with your `API_KEY`

## SMTP Provider Options

| Provider | Free Tier | Setup |
|---|---|---|
| **SendGrid** | 100 emails/day | `SMTP_HOST=smtp.sendgrid.net`, `SMTP_USER=apikey` |
| **Mailgun** | 100 emails/day (trial) | `SMTP_HOST=smtp.mailgun.org` |
| **Brevo (Sendinblue)** | 300 emails/day | `SMTP_HOST=smtp-relay.brevo.com` |
| **Amazon SES** | 62,000/month (with EC2) | `SMTP_HOST=email-smtp.us-east-1.amazonaws.com` |
| **Resend** | 100 emails/day | `SMTP_HOST=smtp.resend.com` |

## Updating on Production

```bash
cd wp-launcher

# Pull latest code
git pull

# Rebuild and restart
docker compose build api dashboard
docker compose up -d

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

# Check running demo containers
docker ps --filter "label=wp-launcher.managed=true"

# Check disk usage
docker system df
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
- Check Traefik logs: `docker compose logs -f traefik`
- If using Cloudflare DNS challenge, ensure your API token has `Zone:DNS:Edit` permissions

### Demo sites not accessible
- Ensure the wildcard DNS record exists (`*.demos.yourdomain.com`)
- Check that port 80 and 443 are open: `sudo ufw status`
- Verify the Docker network exists: `docker network ls | grep wp-launcher`

### Email verification not working
- Check SMTP credentials in `.env`
- Test with Mailpit first (dev mode) before switching to production SMTP
- View API logs for email errors: `docker compose logs -f api`
