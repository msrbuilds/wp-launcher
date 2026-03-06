# WP Launcher

Spin up isolated, temporary WordPress demo sites on demand — pre-loaded with your plugins and themes, auto-deleted after expiration. Perfect for letting potential customers test your WordPress products without manual setup.

Each demo site runs in its own Docker container with SQLite (no MySQL needed), routed through Traefik with automatic subdomain assignment.

## How It Works

```
User clicks "Launch Demo"
  → API creates a Docker container with your product pre-installed
  → Traefik auto-routes a unique subdomain to the container
  → WordPress auto-installs via entrypoint script
  → User gets a working WordPress site in ~10 seconds
  → Site auto-deletes after expiration (default: 1 hour)
```

## Features

- **Instant provisioning** — Pre-built Docker images with plugins baked in (~10s launch time)
- **Full isolation** — Each demo is a separate container, no shared databases
- **No MySQL** — Uses WordPress SQLite Database Integration plugin, cutting resource usage in half
- **Auto-cleanup** — Expired sites are automatically stopped and removed
- **Admin restrictions** — MU-plugins prevent demo users from installing plugins, editing code, etc.
- **Email verification** — Optional email gate before launching demos (rate limiting built-in)
- **Multi-product** — Host demos for multiple products from a single installation
- **Wildcard subdomains** — Each demo gets a unique URL like `coral-sunset-7x3k.yourdomain.com`
- **Modern dashboard** — React SPA with real-time provisioning progress

## Architecture

| Component | Technology |
|---|---|
| Management API | Node.js + Express + TypeScript |
| Management DB | SQLite (better-sqlite3) |
| WordPress DB | SQLite (sqlite-database-integration plugin) |
| Reverse Proxy | Traefik v3 (auto-discovery via Docker labels) |
| Dashboard | React + Vite + TypeScript |
| Container Base | wordpress:6.9-php8.3-apache |

## Project Structure

```
wp-launcher/
├── docker-compose.yml          # Infrastructure (Traefik + API + Dashboard)
├── .env.example                # Environment configuration
├── packages/
│   ├── api/                    # Management API (Express/TypeScript)
│   └── dashboard/              # React SPA (Vite)
├── wordpress/                  # Custom WP Docker image
│   ├── Dockerfile
│   ├── entrypoint.sh           # Auto-installs WP + activates plugins
│   ├── wp-config-docker.php
│   └── mu-plugins/             # Admin restrictions & demo branding
├── products/                   # Product config files (one per product)
│   ├── _default.json
│   └── my-product.json
├── product-assets/             # Local plugins/themes per product
│   └── my-product/
│       └── plugins/
├── traefik/                    # Traefik reverse proxy config
├── scripts/
│   ├── setup.sh                # Initial setup script
│   └── build-wp-image.sh       # Builds product Docker images
└── guides/                     # Documentation
```

## Quick Start

### Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (or Docker Engine + Docker Compose)
- [Node.js](https://nodejs.org/) 18+ (for the build script)
- Git Bash (on Windows) or any Unix shell

### 1. Clone and configure

```bash
git clone https://github.com/your-org/wp-launcher.git
cd wp-launcher
cp .env.example .env
# Edit .env with your settings (see Configuration section)
```

### 2. Build the base WordPress image

```bash
bash scripts/build-wp-image.sh
```

### 3. Add your first product

Create `products/my-product.json`:

```json
{
  "id": "my-product",
  "name": "My Awesome Plugin",
  "plugins": {
    "preinstall": [
      { "source": "wordpress.org", "slug": "my-plugin", "activate": true }
    ],
    "remove": ["hello", "akismet"]
  },
  "demo": {
    "default_expiration": "1h",
    "max_concurrent_sites": 5,
    "admin_user": "demo",
    "admin_password": "demo123",
    "landing_page": "/wp-admin/admin.php?page=my-plugin"
  },
  "restrictions": {
    "disable_file_mods": true,
    "blocked_capabilities": [
      "install_plugins", "install_themes",
      "edit_plugins", "edit_themes", "update_core"
    ]
  },
  "docker": {
    "image": "wp-launcher/my-product:latest"
  },
  "branding": {
    "banner_text": "Demo site — expires in {time_remaining}.",
    "description": "Try My Awesome Plugin in a live WordPress environment."
  }
}
```

Build the product image:

```bash
bash scripts/build-wp-image.sh my-product
```

### 4. Start everything

```bash
docker compose up -d
```

Visit **http://localhost** — the dashboard is ready.

## Configuration

### Environment Variables (`.env`)

| Variable | Description | Default |
|---|---|---|
| `BASE_DOMAIN` | Your domain (subdomains will be `*.BASE_DOMAIN`) | `localhost` |
| `NODE_ENV` | `development` or `production` | `development` |
| `API_KEY` | Admin API key | `dev-api-key` |
| `JWT_SECRET` | Secret for user JWT tokens | (required) |
| `PUBLIC_URL` | Public URL for email verification links | `http://localhost` |
| `SMTP_HOST` | SMTP server for verification emails | — |
| `SMTP_PORT` | SMTP port | `587` |
| `SMTP_USER` | SMTP username | — |
| `SMTP_PASS` | SMTP password | — |
| `SMTP_FROM` | Sender address for emails | — |
| `WP_IMAGE` | Default WordPress image | `wp-launcher/wordpress:latest` |

### Product Config Reference

Each JSON file in `products/` defines a demo product. The filename must match the `id` field (e.g., `my-product.json` → `"id": "my-product"`).

| Field | Description |
|---|---|
| `id` | Unique identifier (must match filename) |
| `name` | Display name on the dashboard |
| `plugins.preinstall` | Array of plugins to install (see Plugin Sources) |
| `plugins.remove` | Plugin slugs to remove from default WP install |
| `themes.install` | Array of themes to install |
| `demo.default_expiration` | How long demos last (`1h`, `2h`, `24h`) |
| `demo.max_concurrent_sites` | Max active demos for this product |
| `demo.admin_user` / `admin_password` | Demo login credentials |
| `demo.landing_page` | Redirect path after WP login |
| `restrictions.disable_file_mods` | Block plugin/theme installs |
| `restrictions.blocked_capabilities` | WP capabilities to remove |
| `docker.image` | Docker image tag (set after building) |
| `branding.banner_text` | Banner shown in wp-admin (`{time_remaining}` placeholder) |
| `branding.description` | Card description on the dashboard |
| `branding.image_url` | Product card image URL |

### Plugin Sources

Three ways to include plugins:

```json
{
  "plugins": {
    "preinstall": [
      { "source": "wordpress.org", "slug": "contact-form-7", "activate": true },
      { "source": "url", "url": "https://example.com/pro-plugin.zip", "activate": true },
      { "source": "local", "path": "./product-assets/my-product/plugins/my-plugin", "activate": true }
    ]
  }
}
```

| Source | Description |
|---|---|
| `wordpress.org` | Downloaded from the WP plugin directory by slug |
| `url` | Downloaded from any URL (must be a .zip) |
| `local` | Copied from a local directory (path relative to project root) |

## Adding a Product (While Running)

```bash
# 1. Create/edit the product JSON in products/
# 2. Build the Docker image and restart the API:
bash scripts/build-wp-image.sh my-product && docker compose restart api
```

The new product appears on the dashboard immediately.

## Development

### Run the dashboard with hot reload

```bash
# Stop the dashboard container
docker compose stop dashboard

# Start Vite dev server (proxies API calls to the Docker API)
cd packages/dashboard && npm run dev
```

Dashboard available at **http://localhost:4000** with instant hot reload.

### API changes

The API runs inside Docker. After editing API source files:

```bash
docker compose build api && docker compose up -d api
```

## Production Deployment (VPS / Live Server)

Complete guide to deploy WP Launcher on a fresh VPS with a custom domain, HTTPS, and email verification.

### Server Requirements

| Resource | Minimum | Recommended |
|---|---|---|
| CPU | 1 vCPU | 2+ vCPU |
| RAM | 2 GB | 4 GB+ |
| Disk | 20 GB SSD | 40 GB+ SSD |
| OS | Ubuntu 22.04 / 24.04 LTS | Ubuntu 24.04 LTS |
| Ports | 80, 443 open | 80, 443 open |

Providers that work well: DigitalOcean, Hetzner, Vultr, Linode, AWS Lightsail.

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

### Step 3: Configure DNS

At your domain registrar (Cloudflare, Namecheap, etc.), add these DNS records pointing to your server IP:

| Type | Name | Value |
|---|---|---|
| A | `demos.yourdomain.com` | `your-server-ip` |
| A | `*.demos.yourdomain.com` | `your-server-ip` |
| A | `api.demos.yourdomain.com` | `your-server-ip` |

The wildcard record (`*`) is essential — each demo site gets a unique subdomain.

> **Note**: If using Cloudflare, set the wildcard record to "DNS only" (grey cloud), not "Proxied". Traefik handles SSL directly.

### Step 4: Clone and Configure

```bash
git clone https://github.com/your-org/wp-launcher.git
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

### Step 5: Configure Traefik for Production HTTPS

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

### Step 6: Build and Deploy

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

### Step 7: Verify

1. Visit `https://demos.yourdomain.com` — you should see the dashboard
2. Register with an email — check your inbox for the verification link
3. Launch a demo — it should create a site at `https://random-subdomain.demos.yourdomain.com`
4. Visit `https://demos.yourdomain.com/admin` — log in with your `API_KEY`

### SMTP Provider Options

| Provider | Free Tier | Setup |
|---|---|---|
| **SendGrid** | 100 emails/day | `SMTP_HOST=smtp.sendgrid.net`, `SMTP_USER=apikey` |
| **Mailgun** | 100 emails/day (trial) | `SMTP_HOST=smtp.mailgun.org` |
| **Brevo (Sendinblue)** | 300 emails/day | `SMTP_HOST=smtp-relay.brevo.com` |
| **Amazon SES** | 62,000/month (with EC2) | `SMTP_HOST=email-smtp.us-east-1.amazonaws.com` |
| **Resend** | 100 emails/day | `SMTP_HOST=smtp.resend.com` |

### Updating on Production

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

### Monitoring and Logs

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

### Backup

The only stateful data is the SQLite database in `./data/`:

```bash
# Backup
cp -r ./data ./data-backup-$(date +%Y%m%d)

# The database contains: users, site records, logs
# Demo site containers are ephemeral — no backup needed
```

## API Endpoints

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `POST` | `/api/auth/register` | — | Send verification email |
| `POST` | `/api/auth/verify` | — | Verify email token |
| `GET` | `/api/products` | — | List all products |
| `GET` | `/api/products/:id` | — | Get product config |
| `POST` | `/api/sites` | User | Create a demo site |
| `GET` | `/api/sites` | Optional | List sites (user's or all) |
| `GET` | `/api/sites/:id` | — | Get site details |
| `GET` | `/api/sites/:id/ready` | — | Check if WP is fully installed |
| `DELETE` | `/api/sites/:id` | User | Delete a demo site |

## Resource Requirements

Each demo container uses approximately:

- **RAM**: ~100MB (WordPress + PHP + Apache + SQLite)
- **Disk**: ~200MB per container
- **CPU**: Minimal when idle

A server with 4GB RAM can comfortably run 20-30 concurrent demo sites.

## License

MIT
