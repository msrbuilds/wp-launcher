<?php
/**
 * WP Launcher - Auto Login
 *
 * Handles one-click login via a per-site token.
 * Token is read from a file (rotated by the API) with fallback to env var.
 * After successful login, the token file is deleted to make it single-use.
 * Usage: /wp-login.php?autologin=TOKEN
 */

defined( 'ABSPATH' ) || exit;

add_action( 'login_init', function () {
    if ( empty( $_GET['autologin'] ) ) {
        return;
    }

    // Read token from file (written on-demand by POST /api/sites/:id/autologin)
    $token_file = '/tmp/wp-autologin-token';
    $token      = false;
    if ( file_exists( $token_file ) ) {
        $token = trim( @file_get_contents( $token_file ) );
    }

    if ( ! $token || ! hash_equals( $token, $_GET['autologin'] ) ) {
        wp_die( 'Invalid or expired auto-login token.', 'Login Failed', array( 'response' => 403 ) );
    }

    // Delete the token file to make it single-use
    if ( file_exists( $token_file ) ) {
        @unlink( $token_file );
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
