<?php
/**
 * WP Launcher - Auto Login
 *
 * Handles one-click login via a per-site token passed as an environment variable.
 * Usage: /wp-login.php?autologin=TOKEN
 */

defined( 'ABSPATH' ) || exit;

add_action( 'login_init', function () {
    if ( empty( $_GET['autologin'] ) ) {
        return;
    }

    $token = getenv( 'WP_AUTO_LOGIN_TOKEN' );
    if ( ! $token || ! hash_equals( $token, $_GET['autologin'] ) ) {
        wp_die( 'Invalid or expired auto-login token.', 'Login Failed', array( 'response' => 403 ) );
    }

    // Find the admin user
    $admin_user = getenv( 'WP_ADMIN_USER' ) ?: 'demo';
    $user = get_user_by( 'login', $admin_user );
    if ( ! $user ) {
        wp_die( 'Admin user not found.', 'Login Failed', array( 'response' => 403 ) );
    }

    // Log in
    wp_set_current_user( $user->ID );
    wp_set_auth_cookie( $user->ID, false );
    do_action( 'wp_login', $user->user_login, $user );

    // Redirect to landing page or wp-admin
    $landing = getenv( 'WP_DEMO_LANDING_PAGE' );
    $redirect = $landing ? home_url( $landing ) : admin_url();
    wp_safe_redirect( $redirect );
    exit;
} );
