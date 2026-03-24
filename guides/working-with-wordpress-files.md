# Working with WordPress Files

Each WP Launcher site runs in its own Docker container. In **local mode**, the site's `wp-content` directory is bind-mounted to your host filesystem, so you can edit plugins, themes, and uploads directly — no Docker commands needed.

---

## Direct File Access (Local Mode)

When `SITES_HOST_PATH` is set in `.env` (automatically configured by `install-local.sh`), each site's `wp-content` is available on your host at:

```
sites/{subdomain}/wp-content/
├── plugins/          ← edit plugins directly
├── themes/           ← edit themes directly
├── uploads/          ← media files
├── mu-plugins/       ← WP Launcher system plugins (don't edit)
└── db.php            ← SQLite integration
```

Changes you make to files are reflected **instantly** in the running WordPress site — just refresh your browser.

### Open in VS Code

**From the dashboard:** Click the **VS Code** button on any site card to open the site's `wp-content` in VS Code.

**From the CLI:**
```bash
wpl code <subdomain>
```

**From the file manager:**
```bash
wpl browse <subdomain>
```

**Manually:** Open the path directly:
```bash
code sites/coral-sunset-7x3k/wp-content
```

### Editing a Plugin

```bash
# Open just the plugin folder
code sites/coral-sunset-7x3k/wp-content/plugins/my-plugin

# Or open the entire wp-content
wpl code coral-sunset-7x3k
```

Edit files, save, refresh the browser. That's it.

### Editing a Theme

```bash
code sites/coral-sunset-7x3k/wp-content/themes/flavor
```

---

## Setup

The `install-local.sh` installer configures this automatically. For manual setup or existing installations:

1. **Add to `.env`:**
   ```
   SITES_HOST_PATH=/absolute/path/to/wp-launcher/sites
   ```

2. **Create the directory:**
   ```bash
   mkdir -p sites
   ```

3. **Rebuild services:**
   ```bash
   docker compose up -d --build api provisioner
   ```

New sites created after this will have their `wp-content` accessible at `sites/{subdomain}/wp-content/`.

> **Note:** Existing sites created before setting `SITES_HOST_PATH` will still use Docker named volumes. Recreate them to get direct file access.

---

## File Locations Inside the Container

WordPress is installed at `/var/www/html/` inside each container:

```
/var/www/html/
├── wp-content/       ← bind-mounted to host (local mode + SITES_HOST_PATH)
├── wp-config.php
├── wp-admin/
├── wp-includes/
└── ...
```

### Storage Modes

| Mode | SITES_HOST_PATH set? | Storage | File Access |
|------|---------------------|---------|-------------|
| **Local** | Yes (recommended) | Host bind mount: `sites/{subdomain}/wp-content/` | Direct from host |
| **Local** | No | Named Docker volume `wp-site-{subdomain}` | Via Docker commands only |
| **Agency** | N/A | Ephemeral container filesystem | Via Docker commands only |

---

## Alternative Methods (When Direct Access Is Not Available)

These methods work regardless of `SITES_HOST_PATH` and for agency mode.

### VS Code Dev Containers

1. Install the [Dev Containers](https://marketplace.visualstudio.com/items?itemName=ms-vscode-remote.remote-containers) extension
2. Press `Ctrl+Shift+P` → **Dev Containers: Attach to Running Container**
3. Select your site's container, then **Open Folder** → `/var/www/html/wp-content/`

### Docker Copy

```bash
# Copy a plugin out for editing
docker cp <container>:/var/www/html/wp-content/plugins/my-plugin ./my-plugin
code ./my-plugin

# Copy changes back
docker cp ./my-plugin <container>:/var/www/html/wp-content/plugins/my-plugin
```

### Shell Access

```bash
docker exec -it <container> bash
```

### wp-cli

Every container has wp-cli pre-installed:

```bash
docker exec <container> wp plugin list --allow-root
docker exec <container> wp theme list --allow-root
```

Or via the CLI:
```bash
wpl wp <subdomain> plugin list
wpl shell <subdomain>
```

---

## Tips

- **File permissions:** On Linux, files written by WordPress inside the container are owned by `www-data`. If you create files from the host, WordPress can still read them but may not be able to write. Fix with:
  ```bash
  docker exec <container> chown -R www-data:www-data /var/www/html/wp-content/
  ```
  On Docker Desktop (Windows/Mac), permissions are handled transparently.

- **MU-plugins are system files:** Don't edit `mu-plugins/` — these are WP Launcher system plugins (restrictions, branding, autologin, productivity tracking). They get overwritten on container recreation.

- **Container names:** WP Launcher containers are named `wp-site-{subdomain}`.

- **MySQL sites:** If the site uses MySQL/MariaDB, the database runs in a sidecar container `wp-db-{subdomain}`. Use `--skip-ssl` for mysql CLI commands.

---

## Quick Reference

| Task | Command |
|------|---------|
| Open in VS Code | `wpl code <subdomain>` |
| Open in file manager | `wpl browse <subdomain>` |
| List running sites | `wpl sites` |
| Shell into container | `wpl shell <subdomain>` |
| Run wp-cli | `wpl wp <subdomain> plugin list` |
| Copy plugin out | `docker cp <container>:/var/www/html/wp-content/plugins/my-plugin ./my-plugin` |
| Copy plugin back | `docker cp ./my-plugin <container>:/var/www/html/wp-content/plugins/my-plugin` |
| Fix permissions | `docker exec <container> chown -R www-data:www-data /var/www/html/wp-content/` |
