<?php
/**
 * Plugin Name: WP Launcher Connector
 * Description: Connects this WordPress site to WP Launcher for push/pull sync. Exposes a REST API for remote content sync operations.
 * Version: 1.0.2
 * Author: MSR Builds
 * License: GPL-2.0-or-later
 * Requires PHP: 7.4
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

define( 'WPL_CONNECTOR_VERSION', '1.0.2' );
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
	if ( isset( $_POST['wpl_regenerate_key'] ) && check_admin_referer( 'wpl_connector_regen' ) ) {
		update_option( 'wpl_connector_api_key', wp_generate_password( 40, false ) );
		echo '<div class="notice notice-success"><p>API key regenerated.</p></div>';
	}
	$api_key  = get_option( 'wpl_connector_api_key', '' );
	$site_url = get_site_url();
	$rest_url = rest_url( 'wpl-connector/v1/status' );
	?>
	<div class="wrap">
		<h1>WP Launcher Connector</h1>
		<p>This plugin allows WP Launcher to push and pull site content to/from this WordPress installation.</p>
		<div class="card" style="max-width:600px;padding:1.5rem;">
			<h2 style="margin-top:0;">Connection Details</h2>
			<p>Enter these values in WP Launcher's Sync page to connect:</p>
			<table class="form-table">
				<tr>
					<th>Site URL</th>
					<td>
						<code id="wpl-site-url" style="font-size:14px;"><?php echo esc_html( $site_url ); ?></code>
						<button type="button" class="button button-small wpl-copy-btn" data-target="wpl-site-url" style="margin-left:8px;vertical-align:middle;">Copy</button>
					</td>
				</tr>
				<tr>
					<th>API Key</th>
					<td>
						<code id="wpl-api-key" style="font-size:14px;background:#f0f0f0;padding:4px 8px;display:inline-block;word-break:break-all;"><?php echo esc_html( $api_key ); ?></code>
						<button type="button" class="button button-small wpl-copy-btn" data-target="wpl-api-key" style="margin-left:8px;vertical-align:middle;">Copy</button>
					</td>
				</tr>
				<tr>
					<th>Status Endpoint</th>
					<td>
						<code id="wpl-rest-url" style="font-size:12px;"><?php echo esc_html( $rest_url ); ?></code>
						<button type="button" class="button button-small wpl-copy-btn" data-target="wpl-rest-url" style="margin-left:8px;vertical-align:middle;">Copy</button>
					</td>
				</tr>
			</table>
			<script>
			document.addEventListener('DOMContentLoaded', function() {
				document.querySelectorAll('.wpl-copy-btn').forEach(function(btn) {
					btn.addEventListener('click', function() {
						var el = document.getElementById(this.getAttribute('data-target'));
						if (!el) return;
						navigator.clipboard.writeText(el.textContent.trim()).then(function() {
							var orig = btn.textContent; btn.textContent = 'Copied!';
							setTimeout(function() { btn.textContent = orig; }, 1500);
						});
					});
				});
			});
			</script>
			<form method="post" style="margin-top:1rem;">
				<?php wp_nonce_field( 'wpl_connector_regen' ); ?>
				<button type="submit" name="wpl_regenerate_key" class="button button-secondary" onclick="return confirm('Regenerate API key? Existing connections will stop working.');">Regenerate API Key</button>
			</form>
		</div>
		<div class="card" style="max-width:600px;padding:1.5rem;margin-top:1rem;">
			<h2 style="margin-top:0;">Requirements</h2>
			<table class="widefat" style="max-width:400px;">
				<tr><td>ZipArchive</td><td><?php echo class_exists('ZipArchive') ? '&#9989; Available' : '&#10060; Missing'; ?></td></tr>
				<tr><td>PharData</td><td><?php echo class_exists('PharData') ? '&#9989; Available' : '&#9888; Missing'; ?></td></tr>
				<tr><td>Upload Max Size</td><td><?php echo esc_html(ini_get('upload_max_filesize')); ?></td></tr>
				<tr><td>Post Max Size</td><td><?php echo esc_html(ini_get('post_max_size')); ?></td></tr>
				<tr><td>Max Execution Time</td><td><?php echo esc_html(ini_get('max_execution_time')); ?>s</td></tr>
			</table>
		</div>
	</div>
	<?php
}

function wpl_connector_authenticate( $request ) {
	$key = $request->get_header( 'X-WPL-Key' );
	if ( ! $key ) $key = $request->get_header( 'X_WPL_Key' );
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

function wpl_connector_import( $request ) {
	@set_time_limit(600); @ini_set('memory_limit','512M');
	$tmp_dir = WPL_CONNECTOR_DIR . 'tmp';
	$import_dir = $tmp_dir . '/wpl-import-' . wp_generate_password(8,false,false);
	wp_mkdir_p($import_dir);

	try {
		$body = $request->get_body();
		if (empty($body)) $body = file_get_contents('php://input');
		if (empty($body)) throw new Exception('Empty request body');

		$is_tar = (substr($body,0,4) !== "PK\x03\x04");
		$archive_path = $import_dir . '/import' . ($is_tar ? '.tar' : '.zip');
		file_put_contents($archive_path, $body); unset($body);

		$extract_dir = $import_dir . '/extracted'; wp_mkdir_p($extract_dir);
		if ($is_tar) {
			if (!class_exists('PharData')) throw new Exception('PharData required for tar import');
			$phar = new PharData($archive_path); $phar->extractTo($extract_dir);
		} else {
			if (!class_exists('ZipArchive')) throw new Exception('ZipArchive required');
			$zip = new ZipArchive();
			if ($zip->open($archive_path) !== true) throw new Exception('Could not open ZIP');
			$zip->extractTo($extract_dir); $zip->close();
		}
		@unlink($archive_path);

		$source_wpc = is_dir($extract_dir.'/wp-content') ? $extract_dir.'/wp-content' : $extract_dir;

		// Find SQL file
		$sql_file = null;
		foreach (array($extract_dir.'/database.sql', $source_wpc.'/db-snapshot.sql', $extract_dir.'/db-snapshot.sql') as $c) {
			if (file_exists($c)) { $sql_file = $c; break; }
		}

		error_log('[WPL Connector] Import: tar=' . ($is_tar?'yes':'no') . ' sql=' . ($sql_file ? basename($sql_file) : 'NONE') . ' extract_dir contents: ' . implode(', ', @scandir($extract_dir)));
		if ($source_wpc !== $extract_dir) {
			error_log('[WPL Connector] wp-content contents: ' . implode(', ', array_slice(@scandir($source_wpc), 0, 20)));
		}

		// CRITICAL: Save current site URL BEFORE any DB changes
		$current_url = get_site_url();
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

			// Safety: force correct URLs via direct SQL (belt and suspenders)
			global $wpdb;
			$wpdb->query($wpdb->prepare("UPDATE {$wpdb->options} SET option_value = %s WHERE option_name = 'siteurl'", $current_url));
			$wpdb->query($wpdb->prepare("UPDATE {$wpdb->options} SET option_value = %s WHERE option_name = 'home'", $current_url));

			error_log('[WPL Connector] URLs restored to: ' . $current_url);
		} else {
			error_log('[WPL Connector] CRITICAL: No SQL file found! Aborting to prevent URL corruption.');
			error_log('[WPL Connector] extract_dir contents: ' . implode(', ', @scandir($extract_dir) ?: array()));
			if (is_dir($source_wpc)) {
				error_log('[WPL Connector] wp-content contents: ' . implode(', ', array_slice(@scandir($source_wpc) ?: array(), 0, 30)));
			}
			wpl_recursive_delete($import_dir);
			return new WP_Error('no_database', 'No database file found in snapshot. Push aborted to protect site URLs.', array('status' => 400));
		}

		$skip = array('mu-plugins','cache','upgrade','db-snapshot.sql','database.sql','wp-launcher-connector');
		wpl_recursive_copy($source_wpc, WP_CONTENT_DIR, $skip);
		wpl_recursive_delete($import_dir);
		wp_cache_flush();
		if (function_exists('opcache_reset')) @opcache_reset();

		return rest_ensure_response(array('status'=>'restored','siteUrl'=>$current_url,'sourceUrl'=>$source_url,'dbImported'=>$db_imported));
	} catch (Exception $e) {
		error_log('[WPL Connector] Import error: ' . $e->getMessage());
		wpl_recursive_delete($import_dir);
		return new WP_Error('import_failed', $e->getMessage(), array('status'=>500));
	}
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
