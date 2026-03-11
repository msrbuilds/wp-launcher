# Cloudflare DNS API Token Setup

WP Launcher uses Cloudflare's DNS API to automatically obtain wildcard SSL certificates (`*.yourdomain.com`) via Let's Encrypt. This guide walks you through creating the required API token.

## What You Need

| Variable | Description |
|----------|-------------|
| `CF_API_EMAIL` | Your Cloudflare account email |
| `CF_DNS_API_TOKEN` | A scoped API token with DNS edit permissions |

## Step-by-Step

### 1. Log in to Cloudflare

Go to [dash.cloudflare.com](https://dash.cloudflare.com) and log in with your account.

### 2. Note Your Account Email

The email you log in with is your `CF_API_EMAIL`. Copy it — you'll need it for the `.env` file.

### 3. Create an API Token

1. Click your **profile icon** (top-right) > **My Profile**
2. Go to the **API Tokens** tab
3. Click **Create Token**
4. Under **Custom token**, click **Get started**

### 4. Configure Token Permissions

Set the following:

| Field | Value |
|-------|-------|
| **Token name** | `WP Launcher DNS` (or any name you prefer) |
| **Permissions** | Zone > **DNS** > **Edit** |
| **Zone Resources** | Include > **Specific zone** > select your domain |

Leave everything else as default (no IP filtering needed unless you want extra security).

### 5. Create and Copy the Token

1. Click **Continue to summary**
2. Review the permissions — it should show: `Zone - DNS - Edit` for your domain
3. Click **Create Token**
4. **Copy the token immediately** — Cloudflare only shows it once

### 6. Add to Your .env File

```env
CF_API_EMAIL=you@example.com
CF_DNS_API_TOKEN=your-copied-token-here
```

### 7. Verify It Works

After starting WP Launcher, check Traefik logs for certificate issuance:

```bash
docker compose logs traefik | grep -i "acme\|cert\|dns"
```

You should see messages about DNS challenge resolution and certificate storage.

## DNS Records

Make sure your domain has these DNS records pointing to your server IP:

| Type | Name | Value | Proxy |
|------|------|-------|-------|
| A | `yourdomain.com` | `YOUR_SERVER_IP` | Proxied (orange cloud) |
| A | `*.yourdomain.com` | `YOUR_SERVER_IP` | Proxied (orange cloud) |

### Cloudflare Proxy (Orange Cloud)

Since you're using the **DNS challenge**, you **can** enable Cloudflare proxy (orange cloud) on your records. The DNS challenge validates via TXT records, not HTTP — so the proxy doesn't interfere with cert issuance.

**Required Cloudflare SSL/TLS settings:**
1. Go to **SSL/TLS > Overview** in your Cloudflare dashboard
2. Set encryption mode to **"Full"**
3. Once the Let's Encrypt cert is confirmed working, you can upgrade to **"Full (Strict)"**

> **Warning**: Do NOT use "Flexible" mode — it causes redirect loops. Do NOT use "Full (Strict)" until the cert is issued, or you'll get Error 525.

**Check cert status:**
```bash
docker compose logs traefik | grep -i "certificate obtained"
```

## Troubleshooting

**Error 525 (SSL handshake failed)** — Cloudflare proxy is enabled but the origin doesn't have a valid cert yet. Either:
- Wait for the Let's Encrypt cert to be issued (check logs: `docker compose logs traefik | grep -i acme`)
- Temporarily set Cloudflare SSL mode to "Full" (not "Full Strict")
- If using HTTP challenge instead of DNS challenge, disable Cloudflare proxy (grey cloud) — HTTP challenge is incompatible with Cloudflare proxy

**"DNS problem: NXDOMAIN"** — Your DNS records aren't set up or haven't propagated yet. Wait a few minutes and check with `dig yourdomain.com`.

**"error presenting token"** — The API token doesn't have the correct permissions. Verify it has `Zone > DNS > Edit` for the right domain.

**"too many certificates"** — Let's Encrypt has rate limits (50 certificates per registered domain per week). This is rarely hit in normal usage.

**Token stopped working** — Tokens can be revoked from Cloudflare dashboard. Check **My Profile > API Tokens** to verify it's still active.

**SMTP "Connection timeout" after setup** — Not related to Cloudflare, but commonly encountered during VPS setup. If registration fails with a timeout error, check `SMTP_SECURE` in `.env`. Port 587 requires `SMTP_SECURE=false` (STARTTLS). Setting `true` with port 587 causes the connection to hang. See [VPS Deployment - SMTP Providers](vps-deployment.md#smtp-provider-options) for details.

**Logs show `ChallengeTLSALPN` instead of DNS challenge** — Your `traefik.yml` doesn't have the `dnsChallenge` config. Make sure it has `dnsChallenge: { provider: cloudflare }` under `certificatesResolvers.letsencrypt.acme`, and that `CF_API_EMAIL` / `CF_DNS_API_TOKEN` are passed to the Traefik container via `docker-compose.override.yml`.
