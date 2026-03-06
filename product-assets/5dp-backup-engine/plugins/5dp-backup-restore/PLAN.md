# 5DP Backup & Restore — Implementation Plan

## Context

We need to build a full-featured WordPress backup plugin from scratch in the `5dp-backup-restore` directory (currently empty — greenfield project). The plugin must handle automated/manual backups, restore, server-to-server migration, and staging with 2-way sync. It must work reliably on all hosting tiers (shared to dedicated) and all major web servers (Apache, Nginx, LiteSpeed). The UI must match our existing "Ultimate Performance" plugin's design language (purple theme, section cards, toggle switches, jQuery + AJAX, server-rendered PHP partials).

---

## Naming Conventions

| Item | Convention |
|------|-----------|
| Plugin slug | `5dp-backup-restore` |
| Text domain | `5dp-backup-restore` |
| Class prefix | `FiveDPBR_` (PHP classes can't start with a digit) |
| Function prefix | `fdpbr_` |
| Constant prefix | `FDPBR_` |
| Option key | `fdpbr_settings` |
| CSS class prefix | `fdpbr-` |
| DB table prefix | `{$wpdb->prefix}fdpbr_` |

---

## File Structure

```
5dp-backup-restore/
├── 5dp-backup-restore.php              # Bootstrap (constants, hooks, autoload)
├── uninstall.php                       # Clean removal
├── readme.txt                          # WP.org format
├── LICENSE.txt                         # GPLv2+
│
├── admin/
│   ├── class-fdpbr-admin.php           # Asset enqueuing, admin bar
│   ├── css/fdpbr-admin.css             # Full design system (ported from UP)
│   ├── js/
│   │   ├── fdpbr-admin.js              # Core (settings, toasts, tabs)
│   │   ├── fdpbr-backup.js             # Backup progress + chunked upload
│   │   ├── fdpbr-restore.js            # Restore wizard
│   │   ├── fdpbr-migration.js          # Migration wizard
│   │   └── fdpbr-staging.js            # Staging management
│   └── partials/
│       ├── header-nav.php              # Shared top nav bar
│       ├── dashboard-page.php          # Overview stats + recent backups
│       ├── backup-page.php             # Manual backup + history
│       ├── restore-page.php            # Upload/select + restore wizard
│       ├── migration-page.php          # Source/dest wizard + progress
│       ├── staging-page.php            # Staging sites + sync controls
│       ├── storage-page.php            # Remote storage config cards
│       ├── settings-page.php           # Sidebar-tabbed settings
│       ├── settings-tabs/
│       │   ├── general-settings.php
│       │   ├── schedule-settings.php
│       │   ├── notification-settings.php
│       │   └── advanced-settings.php
│       └── logs-page.php              # Activity log viewer
│
├── includes/
│   ├── class-fdpbr.php                 # Main orchestrator
│   ├── class-fdpbr-loader.php          # Hook/filter registration
│   ├── class-fdpbr-i18n.php            # Internationalization
│   ├── class-fdpbr-activator.php       # Activation (create tables, defaults)
│   ├── class-fdpbr-deactivator.php     # Deactivation (clear cron)
│   ├── class-fdpbr-settings.php        # Menu registration, AJAX save
│   ├── class-fdpbr-database.php        # Custom tables CRUD helper
│   │
│   ├── backup/
│   │   ├── class-fdpbr-backup-engine.php    # Backup orchestrator
│   │   ├── class-fdpbr-db-exporter.php      # Chunked MySQL export (pure PHP)
│   │   ├── class-fdpbr-file-archiver.php    # Chunked file archiving
│   │   └── class-fdpbr-backup-manifest.php  # Backup metadata JSON
│   │
│   ├── restore/
│   │   ├── class-fdpbr-restore-engine.php   # Restore orchestrator
│   │   ├── class-fdpbr-db-importer.php      # Chunked DB import
│   │   ├── class-fdpbr-file-extractor.php   # Chunked extraction
│   │   └── class-fdpbr-search-replace.php   # Serialization-safe search-replace
│   │
│   ├── migration/
│   │   ├── class-fdpbr-migration-engine.php  # Migration orchestrator
│   │   ├── class-fdpbr-migration-api.php     # REST endpoints (both sites)
│   │   └── class-fdpbr-migration-package.php # Package builder/consumer
│   │
│   ├── staging/
│   │   ├── class-fdpbr-staging-engine.php    # Staging orchestrator
│   │   ├── class-fdpbr-staging-clone.php     # DB clone + file copy
│   │   ├── class-fdpbr-staging-sync.php      # 2-way sync logic
│   │   └── class-fdpbr-staging-tracker.php   # Change tracking
│   │
│   ├── storage/
│   │   ├── interface-fdpbr-storage.php       # Storage provider interface
│   │   ├── class-fdpbr-storage-manager.php   # Provider registry + factory
│   │   ├── class-fdpbr-storage-local.php     # Local filesystem
│   │   ├── class-fdpbr-storage-s3.php        # S3-compatible (AWS, Wasabi, DO Spaces, B2, MinIO, R2)
│   │   ├── class-fdpbr-storage-gcs.php       # Google Cloud Storage
│   │   ├── class-fdpbr-storage-gdrive.php    # Google Drive (OAuth2)
│   │   ├── class-fdpbr-storage-dropbox.php   # Dropbox (OAuth2)
│   │   ├── class-fdpbr-storage-onedrive.php  # OneDrive (OAuth2)
│   │   ├── class-fdpbr-storage-ftp.php       # FTP
│   │   ├── class-fdpbr-storage-sftp.php      # SFTP
│   │   └── class-fdpbr-storage-webdav.php    # WebDAV
│   │
│   ├── background/
│   │   ├── class-fdpbr-background-processor.php  # Abstract processor (3-tier fallback)
│   │   ├── class-fdpbr-job-manager.php           # Job queue + stale detection
│   │   └── class-fdpbr-environment.php           # Server capability detection
│   │
│   └── util/
│       ├── class-fdpbr-logger.php            # Activity logging
│       ├── class-fdpbr-encryption.php        # Encrypt storage credentials
│       ├── class-fdpbr-notifications.php     # Email notifications
│       └── class-fdpbr-helper.php            # Misc helpers
│
├── api/
│   └── class-fdpbr-rest-controller.php       # REST API for migration
│
├── languages/
│   └── 5dp-backup-restore.pot
│
└── vendor/
    └── woocommerce/action-scheduler/          # Bundled Action Scheduler (~200KB)
```

---

## Database Schema (6 custom tables)

### `fdpbr_backups` — Backup records
| Column | Type | Purpose |
|--------|------|---------|
| id | bigint PK AUTO | |
| backup_id | varchar(64) UNIQUE | Public identifier |
| name | varchar(255) | User-friendly name |
| type | varchar(20) | full / database / files / custom |
| status | varchar(20) | pending / running / completed / failed / cancelled |
| total_size, db_size, files_size | bigint | Size tracking |
| chunk_count | int | Number of archive chunks |
| storage_destinations | text (JSON) | Target storage IDs |
| file_paths | text (JSON) | Archive chunk paths |
| manifest | longtext (JSON) | Full backup manifest |
| started_at, completed_at, created_at | datetime | Timestamps |

### `fdpbr_schedules` — Automated schedule configs
| Column | Type | Purpose |
|--------|------|---------|
| id | bigint PK | |
| name, type, frequency | varchar | Schedule definition |
| day_of_week, day_of_month, hour, minute | tinyint | Timing |
| storage_destinations | text (JSON) | Where to send |
| retention_count | int | How many to keep |
| include/exclude_tables, include/exclude_paths | text (JSON) | Scope |
| is_active | tinyint(1) | Enabled flag |
| last_run, next_run | datetime | |

### `fdpbr_jobs` — Background job queue
| Column | Type | Purpose |
|--------|------|---------|
| id | bigint PK | |
| job_id | varchar(64) UNIQUE | |
| type | varchar(30) | backup / restore / migration / staging_create / staging_sync |
| status | varchar(20) | queued / running / paused / completed / failed |
| progress_percent | tinyint | 0-100 |
| current_step | varchar(100) | Human-readable step description |
| data | longtext (JSON) | Serialized job state for resume |
| attempts, max_attempts | tinyint | Retry control |
| heartbeat | datetime | Stale detection (>5min = stale) |

### `fdpbr_staging` — Staging site records
Columns: id, name, staging_prefix, staging_dir, staging_url, source_url, type (subdirectory/local_copy), status, size tracking, last_sync_at, last_push_at

### `fdpbr_change_log` — 2-way sync change tracking
Columns: id, staging_id, source (live/staging), change_type, object_type, object_id, object_data (JSON diff), detected_at, synced flag

### `fdpbr_logs` — Activity log
Columns: id, level (debug/info/warning/error), context (backup/restore/migration/staging/storage), message, data (JSON), user_id, created_at

---

## Core Architecture Decisions

### Background Processing — 3-Tier Fallback
1. **Action Scheduler** (preferred) — bundled (~200KB); true async with reliable queue. Defers gracefully if WooCommerce already provides it.
2. **WP Cron loopback** — each tick processes one chunk, then reschedules
3. **AJAX polling** — frontend JS sends requests at intervals; fallback when cron fails

Each step runs within adaptive time/memory limits. Jobs update a `heartbeat` column; stale jobs (>5min no heartbeat) are auto-retried or failed.

### Chunked Processing — Adaptive Sizing
```
memory_available = memory_limit × 0.7
time_available   = min(max_execution_time × 0.8, 25s)
db_batch         = clamp(1000, 10000, memory_available / 10KB)
file_chunk       = clamp(10MB, 100MB, memory_available / 3)
```

### Archive Methods — Fallback Chain
`ZipArchive` → `PclZip` (bundled with WP) → `exec('zip')` → `exec('tar')`

### Database Export — Fallback Chain
`exec('mysqldump')` → `PDO` chunked queries → `mysqli` chunked queries

### Storage Interface
All providers implement `FiveDPBR_Storage_Interface` with methods: `test_connection()`, `upload()`, `upload_chunk()` (resumable), `download()`, `delete()`, `list_files()`, `get_credential_fields()`.

The S3 provider uses **pure PHP AWS Signature V4 signing** (via `wp_remote_*`) — zero SDK dependency, smallest footprint, works on all hosts. Supports any S3-compatible endpoint (AWS, Wasabi, DO Spaces, B2, MinIO, R2) via configurable endpoint URL.

OAuth providers (Google Drive, Dropbox, OneDrive) use a **dual OAuth approach**:
- **Default**: Our hosted OAuth relay server for frictionless setup (user clicks "Connect", relay handles the dance)
- **Advanced**: Users can enter their own app credentials (Client ID + Secret) for full control
- Tokens stored encrypted; relay server only proxies the OAuth exchange, never stores tokens

All **10 storage providers** ship in v1.0: Local, S3-Compatible, Google Cloud Storage, Google Drive, Dropbox, OneDrive, FTP, SFTP, WebDAV.

### Migration — API-Based Transfer
- Both source and destination sites must have the plugin installed
- REST API endpoints authenticated with a time-limited shared secret token
- Source site packages backup → streams chunks to destination → destination restores with search-replace
- Serialization-safe search-replace: unserialize → replace → re-serialize with corrected string lengths

### Staging — Two Modes

**Mode 1: Server Staging (subdirectory clone)**
- Clone DB tables with unique prefix (e.g., `stg1_`)
- Copy files to `wp-content/staging/{name}/`
- Change tracking via WordPress hooks (`save_post`, `delete_post`, `updated_option`, etc.) + file hash monitoring
- 2-way sync: review pending changes → selective merge → apply

**Mode 2: Local ↔ Live Sync (remote staging)**
- Plugin installed on both local dev machine and live server
- Paired via REST API with shared secret token (same mechanism as migration)
- **Pull from Live**: Download DB + files from live site to local — for starting local dev with fresh production data
- **Push to Live**: Upload local changes (DB diff + changed files) to live site with search-replace
- **2-Way Sync**: Both sites track changes independently; sync UI shows pending changes from each side with conflict resolution (choose local / choose live / skip)
- Change tracking uses a `fdpbr_change_log` table on both sites; sync compares logs by timestamp
- Selective sync: choose to sync only DB, only files, specific tables, or specific directories
- URL/path rewriting handled automatically during push/pull (local URLs ↔ live URLs)

---

## Admin UI Pages

Top navigation bar matching UP design:
```
[Logo] 5DP Backup & Restore [v1.0.0]
[Dashboard] [Backup] [Restore] [Migration] [Staging] [Storage] [Settings] [Logs]
```

| Page | Key UI Elements |
|------|----------------|
| **Dashboard** | Stat cards (Last Backup, Active Schedules, Storage Used, Staging Sites), Recent Backups table, Quick Actions, System Status |
| **Backup** | Backup type selector (Full/DB/Files/Custom), exclusion options, storage destination picker, "Backup Now" button, progress bar, backup history table with download/delete |
| **Restore** | Upload zone (chunked upload for large files), select from remote storage, restore wizard (3 steps: select → configure → execute), progress bar |
| **Migration** | Source/Destination URL inputs, connection test, migration options (what to include), progress with step indicators |
| **Staging** | Two tabs: **Server Staging** (create subdirectory clone, sync controls) and **Local ↔ Live** (pair with remote site, pull/push/2-way sync, conflict resolution UI, selective sync options). Both show status badges, change review modal, progress bars |
| **Storage** | Provider cards grid (like UP's module status), each with connect/configure/test buttons, connected status badge |
| **Settings** | Sidebar-tabbed layout: General, Schedules, Notifications, Advanced |
| **Logs** | Filterable activity log table with level/context filters, date range picker |

CSS ported from UP with `fdpbr-` prefix, same CSS variables (purple `#7C3AED` primary).

---

## Security

- All backup files in `wp-content/backups/5dp-backup-restore-{secret}/` with `.htaccess` deny + empty `index.php`
- Storage credentials encrypted at rest using `AUTH_KEY` salt
- All AJAX: `check_ajax_referer()` + `current_user_can('manage_options')`
- REST API: `permission_callback` with capability check
- Migration API: time-limited single-use token authentication
- All inputs sanitized, all outputs escaped, all queries prepared
- SHA256 checksums in backup manifest for integrity verification
- Temp files cleaned up after job completion (success or failure)

---

## Implementation Phases

### Phase 1: Foundation
- Bootstrap file, main orchestrator, activator (all 6 tables), deactivator
- Settings class with menu registration and AJAX save
- Admin class with asset enqueuing
- Full admin CSS (ported design system), header nav partial
- Dashboard page (placeholder)
- `uninstall.php`

### Phase 2: Environment & Background Processing
- Server capability detection (`FiveDPBR_Environment`)
- Abstract background processor with 3-tier fallback
- Job manager with stale detection
- Logger + Logs page UI

### Phase 3: Backup Engine (Local)
- Chunked DB exporter (pure PHP, fallback chain)
- Chunked file archiver (fallback chain)
- Backup manifest generation
- Backup engine orchestrator
- Backup page UI with progress polling

### Phase 4: Restore Engine (Local)
- Chunked file extraction
- Chunked DB import
- Serialization-safe search-replace
- Restore engine orchestrator
- Restore page UI with wizard + progress

### Phase 5: Storage Providers
- Storage interface + manager + encryption
- Local storage (formalize)
- FTP + SFTP
- S3-compatible (pure PHP Sig V4 — covers AWS, Wasabi, DO, B2, MinIO, R2)
- Google Drive + Dropbox + OneDrive (OAuth2 with dual relay/own-credentials approach)
- Google Cloud Storage + WebDAV
- Storage page UI with provider config cards

### Phase 6: Scheduling & Notifications
- Schedule CRUD in settings
- Action Scheduler / WP Cron hook registration
- Email notifications (backup complete/fail)
- Retention policy enforcement

### Phase 7: Migration
- REST API endpoints (source + destination)
- Migration package builder/consumer
- Migration engine with search-replace
- Migration page UI with wizard + progress

### Phase 8: Staging
- **8a - Server Staging**: DB prefix clone + file copy, change tracking hooks, local 2-way sync
- **8b - Local ↔ Live Sync**: REST API pairing flow, pull/push engines with chunked transfer + search-replace, remote change log comparison, conflict resolution UI, selective sync (DB/files/tables/dirs)
- Staging page UI with two tabs (Server Staging / Local ↔ Live) + sync controls + conflict review modal

### Phase 9: Polish
- Dashboard with real stats
- Full settings tabs
- Security audit
- readme.txt, LICENSE, .pot file

---

## Reference Files (from Ultimate Performance)
- **Settings pattern**: `ultimate-performance/includes/class-ultimate-performance-settings.php`
- **CSS design system**: `ultimate-performance/admin/css/ultimate-performance-admin.css`
- **Settings layout**: `ultimate-performance/admin/partials/settings-page.php`
- **JS architecture**: `ultimate-performance/admin/js/ultimate-performance-admin.js`
- **Main orchestrator**: `ultimate-performance/includes/class-ultimate-performance.php`

## Verification
1. Activate plugin — no errors, all 6 DB tables created
2. Navigate each admin page — correct layout matching UP design
3. Create a manual full backup — completes in chunks, files + DB exported
4. Restore from local backup — site restored correctly
5. Configure each storage provider — test connection succeeds
6. Create a scheduled backup — runs on time, uploads to remote
7. Run migration between two local WP installs — URLs replaced correctly
8. Create staging copy — accessible, changes tracked, 2-way sync works
9. Test on shared hosting (128MB memory, 30s execution) — completes via chunking
