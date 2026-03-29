<?php
/**
 * Plugin Name: WP Launcher Connector
 * Description: Connects this WordPress site to WP Launcher for push/pull sync. Exposes a REST API for remote content sync operations.
 * Version: 1.1.7
 * Author: MSR Builds
 * License: GPL-2.0-or-later
 * Requires PHP: 7.4
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

define( 'WPL_CONNECTOR_VERSION', '1.1.7' );
define( 'WPL_CONNECTOR_FILE', __FILE__ );
define( 'WPL_CONNECTOR_DIR', plugin_dir_path( __FILE__ ) );

register_activation_hook( __FILE__, function () {
	if ( ! get_option( 'wpl_connector_api_key' ) ) {
		update_option( 'wpl_connector_api_key', wp_generate_password( 40, false ) );
	}
	$tmp = WPL_CONNECTOR_DIR . 'tmp';
	if ( ! is_dir( $tmp ) ) {
		wp_mkdir_p( $tmp );
		file_put_contents( $tmp . '/.htaccess', 'Deny from all' );
		file_put_contents( $tmp . '/index.php', '<?php // Silence is golden.' );
	}
} );

add_action( 'admin_menu', function () {
	add_management_page( 'WP Launcher Connector', 'WP Launcher Sync', 'manage_options', 'wpl-connector', 'wpl_connector_settings_page' );
} );

function wpl_connector_settings_page() {
	if ( ! current_user_can( 'manage_options' ) ) return;
	$regen_success = false;
	if ( isset( $_POST['wpl_regenerate_key'] ) && check_admin_referer( 'wpl_connector_regen' ) ) {
		update_option( 'wpl_connector_api_key', wp_generate_password( 40, false ) );
		$regen_success = true;
	}
	$api_key  = get_option( 'wpl_connector_api_key', '' );
	$site_url = get_site_url();

	$zip_ok  = class_exists( 'ZipArchive' );
	$phar_ok = class_exists( 'PharData' );
	$upload_size = ini_get( 'upload_max_filesize' );
	$post_size   = ini_get( 'post_max_size' );
	$exec_time   = ini_get( 'max_execution_time' );
	?>
	<style>
	.wpl-wrap { max-width: 680px; margin: 24px 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
	.wpl-header { background: linear-gradient(135deg, #1a1a2e 0%, #16213e 60%, #0f3460 100%); border-radius: 12px; padding: 28px 32px; margin-bottom: 20px; display: flex; align-items: center; gap: 20px; }
	.wpl-header-logo { width: 48px; height: 48px; background: rgba(255,255,255,0.12); border-radius: 10px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
	.wpl-header-logo svg { width: 28px; height: 28px; }
	.wpl-header-text h1 { color: #fff; margin: 0 0 4px; font-size: 20px; font-weight: 600; line-height: 1.2; }
	.wpl-header-text p { color: rgba(255,255,255,0.65); margin: 0; font-size: 13px; }
	.wpl-header-badge { margin-left: auto; background: rgba(255,255,255,0.12); color: rgba(255,255,255,0.85); font-size: 11px; font-weight: 500; padding: 4px 10px; border-radius: 20px; white-space: nowrap; }
	.wpl-card { background: #fff; border: 1px solid #e5e7eb; border-radius: 10px; padding: 24px 28px; margin-bottom: 16px; }
	.wpl-card-title { font-size: 14px; font-weight: 600; color: #111; margin: 0 0 18px; padding-bottom: 14px; border-bottom: 1px solid #f0f0f0; display: flex; align-items: center; gap: 8px; }
	.wpl-field { margin-bottom: 16px; }
	.wpl-field:last-of-type { margin-bottom: 0; }
	.wpl-field-label { font-size: 12px; font-weight: 600; color: #6b7280; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 6px; }
	.wpl-copy-row { display: flex; gap: 8px; align-items: stretch; }
	.wpl-copy-input { flex: 1; padding: 9px 12px; font-size: 13px; font-family: "SF Mono", "Fira Code", "Fira Mono", monospace; background: #f8f9fa; border: 1px solid #e5e7eb; border-radius: 6px; color: #374151; outline: none; cursor: text; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	.wpl-copy-btn { flex-shrink: 0; padding: 0 14px; font-size: 12px; font-weight: 500; background: #fff; border: 1px solid #d1d5db; border-radius: 6px; color: #374151; cursor: pointer; transition: all 0.15s; display: flex; align-items: center; gap: 5px; }
	.wpl-copy-btn:hover { background: #f3f4f6; border-color: #9ca3af; }
	.wpl-copy-btn.copied { background: #ecfdf5; border-color: #6ee7b7; color: #059669; }
	.wpl-copy-btn svg { width: 13px; height: 13px; }
	.wpl-regen-area { margin-top: 20px; padding-top: 18px; border-top: 1px solid #f0f0f0; display: flex; align-items: center; gap: 12px; }
	.wpl-regen-btn { padding: 8px 16px; font-size: 13px; background: #fff; border: 1px solid #d1d5db; border-radius: 6px; color: #374151; cursor: pointer; font-weight: 500; transition: all 0.15s; }
	.wpl-regen-btn:hover { background: #fef2f2; border-color: #fca5a5; color: #dc2626; }
	.wpl-regen-note { font-size: 12px; color: #9ca3af; }
	.wpl-req-list { list-style: none; margin: 0; padding: 0; }
	.wpl-req-list li { display: flex; align-items: center; justify-content: space-between; padding: 9px 0; border-bottom: 1px solid #f3f4f6; font-size: 13px; color: #374151; }
	.wpl-req-list li:last-child { border-bottom: none; padding-bottom: 0; }
	.wpl-req-list li:first-child { padding-top: 0; }
	.wpl-badge-ok { background: #ecfdf5; color: #059669; font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 4px; }
	.wpl-badge-warn { background: #fffbeb; color: #d97706; font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 4px; }
	.wpl-badge-err { background: #fef2f2; color: #dc2626; font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 4px; }
	.wpl-badge-info { background: #f0f9ff; color: #0369a1; font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 4px; }
	.wpl-notice { background: #ecfdf5; border: 1px solid #6ee7b7; border-radius: 8px; padding: 10px 14px; font-size: 13px; color: #065f46; margin-bottom: 16px; display: flex; align-items: center; gap: 8px; }
	</style>

	<div class="wpl-wrap">

		<?php if ( $regen_success ) : ?>
		<div class="wpl-notice">
			<svg width="16" height="16" fill="none" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="#059669"/><path d="M7 13l3 3 7-7" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
			API key regenerated. Update the connection in WP Launcher's Sync tab.
		</div>
		<?php endif; ?>

		<div class="wpl-header">
			<div class="wpl-header-logo">
				<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
					<rect x="2" y="3" width="9" height="9" rx="2" fill="rgba(255,255,255,0.9)"/>
					<rect x="13" y="3" width="9" height="9" rx="2" fill="rgba(255,255,255,0.5)"/>
					<rect x="2" y="14" width="9" height="9" rx="2" fill="rgba(255,255,255,0.5)"/>
					<rect x="13" y="14" width="9" height="9" rx="2" fill="rgba(255,255,255,0.9)"/>
				</svg>
			</div>
			<div class="wpl-header-text">
				<h1>WP Launcher Connector</h1>
				<p>Push &amp; pull site content between WP Launcher and this site</p>
			</div>
			<div class="wpl-header-badge">v<?php echo esc_html( WPL_CONNECTOR_VERSION ); ?></div>
		</div>

		<div class="wpl-card">
			<div class="wpl-card-title">
				<svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" stroke="#6b7280" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" stroke="#6b7280" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
				Connection Details
			</div>
			<p style="margin:0 0 18px;font-size:13px;color:#6b7280;">Copy these values into WP Launcher &rarr; Sync &rarr; Add Connection.</p>

			<div class="wpl-field">
				<div class="wpl-field-label">Site URL</div>
				<div class="wpl-copy-row">
					<input type="text" class="wpl-copy-input" id="wpl-site-url" value="<?php echo esc_attr( $site_url ); ?>" readonly>
					<button type="button" class="wpl-copy-btn" data-target="wpl-site-url">
						<svg viewBox="0 0 24 24" fill="none"><rect x="9" y="9" width="13" height="13" rx="2" stroke="currentColor" stroke-width="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" stroke="currentColor" stroke-width="2"/></svg>
						Copy
					</button>
				</div>
			</div>

			<div class="wpl-field">
				<div class="wpl-field-label">API Key</div>
				<div class="wpl-copy-row">
					<input type="text" class="wpl-copy-input" id="wpl-api-key" value="<?php echo esc_attr( $api_key ); ?>" readonly>
					<button type="button" class="wpl-copy-btn" data-target="wpl-api-key">
						<svg viewBox="0 0 24 24" fill="none"><rect x="9" y="9" width="13" height="13" rx="2" stroke="currentColor" stroke-width="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" stroke="currentColor" stroke-width="2"/></svg>
						Copy
					</button>
				</div>
			</div>

			<div class="wpl-regen-area">
				<form method="post" style="margin:0;">
					<?php wp_nonce_field( 'wpl_connector_regen' ); ?>
					<button type="submit" name="wpl_regenerate_key" class="wpl-regen-btn" onclick="return confirm('Regenerate the API key? Any existing WP Launcher connection to this site will need to be updated.');">
						&#8635; Regenerate Key
					</button>
				</form>
				<span class="wpl-regen-note">Invalidates the current key immediately.</span>
			</div>
		</div>

		<div class="wpl-card">
			<div class="wpl-card-title">
				<svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M9 12l2 2 4-4" stroke="#6b7280" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M12 2a10 10 0 100 20A10 10 0 0012 2z" stroke="#6b7280" stroke-width="2"/></svg>
				Server Requirements
			</div>
			<ul class="wpl-req-list">
				<li>
					<span>ZipArchive</span>
					<?php if ( $zip_ok ) : ?>
						<span class="wpl-badge-ok">Available</span>
					<?php else : ?>
						<span class="wpl-badge-err">Missing — required for sync</span>
					<?php endif; ?>
				</li>
				<li>
					<span>PharData</span>
					<?php if ( $phar_ok ) : ?>
						<span class="wpl-badge-ok">Available</span>
					<?php else : ?>
						<span class="wpl-badge-warn">Not available</span>
					<?php endif; ?>
				</li>
				<li>
					<span>Upload Max Filesize</span>
					<span class="wpl-badge-info"><?php echo esc_html( $upload_size ); ?></span>
				</li>
				<li>
					<span>Post Max Size</span>
					<span class="wpl-badge-info"><?php echo esc_html( $post_size ); ?></span>
				</li>
				<li>
					<span>Max Execution Time</span>
					<span class="wpl-badge-info"><?php echo esc_html( $exec_time ); ?>s</span>
				</li>
			</ul>
		</div>

	</div>

	<script>
	document.addEventListener('DOMContentLoaded', function () {
		document.querySelectorAll('.wpl-copy-btn').forEach(function (btn) {
			btn.addEventListener('click', function () {
				var input = document.getElementById(btn.getAttribute('data-target'));
				if (!input) return;
				navigator.clipboard.writeText(input.value.trim()).then(function () {
					btn.classList.add('copied');
					btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" width="13" height="13"><path d="M5 13l4 4L19 7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg> Copied!';
					setTimeout(function () {
						btn.classList.remove('copied');
						btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" width="13" height="13"><rect x="9" y="9" width="13" height="13" rx="2" stroke="currentColor" stroke-width="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" stroke="currentColor" stroke-width="2"/></svg> Copy';
					}, 2000);
				});
			});
		});
	});
	</script>
	<?php
}

function wpl_connector_authenticate( $request ) {
	// Try header first (standard path)
	$key = $request->get_header( 'X-WPL-Key' );
	if ( ! $key ) $key = $request->get_header( 'X_WPL_Key' );
	// Fallback: query param — some hosts strip custom headers on binary (octet-stream) uploads
	if ( ! $key && ! empty( $_GET['_wpl_key'] ) ) $key = sanitize_text_field( $_GET['_wpl_key'] );
	$stored = get_option( 'wpl_connector_api_key', '' );
	if ( ! $key || ! $stored || ! hash_equals( $stored, $key ) ) {
		return new WP_Error( 'unauthorized', 'Invalid or missing API key', array( 'status' => 401 ) );
	}
	return true;
}

add_action( 'rest_api_init', function () {
	$auth = 'wpl_connector_authenticate';
	// Full sync (legacy)
	register_rest_route( 'wpl-connector/v1', '/status', array( 'methods' => 'GET', 'callback' => 'wpl_connector_status', 'permission_callback' => $auth ) );
	register_rest_route( 'wpl-connector/v1', '/export', array( 'methods' => 'POST', 'callback' => 'wpl_connector_export', 'permission_callback' => $auth ) );
	register_rest_route( 'wpl-connector/v1', '/export/(?P<id>[a-zA-Z0-9_-]+)', array( 'methods' => 'GET', 'callback' => 'wpl_connector_download', 'permission_callback' => $auth ) );
	register_rest_route( 'wpl-connector/v1', '/import', array( 'methods' => 'POST', 'callback' => 'wpl_connector_import', 'permission_callback' => $auth ) );
	// Chunked upload
	register_rest_route( 'wpl-connector/v1', '/upload-chunk', array( 'methods' => 'POST', 'callback' => 'wpl_connector_upload_chunk', 'permission_callback' => $auth ) );
	register_rest_route( 'wpl-connector/v1', '/finalize-import', array( 'methods' => 'POST', 'callback' => 'wpl_connector_finalize_import', 'permission_callback' => $auth ) );
	// Incremental sync
	register_rest_route( 'wpl-connector/v1', '/manifest', array( 'methods' => 'GET', 'callback' => 'wpl_connector_manifest', 'permission_callback' => $auth ) );
	register_rest_route( 'wpl-connector/v1', '/export-content', array( 'methods' => 'POST', 'callback' => 'wpl_connector_export_content', 'permission_callback' => $auth ) );
	register_rest_route( 'wpl-connector/v1', '/import-content', array( 'methods' => 'POST', 'callback' => 'wpl_connector_import_content', 'permission_callback' => $auth ) );
	register_rest_route( 'wpl-connector/v1', '/export-files', array( 'methods' => 'POST', 'callback' => 'wpl_connector_export_files', 'permission_callback' => $auth ) );
	register_rest_route( 'wpl-connector/v1', '/import-files', array( 'methods' => 'POST', 'callback' => 'wpl_connector_import_files', 'permission_callback' => $auth ) );
} );

function wpl_connector_status() {
	$theme = wp_get_theme();
	return rest_ensure_response( array(
		'status' => 'connected', 'version' => WPL_CONNECTOR_VERSION, 'wp_version' => get_bloginfo('version'),
		'php_version' => phpversion(), 'site_url' => get_site_url(), 'site_name' => get_bloginfo('name'),
		'theme' => $theme->get('Name'), 'plugins' => count(get_option('active_plugins',array())),
		'db_engine' => defined('DB_ENGINE') && DB_ENGINE === 'sqlite' ? 'sqlite' : 'mysql',
		'multisite' => is_multisite(), 'zip' => class_exists('ZipArchive'), 'phar' => class_exists('PharData'),
	) );
}

function wpl_connector_export( $request ) {
	@set_time_limit(300); @ini_set('memory_limit','512M');
	if ( ! class_exists('ZipArchive') ) return new WP_Error('missing_zip','ZipArchive required',array('status'=>500));

	$export_id = 'wpl-export-' . wp_generate_password(12,false,false);
	$tmp_dir = WPL_CONNECTOR_DIR . 'tmp'; wp_mkdir_p($tmp_dir);
	$zip_path = $tmp_dir . '/' . $export_id . '.zip';
	$sql_path = $tmp_dir . '/' . $export_id . '.sql';

	try {
		wpl_export_database($sql_path);
		$db_size = filesize($sql_path);
		$zip = new ZipArchive();
		if ( $zip->open($zip_path, ZipArchive::CREATE|ZipArchive::OVERWRITE) !== true ) throw new Exception('Could not create ZIP');
		$zip->addFile($sql_path, 'database.sql');

		$skip_dirs = array('cache','upgrade','mu-plugins','wflogs');
		$skip_files = array('.DS_Store','Thumbs.db','debug.log','error_log');
		$wpc = WP_CONTENT_DIR;
		$it = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($wpc, RecursiveDirectoryIterator::SKIP_DOTS), RecursiveIteratorIterator::SELF_FIRST);
		$fc = 0;
		foreach ( $it as $file ) {
			$rel = str_replace('\\','/',substr($file->getPathname(),strlen($wpc)+1));
			$parts = explode('/',$rel); $skip = false;
			foreach ($skip_dirs as $sd) { if ($parts[0]===$sd) { $skip=true; break; } }
			if ($skip) continue;
			if (in_array(basename($rel),$skip_files,true)) continue;
			if (strpos($rel,'plugins/wp-launcher-connector/tmp')===0) continue;
			if ($file->isDir()) { $zip->addEmptyDir('wp-content/'.$rel); }
			else { if ($file->getSize()>100*1024*1024) continue; $zip->addFile($file->getPathname(),'wp-content/'.$rel); $fc++; }
		}
		$zip->close(); @unlink($sql_path);
		wp_schedule_single_event(time()+1800,'wpl_cleanup_export',array($export_id));
		return rest_ensure_response(array('exportId'=>$export_id,'sizeBytes'=>filesize($zip_path),'dbSize'=>$db_size,'files'=>$fc,'format'=>'zip','siteUrl'=>get_site_url()));
	} catch (Exception $e) { @unlink($sql_path); @unlink($zip_path); return new WP_Error('export_failed',$e->getMessage(),array('status'=>500)); }
}

function wpl_connector_download( $request ) {
	$id = sanitize_file_name($request->get_param('id'));
	$path = WPL_CONNECTOR_DIR . 'tmp/' . $id . '.zip';
	if (!file_exists($path)) return new WP_Error('not_found','Export not found',array('status'=>404));
	header('Content-Type: application/zip'); header('Content-Length: '.filesize($path));
	header('Content-Disposition: attachment; filename='.$id.'.zip');
	readfile($path); @unlink($path); exit;
}

function wpl_connector_import( $request, $archive_file = null ) {
	@set_time_limit(600); @ini_set('memory_limit','512M');
	$tmp_dir = WPL_CONNECTOR_DIR . 'tmp';
	$import_dir = $tmp_dir . '/wpl-import-' . wp_generate_password(8,false,false);
	wp_mkdir_p($import_dir);

	try {
		// If a pre-assembled archive file is provided (from chunked upload), use it directly
		if ( $archive_file && file_exists( $archive_file ) ) {
			$body = null;
			$is_tar = true;
			$archive_path = $archive_file;
		} else {
			$body = $request->get_body();
			if (empty($body)) $body = file_get_contents('php://input');
			if (empty($body)) throw new Exception('Empty request body');
		}

		if ( $body !== null ) {
			$is_tar = (substr($body,0,4) !== "PK\x03\x04");
			$archive_path = $import_dir . '/import' . ($is_tar ? '.tar' : '.zip');
			file_put_contents($archive_path, $body); unset($body);
		}

		$extract_dir = $import_dir . '/extracted'; wp_mkdir_p($extract_dir);

		error_log('[WPL Connector] Archive: path=' . $archive_path . ' size=' . filesize($archive_path) . ' is_tar=' . ($is_tar ? 'yes' : 'no'));

		if ($is_tar) {
			if (!class_exists('PharData')) throw new Exception('PharData required for tar import');
			// Ensure file has .tar extension (PharData requires it)
			if (substr($archive_path, -4) !== '.tar') {
				$tar_path = $archive_path . '.tar';
				rename($archive_path, $tar_path);
				$archive_path = $tar_path;
			}
			try {
				$phar = new PharData($archive_path);
				$phar->extractTo($extract_dir);
			} catch (Exception $e) {
				error_log('[WPL Connector] PharData extractTo failed: ' . $e->getMessage());
				// Fallback: try shell tar command
				$cmd = 'tar xf ' . escapeshellarg($archive_path) . ' -C ' . escapeshellarg($extract_dir) . ' 2>&1';
				$output = shell_exec($cmd);
				error_log('[WPL Connector] tar fallback output: ' . ($output ?: 'OK'));
			}
		} else {
			if (!class_exists('ZipArchive')) throw new Exception('ZipArchive required');
			$zip = new ZipArchive();
			if ($zip->open($archive_path) !== true) throw new Exception('Could not open ZIP');
			$zip->extractTo($extract_dir); $zip->close();
		}
		@unlink($archive_path);

		// Log extracted contents for debugging
		$extracted_items = @scandir($extract_dir) ?: array();
		error_log('[WPL Connector] Extracted top-level: ' . implode(', ', $extracted_items));
		if (is_dir($extract_dir . '/wp-content')) {
			error_log('[WPL Connector] wp-content contents: ' . implode(', ', array_slice(@scandir($extract_dir . '/wp-content') ?: array(), 0, 20)));
		}

		$source_wpc = is_dir($extract_dir.'/wp-content') ? $extract_dir.'/wp-content' : $extract_dir;

		// Find SQL file — check multiple possible locations
		$sql_file = null;
		$sql_candidates = array(
			$extract_dir.'/database.sql',
			$source_wpc.'/db-snapshot.sql',
			$extract_dir.'/db-snapshot.sql',
		);
		foreach ($sql_candidates as $c) {
			if (file_exists($c)) { $sql_file = $c; break; }
		}

		error_log('[WPL Connector] Import: tar=' . ($is_tar?'yes':'no') . ' sql=' . ($sql_file ? basename($sql_file) : 'NONE') . ' extract_dir contents: ' . implode(', ', @scandir($extract_dir)));
		if ($source_wpc !== $extract_dir) {
			error_log('[WPL Connector] wp-content contents: ' . implode(', ', array_slice(@scandir($source_wpc), 0, 20)));
		}

		// Save current site URL and API key BEFORE any DB changes
		$current_url = get_site_url();
		$current_api_key = get_option( 'wpl_connector_api_key', '' );
		$source_url = null;
		$db_imported = false;

		// Source URL from: 1) query param (most reliable), 2) header, 3) SQL detection
		$explicit_source = '';
		if (!empty($_GET['source_url'])) {
			$explicit_source = trim($_GET['source_url']);
		} elseif (!empty($request->get_param('source_url'))) {
			$explicit_source = trim($request->get_param('source_url'));
		} elseif (isset($_SERVER['HTTP_X_WPL_SOURCE_URL'])) {
			$explicit_source = trim($_SERVER['HTTP_X_WPL_SOURCE_URL']);
		}
		error_log('[WPL Connector] explicit_source=' . ($explicit_source ?: 'NONE') . ' current_url=' . $current_url);

		if ($sql_file) {
			// Try explicit query param first (most reliable)
			if ($explicit_source && filter_var($explicit_source, FILTER_VALIDATE_URL)) {
				$source_url = rtrim($explicit_source, '/');
			}

			// Fallback: detect from SQL dump
			if (!$source_url) {
				$preview = file_get_contents($sql_file, false, null, 0, 100000);
				if (preg_match("/['\"]siteurl['\"]\\s*,\\s*['\"]?(https?:\\/\\/[^'\"\\s]+)/i", $preview, $m)) {
					$source_url = rtrim($m[1], "'\"/");
				}
			}

			error_log('[WPL Connector] Import: sql=' . basename($sql_file) . ' size=' . filesize($sql_file) . ' source_url=' . ($source_url ?: 'UNKNOWN') . ' target_url=' . $current_url);

			// KEY FIX: Replace URLs in the SQL file BEFORE importing
			// This prevents the database from ever having wrong URLs
			if ($source_url && $source_url !== $current_url) {
				error_log('[WPL Connector] Pre-processing SQL: replacing URLs before import');
				$sql_content = file_get_contents($sql_file);
				$sql_content = str_replace($source_url, $current_url, $sql_content);
				// Also replace http/https variants
				$source_http = preg_replace('/^https:/', 'http:', $source_url);
				$source_https = preg_replace('/^http:/', 'https:', $source_url);
				if ($source_http !== $source_url) $sql_content = str_replace($source_http, $current_url, $sql_content);
				if ($source_https !== $source_url) $sql_content = str_replace($source_https, $current_url, $sql_content);
				file_put_contents($sql_file, $sql_content);
				unset($sql_content);
				error_log('[WPL Connector] SQL pre-processed, new size=' . filesize($sql_file));
			}

			// Import the (already URL-corrected) database
			wpl_import_database($sql_file);
			$db_imported = true;

			// CRITICAL: raw SQL import bypasses WP object cache entirely.
			// Flush now so every get_option() below reads fresh from DB.
			global $wpdb;
			wp_cache_delete( 'alloptions', 'options' );
			wp_cache_delete( 'notoptions', 'options' );

			// Force correct URLs via direct SQL
			$wpdb->query($wpdb->prepare("UPDATE {$wpdb->options} SET option_value = %s WHERE option_name = 'siteurl'", $current_url));
			$wpdb->query($wpdb->prepare("UPDATE {$wpdb->options} SET option_value = %s WHERE option_name = 'home'", $current_url));

			// Restore API key using direct SQL — local DB won't have this option,
			// and get_option() cache is unreliable after a raw import.
			if ( $current_api_key ) {
				$wpdb->query( $wpdb->prepare(
					"INSERT INTO {$wpdb->options} (option_name, option_value, autoload) VALUES ('wpl_connector_api_key', %s, 'yes') ON DUPLICATE KEY UPDATE option_value = VALUES(option_value)",
					$current_api_key
				) );
				wp_cache_delete( 'wpl_connector_api_key', 'options' );
				error_log('[WPL Connector] API key restored');
			}

			// Ensure connector stays in active_plugins.
			// Read DIRECTLY from DB — the in-memory cache has pre-import data and cannot be trusted.
			$connector_file = 'wp-launcher-connector/wp-launcher-connector.php';
			$active_raw = $wpdb->get_var( "SELECT option_value FROM {$wpdb->options} WHERE option_name = 'active_plugins'" );
			$active_plugins = $active_raw ? maybe_unserialize( $active_raw ) : array();
			if ( ! is_array( $active_plugins ) ) $active_plugins = array();
			if ( ! in_array( $connector_file, $active_plugins, true ) ) {
				$active_plugins[] = $connector_file;
				$wpdb->query( $wpdb->prepare(
					"UPDATE {$wpdb->options} SET option_value = %s WHERE option_name = 'active_plugins'",
					serialize( $active_plugins )
				) );
				wp_cache_delete( 'active_plugins', 'options' );
				error_log('[WPL Connector] Connector re-added to active_plugins');
			}

			error_log('[WPL Connector] Post-import restore complete: url=' . $current_url);
		} else {
			error_log('[WPL Connector] CRITICAL: No SQL file found! Aborting to prevent URL corruption.');
			error_log('[WPL Connector] extract_dir contents: ' . implode(', ', @scandir($extract_dir) ?: array()));
			if (is_dir($source_wpc)) {
				error_log('[WPL Connector] wp-content contents: ' . implode(', ', array_slice(@scandir($source_wpc) ?: array(), 0, 30)));
			}
			wpl_recursive_delete($import_dir);
			return new WP_Error('no_database', 'No database file found in snapshot. Push aborted to protect site URLs.', array('status' => 400));
		}

		// ── File sync: local is the source of truth ───────────────────────────────
		// Copy themes, uploads, and everything else first
		$skip = array('mu-plugins','cache','upgrade','db-snapshot.sql','database.sql','wp-launcher-connector','plugins');
		wpl_recursive_copy($source_wpc, WP_CONTENT_DIR, $skip);

		// Plugin sync: clean replace each plugin from source.
		// Deleting the destination folder before copying prevents partial-overwrite
		// class-not-found errors when the local and remote have different plugin versions.
		// The connector plugin is always preserved.
		$src_plugins_dir = $source_wpc . '/plugins';
		$dst_plugins_dir = WP_CONTENT_DIR . '/plugins';
		$synced_plugins  = array();
		if ( is_dir( $src_plugins_dir ) ) {
			$items = @scandir( $src_plugins_dir ) ?: array();
			foreach ( $items as $item ) {
				if ( $item === '.' || $item === '..' || $item === 'wp-launcher-connector' ) continue;
				$src_dir = $src_plugins_dir . '/' . $item;
				$dst_dir = $dst_plugins_dir . '/' . $item;
				if ( ! is_dir( $src_dir ) ) continue;

				// Clean replace: remove remote copy first to avoid mixed-version files
				if ( is_dir( $dst_dir ) ) {
					wpl_recursive_delete( $dst_dir );
				}
				wpl_recursive_copy( $src_dir, $dst_dir, array() );
				$synced_plugins[] = $item;
				error_log( '[WPL Connector] Synced plugin: ' . $item );
			}
		}

		wpl_recursive_delete($import_dir);
		wp_cache_flush();
		if (function_exists('opcache_reset')) @opcache_reset();

		return rest_ensure_response(array(
			'status'        => 'restored',
			'siteUrl'       => $current_url,
			'sourceUrl'     => $source_url,
			'dbImported'    => $db_imported,
			'pluginsSynced' => $synced_plugins,
		));
	} catch (Exception $e) {
		error_log('[WPL Connector] Import error: ' . $e->getMessage());
		wpl_recursive_delete($import_dir);
		return new WP_Error('import_failed', $e->getMessage(), array('status'=>500));
	}
}

// ─── Chunked Upload ───
// Receives file chunks and reassembles them, then triggers the same import logic.
// This avoids nginx/PHP upload size limits for large snapshots.

function wpl_connector_upload_chunk( $request ) {
	@set_time_limit(120);
	$tmp_dir = WPL_CONNECTOR_DIR . 'tmp';

	$upload_id = sanitize_file_name( isset($_SERVER['HTTP_X_UPLOAD_ID']) ? $_SERVER['HTTP_X_UPLOAD_ID'] : ($request->get_param('upload_id') ?: '') );
	$chunk_index = intval( isset($_SERVER['HTTP_X_CHUNK_INDEX']) ? $_SERVER['HTTP_X_CHUNK_INDEX'] : $request->get_param('chunk_index') );
	$total_chunks = intval( isset($_SERVER['HTTP_X_TOTAL_CHUNKS']) ? $_SERVER['HTTP_X_TOTAL_CHUNKS'] : $request->get_param('total_chunks') );

	if ( ! $upload_id || $total_chunks < 1 ) {
		return new WP_Error( 'invalid_params', 'upload_id and total_chunks are required', array( 'status' => 400 ) );
	}

	$chunk_dir = $tmp_dir . '/chunks-' . $upload_id;
	wp_mkdir_p( $chunk_dir );

	$body = $request->get_body();
	if ( empty( $body ) ) $body = file_get_contents( 'php://input' );
	if ( empty( $body ) ) {
		return new WP_Error( 'empty_chunk', 'Empty chunk body', array( 'status' => 400 ) );
	}

	file_put_contents( $chunk_dir . '/chunk-' . str_pad( $chunk_index, 5, '0', STR_PAD_LEFT ), $body );
	unset( $body );

	// Count received chunks
	$received = count( glob( $chunk_dir . '/chunk-*' ) );

	return rest_ensure_response( array(
		'received' => $received,
		'total'    => $total_chunks,
		'complete' => $received >= $total_chunks,
	) );
}

function wpl_connector_finalize_import( $request ) {
	@set_time_limit(600); @ini_set('memory_limit','512M');
	$tmp_dir = WPL_CONNECTOR_DIR . 'tmp';

	$upload_id = sanitize_file_name( $request->get_param('upload_id') ?: '' );
	$total_chunks = intval( $request->get_param('total_chunks') );
	$source_url = $request->get_param('source_url') ?: '';

	if ( ! $upload_id ) {
		return new WP_Error( 'invalid_params', 'upload_id is required', array( 'status' => 400 ) );
	}

	$chunk_dir = $tmp_dir . '/chunks-' . $upload_id;
	$received = count( glob( $chunk_dir . '/chunk-*' ) );
	if ( $received < $total_chunks ) {
		return new WP_Error( 'incomplete', "Only $received of $total_chunks chunks received", array( 'status' => 400 ) );
	}

	// Reassemble chunks into a single archive file
	$archive_path = $tmp_dir . '/assembled-' . $upload_id . '.tar';
	$out = fopen( $archive_path, 'wb' );
	if ( ! $out ) {
		return new WP_Error( 'write_error', 'Cannot create assembled file', array( 'status' => 500 ) );
	}

	$chunk_files = glob( $chunk_dir . '/chunk-*' );
	sort( $chunk_files ); // ensures correct order (zero-padded names)
	foreach ( $chunk_files as $cf ) {
		$data = file_get_contents( $cf );
		fwrite( $out, $data );
		unset( $data );
	}
	fclose( $out );
	wpl_recursive_delete( $chunk_dir );

	$archive_size = filesize( $archive_path );
	error_log( '[WPL Connector] Reassembled ' . $received . ' chunks into ' . $archive_size . ' bytes' );

	// Pass the assembled file directly to the import function (zero-copy, no memory issues)
	if ( $source_url ) {
		$_GET['source_url'] = $source_url;
	}
	$include_plugins = $request->get_param('include_plugins');
	if ( $include_plugins ) {
		$_GET['include_plugins'] = '1';
	}

	$fake_request = new WP_REST_Request( 'POST' );
	return wpl_connector_import( $fake_request, $archive_path );
}

// ─── Incremental Sync: Manifest ───

function wpl_connector_manifest( $request ) {
	@set_time_limit(120);

	$content = array();
	$posts = get_posts(array('post_type' => 'any', 'post_status' => 'any', 'numberposts' => -1, 'suppress_filters' => true));
	foreach ($posts as $p) {
		if ($p->post_type === 'revision' || $p->post_type === 'auto-draft') continue;
		$content[] = array(
			'id' => (int)$p->ID,
			'title' => $p->post_title,
			'type' => $p->post_type,
			'status' => $p->post_status,
			'modified_gmt' => $p->post_modified_gmt,
			'slug' => $p->post_name,
		);
	}

	// File manifest: plugins, themes, uploads — directories only at top level, individual files for uploads
	$files = array();
	$wpc = WP_CONTENT_DIR;
	$skip = array('cache','upgrade','mu-plugins','wflogs','wp-launcher-connector','database');

	// Plugins — each plugin dir as a unit
	$plugins_dir = $wpc . '/plugins';
	if (is_dir($plugins_dir)) {
		foreach (scandir($plugins_dir) as $entry) {
			if ($entry === '.' || $entry === '..' || in_array($entry, $skip)) continue;
			$full = $plugins_dir . '/' . $entry;
			if (is_dir($full)) {
				$size = 0; $latest = 0;
				$it = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($full, RecursiveDirectoryIterator::SKIP_DOTS));
				foreach ($it as $f) { if ($f->isFile()) { $size += $f->getSize(); $latest = max($latest, $f->getMTime()); } }
				$files[] = array('path' => 'plugins/' . $entry, 'size' => $size, 'mtime' => $latest, 'type' => 'directory');
			} else {
				$files[] = array('path' => 'plugins/' . $entry, 'size' => filesize($full), 'mtime' => filemtime($full), 'type' => 'file');
			}
		}
	}

	// Themes — each theme dir as a unit
	$themes_dir = $wpc . '/themes';
	if (is_dir($themes_dir)) {
		foreach (scandir($themes_dir) as $entry) {
			if ($entry === '.' || $entry === '..') continue;
			$full = $themes_dir . '/' . $entry;
			if (is_dir($full)) {
				$size = 0; $latest = 0;
				$it = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($full, RecursiveDirectoryIterator::SKIP_DOTS));
				foreach ($it as $f) { if ($f->isFile()) { $size += $f->getSize(); $latest = max($latest, $f->getMTime()); } }
				$files[] = array('path' => 'themes/' . $entry, 'size' => $size, 'mtime' => $latest, 'type' => 'directory');
			}
		}
	}

	// Uploads — individual files (limit to first 5000 to avoid timeout)
	$uploads_dir = $wpc . '/uploads';
	if (is_dir($uploads_dir)) {
		$count = 0;
		$it = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($uploads_dir, RecursiveDirectoryIterator::SKIP_DOTS));
		foreach ($it as $f) {
			if (!$f->isFile()) continue;
			if ($count++ >= 5000) break;
			$rel = 'uploads/' . str_replace('\\', '/', substr($f->getPathname(), strlen($uploads_dir) + 1));
			$files[] = array('path' => $rel, 'size' => $f->getSize(), 'mtime' => $f->getMTime(), 'type' => 'file');
		}
	}

	return rest_ensure_response(array(
		'generated_at' => gmdate('Y-m-d\TH:i:s\Z'),
		'site_url' => get_site_url(),
		'content' => $content,
		'files' => $files,
	));
}

// ─── Incremental Sync: Export Content ───

function wpl_connector_export_content( $request ) {
	$post_ids = $request->get_param('postIds');
	if (!is_array($post_ids) || empty($post_ids)) {
		return new WP_Error('invalid_params', 'postIds array is required', array('status' => 400));
	}

	$result = array();
	foreach ($post_ids as $pid) {
		$post = get_post((int)$pid);
		if (!$post) continue;

		$meta = get_post_meta($post->ID);
		$clean_meta = array();
		foreach ($meta as $key => $values) {
			// Skip internal/cache meta
			if (strpos($key, '_transient') === 0 || strpos($key, '_edit_') === 0) continue;
			$clean_meta[$key] = count($values) === 1 ? $values[0] : $values;
		}

		$taxonomies = array();
		$tax_names = get_object_taxonomies($post->post_type);
		foreach ($tax_names as $tax) {
			$terms = wp_get_object_terms($post->ID, $tax, array('fields' => 'names'));
			if (!empty($terms) && !is_wp_error($terms)) $taxonomies[$tax] = $terms;
		}

		// Get featured image URL
		$thumbnail_url = '';
		$thumb_id = get_post_thumbnail_id($post->ID);
		if ($thumb_id) $thumbnail_url = wp_get_attachment_url($thumb_id);

		$result[] = array(
			'ID' => $post->ID,
			'post_title' => $post->post_title,
			'post_content' => $post->post_content,
			'post_excerpt' => $post->post_excerpt,
			'post_type' => $post->post_type,
			'post_status' => $post->post_status,
			'post_name' => $post->post_name,
			'post_date' => $post->post_date,
			'post_date_gmt' => $post->post_date_gmt,
			'post_modified' => $post->post_modified,
			'post_modified_gmt' => $post->post_modified_gmt,
			'post_parent' => $post->post_parent,
			'menu_order' => $post->menu_order,
			'comment_status' => $post->comment_status,
			'ping_status' => $post->ping_status,
			'meta' => $clean_meta,
			'taxonomies' => $taxonomies,
			'thumbnail_url' => $thumbnail_url,
			'guid' => $post->guid,
			'site_url' => get_site_url(),
		);
	}

	return rest_ensure_response(array('posts' => $result, 'site_url' => get_site_url()));
}

// ─── Incremental Sync: Import Content ───

function wpl_connector_import_content( $request ) {
	$posts = $request->get_param('posts');
	$source_url = $request->get_param('source_url') ?: '';
	if (!is_array($posts) || empty($posts)) {
		return new WP_Error('invalid_params', 'posts array is required', array('status' => 400));
	}

	$current_url = get_site_url();
	$imported = 0;
	$errors = array();

	foreach ($posts as $post_data) {
		try {
			// URL replacement in content
			$content = $post_data['post_content'] ?? '';
			$excerpt = $post_data['post_excerpt'] ?? '';
			if ($source_url && $source_url !== $current_url) {
				$content = str_replace($source_url, $current_url, $content);
				$excerpt = str_replace($source_url, $current_url, $excerpt);
			}

			// Check if post exists by slug + type
			$existing = get_page_by_path($post_data['post_name'], OBJECT, $post_data['post_type']);

			$args = array(
				'post_title' => $post_data['post_title'],
				'post_content' => $content,
				'post_excerpt' => $excerpt,
				'post_type' => $post_data['post_type'],
				'post_status' => $post_data['post_status'],
				'post_name' => $post_data['post_name'],
				'post_parent' => (int)($post_data['post_parent'] ?? 0),
				'menu_order' => (int)($post_data['menu_order'] ?? 0),
				'comment_status' => $post_data['comment_status'] ?? 'closed',
				'ping_status' => $post_data['ping_status'] ?? 'closed',
			);

			if ($existing) {
				$args['ID'] = $existing->ID;
				$result = wp_update_post($args, true);
			} else {
				$result = wp_insert_post($args, true);
			}

			if (is_wp_error($result)) {
				$errors[] = $post_data['post_title'] . ': ' . $result->get_error_message();
				continue;
			}

			$post_id = (int)$result;

			// Import meta
			if (!empty($post_data['meta']) && is_array($post_data['meta'])) {
				foreach ($post_data['meta'] as $key => $value) {
					if (strpos($key, '_transient') === 0) continue;
					$val = $value;
					if ($source_url && $source_url !== $current_url && is_string($val)) {
						$val = str_replace($source_url, $current_url, $val);
					}
					update_post_meta($post_id, $key, maybe_unserialize($val));
				}
			}

			// Import taxonomies
			if (!empty($post_data['taxonomies']) && is_array($post_data['taxonomies'])) {
				foreach ($post_data['taxonomies'] as $tax => $terms) {
					if (taxonomy_exists($tax)) {
						wp_set_object_terms($post_id, $terms, $tax);
					}
				}
			}

			$imported++;
		} catch (Exception $e) {
			$errors[] = ($post_data['post_title'] ?? 'unknown') . ': ' . $e->getMessage();
		}
	}

	return rest_ensure_response(array(
		'imported' => $imported,
		'errors' => $errors,
		'total' => count($posts),
	));
}

// ─── Incremental Sync: Export Files ───

function wpl_connector_export_files( $request ) {
	@set_time_limit(120);
	$paths = $request->get_param('paths');
	if (!is_array($paths) || empty($paths)) {
		return new WP_Error('invalid_params', 'paths array is required', array('status' => 400));
	}

	if (!class_exists('ZipArchive')) {
		return new WP_Error('missing_zip', 'ZipArchive required', array('status' => 500));
	}

	$export_id = 'wpl-files-' . wp_generate_password(12, false, false);
	$tmp_dir = WPL_CONNECTOR_DIR . 'tmp';
	wp_mkdir_p($tmp_dir);
	$zip_path = $tmp_dir . '/' . $export_id . '.zip';

	$zip = new ZipArchive();
	if ($zip->open($zip_path, ZipArchive::CREATE | ZipArchive::OVERWRITE) !== true) {
		return new WP_Error('zip_failed', 'Could not create ZIP', array('status' => 500));
	}

	$wpc = WP_CONTENT_DIR;
	$file_count = 0;

	foreach ($paths as $rel_path) {
		$rel_path = ltrim(str_replace('\\', '/', $rel_path), '/');
		// Security: prevent path traversal
		if (strpos($rel_path, '..') !== false) continue;
		$full_path = $wpc . '/' . $rel_path;

		if (is_dir($full_path)) {
			$it = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($full_path, RecursiveDirectoryIterator::SKIP_DOTS), RecursiveIteratorIterator::SELF_FIRST);
			foreach ($it as $item) {
				$item_rel = $rel_path . '/' . str_replace('\\', '/', substr($item->getPathname(), strlen($full_path) + 1));
				if ($item->isDir()) { $zip->addEmptyDir($item_rel); }
				else { $zip->addFile($item->getPathname(), $item_rel); $file_count++; }
			}
		} elseif (is_file($full_path)) {
			$zip->addFile($full_path, $rel_path);
			$file_count++;
		}
	}

	$zip->close();
	wp_schedule_single_event(time() + 1800, 'wpl_cleanup_export', array($export_id));

	return rest_ensure_response(array(
		'exportId' => $export_id,
		'sizeBytes' => filesize($zip_path),
		'files' => $file_count,
	));
}

// ─── Incremental Sync: Import Files ───

function wpl_connector_import_files( $request ) {
	@set_time_limit(120);
	$body = $request->get_body();
	if (empty($body)) $body = file_get_contents('php://input');
	if (empty($body)) return new WP_Error('empty_body', 'No file data received', array('status' => 400));

	$tmp_dir = WPL_CONNECTOR_DIR . 'tmp';
	$import_dir = $tmp_dir . '/wpl-files-' . wp_generate_password(8, false, false);
	wp_mkdir_p($import_dir);

	try {
		$zip_path = $import_dir . '/files.zip';
		file_put_contents($zip_path, $body);
		unset($body);

		if (!class_exists('ZipArchive')) throw new Exception('ZipArchive required');
		$zip = new ZipArchive();
		if ($zip->open($zip_path) !== true) throw new Exception('Invalid ZIP');
		$zip->extractTo($import_dir . '/extracted');
		$zip->close();
		@unlink($zip_path);

		// Copy extracted files to wp-content, skipping connector plugin
		$skip = array('mu-plugins', 'cache', 'wp-launcher-connector');
		wpl_recursive_copy($import_dir . '/extracted', WP_CONTENT_DIR, $skip);
		wpl_recursive_delete($import_dir);

		return rest_ensure_response(array('status' => 'ok'));
	} catch (Exception $e) {
		wpl_recursive_delete($import_dir);
		return new WP_Error('import_failed', $e->getMessage(), array('status' => 500));
	}
}

add_action('wpl_cleanup_export', function($id) { $p = WPL_CONNECTOR_DIR.'tmp/'.sanitize_file_name($id).'.zip'; if(file_exists($p)) @unlink($p); });

function wpl_export_database( $output_file ) {
	global $wpdb;
	$h = fopen($output_file,'w');
	if (!$h) throw new Exception('Could not create SQL file');
	fwrite($h, "-- WP Launcher Connector DB Export\n-- Site: ".get_site_url()."\n\nSET NAMES utf8mb4;\nSET FOREIGN_KEY_CHECKS = 0;\n\n");
	foreach ($wpdb->get_col("SHOW TABLES") as $table) {
		$create = $wpdb->get_row("SHOW CREATE TABLE `{$table}`", ARRAY_N);
		fwrite($h, "DROP TABLE IF EXISTS `{$table}`;\n".$create[1].";\n\n");
		$off = 0; $cols = null;
		while (true) {
			$rows = $wpdb->get_results($wpdb->prepare("SELECT * FROM `{$table}` LIMIT %d OFFSET %d",500,$off), ARRAY_A);
			if (empty($rows)) break;
			if ($cols === null) $cols = '`'.implode('`,`',array_keys($rows[0])).'`';
			foreach ($rows as $row) {
				$vals = array();
				foreach ($row as $v) { $vals[] = $v === null ? 'NULL' : "'".$wpdb->_real_escape($v)."'"; }
				fwrite($h, "INSERT INTO `{$table}` ({$cols}) VALUES (".implode(',',$vals).");\n");
			}
			$off += 500; if (count($rows)<500) break;
		}
		fwrite($h, "\n");
	}
	fwrite($h, "SET FOREIGN_KEY_CHECKS = 1;\n");
	fclose($h);
}

function wpl_import_database( $sql_file ) {
	global $wpdb;
	$h = fopen($sql_file, 'r');
	if (!$h) throw new Exception('Could not open SQL file');

	$wpdb->query('SET FOREIGN_KEY_CHECKS = 0');
	$buffer = ''; $imported = 0; $errors = 0;

	while (($line = fgets($h)) !== false) {
		$tr = trim($line);
		if ($tr === '' || strpos($tr,'--')===0 || strpos($tr,'#')===0) continue;
		if (preg_match('/^\/\*!.*\*\/;\s*$/', $tr)) continue;

		$buffer .= $line;

		if (substr(rtrim($tr), -1) === ';') {
			$stmt = trim($buffer); $buffer = '';
			if (empty($stmt)) continue;
			$stmt = rtrim($stmt, "; \t\n\r");
			if (empty($stmt)) continue;

			// Skip variable assignments and lock statements
			if (preg_match('/^SET\s+[@\/]/i', $stmt)) continue;
			if (preg_match('/^(UN)?LOCK\s+TABLE/i', $stmt)) continue;

			$result = $wpdb->query($stmt);
			if ($result === false) {
				$errors++;
				if ($errors <= 5) error_log('[WPL Connector] SQL err: '.$wpdb->last_error.' | '.substr($stmt,0,150));
			} else { $imported++; }
		}
	}
	fclose($h);
	$wpdb->query('SET FOREIGN_KEY_CHECKS = 1');
	error_log("[WPL Connector] DB import: {$imported} OK, {$errors} errors");
	if ($imported === 0 && $errors > 0) throw new Exception("DB import failed: {$errors} errors");
}

function wpl_search_replace( $search, $replace ) {
	global $wpdb;
	foreach ($wpdb->get_col("SHOW TABLES") as $table) {
		$columns = $wpdb->get_results("SHOW COLUMNS FROM `{$table}`", ARRAY_A);
		$text_cols = array(); $pk = null;
		foreach ($columns as $col) {
			$t = strtolower($col['Type']);
			if (strpos($t,'text')!==false || strpos($t,'varchar')!==false || strpos($t,'char')!==false || strpos($t,'blob')!==false) $text_cols[] = $col['Field'];
			if ($col['Key']==='PRI' && !$pk) $pk = $col['Field'];
		}
		if (empty($text_cols) || !$pk) continue;
		$off = 0;
		while (true) {
			$sel = '`'.$pk.'`,`'.implode('`,`',$text_cols).'`';
			$rows = $wpdb->get_results($wpdb->prepare("SELECT {$sel} FROM `{$table}` LIMIT %d OFFSET %d",500,$off), ARRAY_A);
			if (empty($rows)) break;
			foreach ($rows as $row) {
				$upd = array();
				foreach ($text_cols as $c) {
					if (!isset($row[$c]) || $row[$c]===null || strpos($row[$c],$search)===false) continue;
					$new = wpl_sr_deep($row[$c],$search,$replace);
					if ($new !== $row[$c]) $upd[$c] = $new;
				}
				if (!empty($upd)) $wpdb->update($table, $upd, array($pk=>$row[$pk]));
			}
			$off += 500; if (count($rows)<500) break;
		}
	}
}

function wpl_sr_deep($data,$s,$r) {
	$un = @unserialize($data);
	if ($un !== false || $data === 'b:0;') return serialize(wpl_sr_recurse($un,$s,$r));
	return str_replace($s,$r,$data);
}

function wpl_sr_recurse($data,$s,$r) {
	if (is_string($data)) return str_replace($s,$r,$data);
	if (is_array($data)) { $res=array(); foreach($data as $k=>$v) { $nk=is_string($k)?str_replace($s,$r,$k):$k; $res[$nk]=wpl_sr_recurse($v,$s,$r); } return $res; }
	if (is_object($data)) { foreach(get_object_vars($data) as $k=>$v) $data->$k=wpl_sr_recurse($v,$s,$r); return $data; }
	return $data;
}

function wpl_recursive_copy($src,$dst,$skip=array()) {
	if (!is_dir($src)) return;
	$it = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($src, RecursiveDirectoryIterator::SKIP_DOTS), RecursiveIteratorIterator::SELF_FIRST);
	foreach ($it as $item) {
		$rel = str_replace('\\','/',substr($item->getPathname(),strlen($src)+1));
		$parts = explode('/',$rel); $s=false;
		foreach ($skip as $sk) { foreach ($parts as $p) { if ($p===$sk) { $s=true; break 2; } } if (basename($rel)===$sk) { $s=true; break; } }
		if ($s) continue;
		$t = $dst.'/'.$rel;
		if ($item->isDir()) { wp_mkdir_p($t); } else { $d=dirname($t); if(!is_dir($d)) wp_mkdir_p($d); @copy($item->getPathname(),$t); }
	}
}

function wpl_recursive_delete($dir) {
	if (!is_dir($dir)) return;
	$it = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($dir, RecursiveDirectoryIterator::SKIP_DOTS), RecursiveIteratorIterator::CHILD_FIRST);
	foreach ($it as $item) { $item->isDir() ? @rmdir($item->getPathname()) : @unlink($item->getPathname()); }
	@rmdir($dir);
}
