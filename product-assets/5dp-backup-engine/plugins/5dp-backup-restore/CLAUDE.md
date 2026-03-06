# 5DP Backup & Restore — WordPress Plugin

## Overview
Full-featured WordPress backup plugin: manual/scheduled backups, restore, migration, staging with 2-way sync. Works on shared to dedicated hosting (Apache, Nginx, LiteSpeed).

## Naming Conventions
- **Plugin slug**: `5dp-backup-restore` | **Text domain**: `5dp-backup-restore`
- **Class prefix**: `FiveDPBR_` | **Function prefix**: `fdpbr_` | **Constant prefix**: `FDPBR_`
- **Option key**: `fdpbr_settings` | **CSS class prefix**: `fdpbr-` | **DB table prefix**: `{$wpdb->prefix}fdpbr_`

## Key Architecture

### Backup Strategy
- **Full backups** → Single `.fdpbr` file (custom binary format, no ZIP). Files streamed directly into archive with 10s time-based chunking for resume support.
- **Database/Files/Custom** → Separate files (SQL dump + ZIP chunks).

### .fdpbr Binary Format
`FDPBR` magic (5B) + version (1B) + manifest_len (4B) + manifest JSON + entries (prefix_len + prefix + name_len + name + size 8B + raw data) + `FDPBREND` footer (8B). No compression — raw concatenation for speed.

### Background Processing — 3-Tier Fallback
1. Action Scheduler (bundled) → 2. WP Cron loopback → 3. AJAX polling

### Archive Methods (non-full backups)
ZipArchive → exec(zip) → PclZip fallback chain

### Backup Storage
`wp-content/5dp-backups/` — protected with `.htaccess` deny + `index.php`

## Database Tables (6)
`fdpbr_backups`, `fdpbr_schedules`, `fdpbr_jobs`, `fdpbr_staging`, `fdpbr_change_log`, `fdpbr_logs`

## File Structure
```
admin/
  css/fdpbr-admin.css          # Design system (purple #7C3AED theme, ported from Ultimate Performance)
  js/fdpbr-{backup,restore,migration,staging,admin}.js
  partials/                    # PHP page templates
includes/
  class-fdpbr.php              # Main orchestrator + require chain
  class-fdpbr-settings.php     # Menu registration + AJAX save
  class-fdpbr-activator.php    # DB tables + backup dir creation
  backup/
    class-fdpbr-backup-engine.php   # Backup orchestrator (extends background processor)
    class-fdpbr-packager.php        # .fdpbr format: init_stream → stream_chunk → add_file → finalize
    class-fdpbr-file-archiver.php   # ZIP chunked archiver (non-full backups)
    class-fdpbr-db-exporter.php     # Chunked MySQL export
    class-fdpbr-backup-manifest.php # Manifest JSON generation
  restore/                     # Restore engine + DB importer + search-replace
  migration/                   # REST API migration
  staging/                     # Server staging + local↔live sync
  storage/                     # 10 providers: local, S3, GCS, GDrive, Dropbox, OneDrive, FTP, SFTP, WebDAV
  background/                  # Job manager, environment detection, abstract processor
  util/                        # Logger, encryption, notifications, helper
```

## UI Design
- Purple theme matching Ultimate Performance plugin (`#7C3AED` primary)
- jQuery + AJAX, server-rendered PHP partials
- CSS classes: `fdpbr-section-card`, `fdpbr-btn`, `fdpbr-toggle-card`, `fdpbr-mini-log`
- Toggle card grid for backup component selection
- Dark terminal-style mini activity log (200px)

## Implementation Status
All 9 phases complete: Foundation, Environment, Backup, Restore, Storage, Scheduling, Migration, Staging, Polish.

## Important Patterns
- All AJAX: `check_ajax_referer('fdpbr_nonce', 'nonce')` + `current_user_can('manage_options')`
- JS sends `action: 'fdpbr_start_backup'`, `destinations` param (not `storage`)
- Content/Exclude sections only visible for "Custom" backup type
- `FiveDPBR_Environment::get_backup_dir()` returns `WP_CONTENT_DIR . '/5dp-backups'`

## Restore Tab — Implementation Details

