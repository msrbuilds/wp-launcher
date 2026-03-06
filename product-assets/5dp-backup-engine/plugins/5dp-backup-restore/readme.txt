=== 5DP Backup & Restore ===
Contributors: 5dollarplugins
Tags: backup, restore, migration, staging, database
Requires at least: 6.0
Tested up to: 6.7
Requires PHP: 7.4
Stable tag: 1.0.0
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Complete WordPress backup, restore, migration, and staging solution with chunked processing for any site size.

== Description ==

5DP Backup & Restore is a comprehensive WordPress backup plugin that handles sites of any size through intelligent chunked processing. Whether you're on shared hosting or a dedicated server, it adapts to your environment.

**Key Features:**

* **Automated & Manual Backups** — Full site, database only, files only, or custom backups with configurable schedules
* **Restore from Anywhere** — Upload a backup file, select from existing backups, or download from remote storage
* **Site Migration** — Automated migration between servers with serialization-safe search & replace
* **Staging Sites** — Create server-side staging copies or sync between local development and live sites
* **10 Storage Providers** — Local, Amazon S3 (+ compatible), Google Drive, Google Cloud Storage, Dropbox, OneDrive, FTP, SFTP, WebDAV
* **Chunked Processing** — Handles databases and file archives of any size in manageable chunks
* **Universal Compatibility** — Works on Apache, Nginx, LiteSpeed, shared hosting to dedicated servers
* **Background Processing** — Uses Action Scheduler with WP Cron and AJAX fallbacks
* **2-Way Sync** — Sync changes between staging and live, or between local and remote

== Installation ==

1. Upload the `5dp-backup-restore` folder to `/wp-content/plugins/`
2. Activate the plugin through the 'Plugins' menu in WordPress
3. Navigate to **Backup & Restore** in the admin menu
4. Configure your storage destinations and create your first backup

== Frequently Asked Questions ==

= How large of a site can this handle? =

There is no practical size limit. The plugin processes both database exports and file archives in configurable chunks, adapting to your server's available memory and execution time.

= Does it work on shared hosting? =

Yes. The plugin detects your server's capabilities and adjusts chunk sizes accordingly. It uses multiple fallback methods for background processing, archive creation, and database exports.

= Which cloud storage services are supported? =

Amazon S3, Wasabi, DigitalOcean Spaces, Backblaze B2, MinIO, Cloudflare R2, Google Drive, Google Cloud Storage, Dropbox, OneDrive, FTP, SFTP, and WebDAV.

== Changelog ==

= 1.0.0 =
* Initial release
