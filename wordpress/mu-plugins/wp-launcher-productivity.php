<?php
/**
 * Plugin Name: WP Launcher - Productivity Tracker
 * Description: Tracks admin activity and sends heartbeats to WP Launcher API for productivity monitoring.
 * Version: 1.0.0
 */

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

// Only run in wp-admin
if ( ! is_admin() ) {
    return;
}

/**
 * Output the productivity tracker inline in the admin footer.
 * All config detection and JS output happens here — no wp_enqueue_script needed.
 */
add_action( 'admin_footer', function () {
    $api_url_internal = getenv( 'WP_LAUNCHER_API_URL' );
    $subdomain        = getenv( 'WP_SUBDOMAIN' );
    $site_url         = getenv( 'WP_SITE_URL' );

    if ( empty( $api_url_internal ) && empty( $site_url ) ) {
        return;
    }

    // Build the public API URL from the site URL.
    $api_url = '';
    if ( $site_url ) {
        $parsed = wp_parse_url( $site_url );
        $host   = $parsed['host'] ?? '';
        $parts  = explode( '.', $host );
        if ( count( $parts ) >= 2 ) {
            array_shift( $parts );
            $base_domain = implode( '.', $parts );
        } else {
            $base_domain = $host;
        }
        if ( $base_domain === 'localhost' || strpos( $base_domain, 'localhost' ) === 0 ) {
            $base_domain .= ':3737';
        }
        $scheme  = $parsed['scheme'] ?? 'http';
        $api_url = $scheme . '://' . $base_domain;
    }
    if ( empty( $api_url ) ) {
        $api_url = $api_url_internal;
    }
    if ( empty( $api_url ) ) {
        return;
    }

    // Detect current activity context
    $screen    = function_exists( 'get_current_screen' ) ? get_current_screen() : null;
    $category  = 'general-admin';
    $entity    = isset( $_SERVER['REQUEST_URI'] ) ? sanitize_text_field( wp_unslash( $_SERVER['REQUEST_URI'] ) ) : '';
    $post_type = '';
    $post_id   = 0;
    $is_write  = false;

    if ( $screen ) {
        $base      = $screen->base;
        $post_type = $screen->post_type ?: '';

        if ( in_array( $base, array( 'post', 'edit', 'edit-tags', 'term' ), true ) || 'site-editor' === $base ) {
            $category = 'editing';
        } elseif ( 'customize' === $base ) {
            $category = 'customizer';
        } elseif ( in_array( $base, array( 'upload', 'media' ), true ) ) {
            $category = 'media';
        } elseif ( in_array( $base, array( 'plugins', 'plugin-install', 'plugin-editor' ), true ) ) {
            $category = 'plugins';
        } elseif ( in_array( $base, array( 'themes', 'theme-install' ), true ) ) {
            $category = 'themes';
        } elseif ( strpos( $base, 'options' ) === 0 || 'tools' === $base ) {
            $category = 'settings';
        } elseif ( strpos( $base, 'woocommerce' ) !== false || strpos( $entity, 'wc-' ) !== false ) {
            $category = 'woocommerce';
        }

        if ( isset( $_GET['settings-updated'] ) || isset( $_GET['updated'] ) || isset( $_GET['activate'] ) || isset( $_GET['message'] ) ) {
            $is_write = true;
        }
        if ( 'post' === $base && isset( $_GET['post'] ) ) {
            $post_id = absint( $_GET['post'] );
        }
    }

    $entity_str = $screen ? $screen->id : wp_parse_url( $entity, PHP_URL_PATH );

    $heartbeat_secret = getenv( 'WP_HEARTBEAT_SECRET' );

    $config = array(
        'apiUrl'    => rtrim( $api_url, '/' ) . '/api/productivity/heartbeats',
        'subdomain' => $subdomain ?: '',
        'entity'    => $entity_str ?: 'unknown',
        'category'  => $category,
        'postType'  => $post_type,
        'postId'    => $post_id,
        'isWrite'   => $is_write,
        'siteId'    => $subdomain ?: '',
        'secret'    => $heartbeat_secret ?: '',
    );
    ?>
    <script>
    (function() {
        'use strict';
        var cfg = <?php echo wp_json_encode( $config ); ?>;
        if (!cfg || !cfg.apiUrl) return;

        var HEARTBEAT_INTERVAL = 60000;
        var queue = [];
        var timer = null;

        function makeHeartbeat(isWrite) {
            return {
                source: 'wordpress',
                entity: cfg.entity,
                entity_type: 'wp-screen',
                project: cfg.subdomain,
                category: cfg.category,
                site_id: cfg.siteId,
                is_write: isWrite || false,
                time: new Date().toISOString()
            };
        }

        function flush() {
            if (queue.length === 0) return;
            var batch = queue.splice(0);
            var body = JSON.stringify({ heartbeats: batch, secret: cfg.secret });
            try {
                navigator.sendBeacon(cfg.apiUrl, new Blob([body], { type: 'text/plain' }));
            } catch (e) {
                try {
                    fetch(cfg.apiUrl, {
                        method: 'POST',
                        headers: { 'Content-Type': 'text/plain' },
                        body: body,
                        keepalive: true,
                        mode: 'no-cors'
                    });
                } catch (e2) { /* silent */ }
            }
        }

        function sendHeartbeat(isWrite) {
            queue.push(makeHeartbeat(isWrite));
            if (isWrite || queue.length >= 10) {
                flush();
            }
        }

        // Initial heartbeat on page load
        sendHeartbeat(cfg.isWrite);

        function startTimer() {
            if (timer) return;
            timer = setInterval(function() {
                if (document.visibilityState === 'visible') {
                    sendHeartbeat(false);
                }
            }, HEARTBEAT_INTERVAL);
        }

        function stopTimer() {
            if (timer) { clearInterval(timer); timer = null; }
        }

        startTimer();

        document.addEventListener('visibilitychange', function() {
            if (document.visibilityState === 'visible') {
                sendHeartbeat(false);
                startTimer();
            } else {
                stopTimer();
                flush();
            }
        });

        window.addEventListener('beforeunload', flush);

        // Detect Gutenberg saves
        if (typeof wp !== 'undefined' && wp.data && wp.data.subscribe) {
            var wasSaving = false;
            wp.data.subscribe(function() {
                var editor = wp.data.select('core/editor');
                if (!editor) return;
                var isSaving = editor.isSavingPost() && !editor.isAutosavingPost();
                if (isSaving && !wasSaving) { sendHeartbeat(true); }
                wasSaving = isSaving;
            });
        }
    })();
    </script>
    <?php
} );