### Restore Page UI (`admin/partials/restore-page.php`)
3-step wizard: **Select Source → Configure → Restore**
- Step 1: Upload zone (drag/drop + click), previously uploaded files list, "Select from Existing Backups" picker, "Download from Remote" button
- Step 2: File info banner, restore options (DB checkbox + Files checkbox), Back + Start Restore buttons
- Step 3: Progress bar + percentage label + step text

### Restore JS (`admin/js/fdpbr-restore.js`)
Key state vars: `uploadedFilePath`, `selectedBackupId`
Key methods:
- `checkActiveRestoreJob()` — on init, checks for in-progress job and resumes polling (handles page reload mid-restore)
- `loadUploadedFiles()` — AJAX `fdpbr_get_uploaded_files`, renders previously uploaded `.fdpbr/.zip/.sql/.gz` files
- `handleFileUpload()` — chunked upload using `fdpbrAdmin.upload_chunk_size`, shows progress bar + cancel button + beforeunload guard
- `pollRestoreProgress(jobId)` — custom polling loop (not `FDPBR.pollJobProgress`) with auth-failure detection: if response contains `wp-login` HTML, shows session-lost message instead of browser login popup
- `showStep2()` — shows file info + options + actions, calls `fdpbrGoToStep`

### Restore Engine (`includes/restore/class-fdpbr-restore-engine.php`)
AJAX handlers registered: `fdpbr_start_restore`, `fdpbr_upload_backup_chunk`, `fdpbr_get_uploaded_files`, `fdpbr_get_active_restore_job`

**Restore phases for uploaded `.fdpbr` files:**
`verify` → `fdpbr_unpack` → `fdpbr_restore_files` → `database` → `search_replace` → `cleanup`

**Key implementation notes:**
- `ajax_start_restore()`: when `backup_id` empty + `backup_file` set, reads manifest from `.fdpbr` header via `FiveDPBR_Packager::read_manifest()`, writes `manifest.json` to uploads dir, sets `fdpbr_source` in job args
- `phase_verify()`: skips `FiveDPBR_Backup_Manifest::verify()` when `fdpbr_source` is set (full backup manifest has empty checksums by design), routes to `fdpbr_unpack`
- `phase_fdpbr_unpack()`: calls `set_time_limit(0)` then `FiveDPBR_Packager::extract()` to unpack archive to `backup_dir`. Detects full backup (no ZIP chunks in manifest) by checking if `wp-content/`, `wp-admin/`, or `wp-login.php` exist after extraction. Injects `database.file = 'database.sql'` into manifest.
- `phase_fdpbr_restore_files()`: recursively copies extracted files from `backup_dir` to `ABSPATH`, chunked with 8s time limit per poll. **Skips: `wp-config.php` (auth salts/DB creds), `database.sql`, `manifest.json`, `.htaccess`, `index.php`** at root level.
- `ajax_get_active_restore_job()`: returns most recent queued/running restore job from `FiveDPBR_Job_Manager::get_active_jobs()` — used by JS to resume after page reload.
- `ajax_get_uploaded_files()`: only lists files with extensions `.fdpbr`, `.zip`, `.sql`, `.gz` — prevents extracted WP core files from polluting the list.

**Upload flow:**
- Upload dir: `wp-content/5dp-backups/uploads/`
- Chunk size: `FiveDPBR_Admin::get_upload_chunk_size()` = `wp_max_upload_size() * 0.9`, min 2MB, max 20MB
- Localized as `fdpbrAdmin.upload_chunk_size`

### Full Backup Manifest — Critical Fact
The manifest embedded in the `.fdpbr` header (read by `read_manifest()`) has **empty `checksums: {}`** and **empty `database.file: ''`** and **empty `files.chunks: []`** for full backups. This is by design — `phase_finalize` in the backup engine generates the manifest without referencing individual embedded files. The restore engine must detect this and handle accordingly (see `phase_fdpbr_unpack`).

### Test Environment
- Source site: `c:\laragon\www\msrplugins` — where plugin is developed
- Test/restore target: `c:\laragon\www\5dp-backup` — separate WP install for testing restores
- Always `cp` changed files to test site after edits: `cp -r source/. dest/`
