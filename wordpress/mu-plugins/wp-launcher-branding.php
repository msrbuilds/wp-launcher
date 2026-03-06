<?php
/**
 * Plugin Name: WP Launcher - Branding & Countdown Timer
 * Description: Adds a live countdown timer to the WordPress admin bar for demo sites.
 * Version: 1.0.0
 */

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

/**
 * Add countdown timer node to the admin bar.
 */
add_action( 'admin_bar_menu', function ( $wp_admin_bar ) {
    $expires_at = getenv( 'WP_DEMO_EXPIRES_AT' );
    if ( empty( $expires_at ) ) {
        return;
    }

    $wp_admin_bar->add_node( array(
        'id'    => 'wp-launcher-timer',
        'title' => '<span id="wp-launcher-countdown" data-expires="' . esc_attr( $expires_at ) . '">Demo: loading...</span>',
        'meta'  => array(
            'class' => 'wp-launcher-timer-node',
        ),
    ) );
}, 100 );

/**
 * Output countdown JS and CSS directly in the footer.
 */
add_action( 'wp_footer', 'wp_launcher_render_timer_assets' );
add_action( 'admin_footer', 'wp_launcher_render_timer_assets' );

function wp_launcher_render_timer_assets() {
    $expires_at = getenv( 'WP_DEMO_EXPIRES_AT' );
    if ( empty( $expires_at ) ) {
        return;
    }

    $landing_page = esc_js( getenv( 'WP_DEMO_LANDING_PAGE' ) ?: '' );
    ?>
    <style>
        #wpadminbar .wp-launcher-timer-node > a {
            color: #fff !important;
            font-weight: 600;
            letter-spacing: 0.02em;
        }
        #wpadminbar .wp-launcher-timer-node {
            transition: background-color 0.5s ease;
            background-color: #059669 !important;
        }
        #wpadminbar .wp-launcher-timer-node > a:hover {
            background-color: rgba(0, 0, 0, 0.1) !important;
        }
    </style>
    <script>
    (function() {
        var el = document.getElementById('wp-launcher-countdown');
        if (!el) return;

        var expiresAt = new Date(el.getAttribute('data-expires')).getTime();
        var landingPage = '<?php echo $landing_page; ?>';
        var parentNode = el.closest('.wp-launcher-timer-node');

        function pad(n) { return n < 10 ? '0' + n : n; }

        function update() {
            var now = Date.now();
            var diff = expiresAt - now;

            if (diff <= 0) {
                el.textContent = 'Demo expired';
                if (parentNode) parentNode.style.backgroundColor = '#dc2626';
                if (landingPage) {
                    window.location.href = landingPage;
                }
                return;
            }

            var hours = Math.floor(diff / 3600000);
            var mins = Math.floor((diff % 3600000) / 60000);
            var secs = Math.floor((diff % 60000) / 1000);

            var timeStr = '';
            if (hours > 0) timeStr += hours + 'h ';
            timeStr += pad(mins) + 'm ' + pad(secs) + 's';

            el.textContent = 'Demo expires in: ' + timeStr;

            var totalMins = diff / 60000;
            if (parentNode) {
                if (totalMins <= 5) {
                    parentNode.style.backgroundColor = '#dc2626';
                } else if (totalMins <= 30) {
                    parentNode.style.backgroundColor = '#d97706';
                } else {
                    parentNode.style.backgroundColor = '#059669';
                }
            }
        }

        update();
        setInterval(update, 1000);
    })();
    </script>
    <?php
}
