<?php
/**
 * Settings page template with sidebar tabs.
 *
 * @package    FiveDPBR
 * @subpackage FiveDPBR/admin/partials
 * @since      1.0.0
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

// phpcs:disable WordPress.NamingConventions.PrefixAllGlobals.NonPrefixedVariableFound
$settings_tabs = FiveDPBR_Settings::get_settings_tabs();
$current_tab   = isset( $_GET['tab'] ) ? sanitize_key( $_GET['tab'] ) : 'general'; // phpcs:ignore WordPress.Security.NonceVerification.Recommended
$settings      = get_option( FiveDPBR_Settings::OPTION_NAME, FiveDPBR_Settings::get_defaults() );
?>
<div class="fdpbr-app">
	<?php include FDPBR_PLUGIN_DIR . 'admin/partials/header-nav.php'; ?>

	<div class="fdpbr-content">
		<div class="fdpbr-settings-layout">

			<!-- Sidebar Navigation -->
			<nav class="fdpbr-settings-nav">
				<?php foreach ( $settings_tabs as $tab_slug => $tab ) : ?>
					<a href="<?php echo esc_url( add_query_arg( array( 'page' => 'fdpbr-settings', 'tab' => $tab_slug ), admin_url( 'admin.php' ) ) ); ?>"
					   class="fdpbr-settings-nav__link <?php echo $current_tab === $tab_slug ? 'fdpbr-settings-nav__link--active' : ''; ?>">
						<span class="dashicons <?php echo esc_attr( $tab['icon'] ); ?>"></span>
						<?php echo esc_html( $tab['label'] ); ?>
					</a>
				<?php endforeach; ?>
			</nav>

			<!-- Tab Content -->
			<div class="fdpbr-settings-content">
				<?php
				switch ( $current_tab ) {
					case 'schedules':
						include FDPBR_PLUGIN_DIR . 'admin/partials/settings-tabs/schedule-settings.php';
						break;
					case 'notifications':
						include FDPBR_PLUGIN_DIR . 'admin/partials/settings-tabs/notification-settings.php';
						break;
					case 'advanced':
						include FDPBR_PLUGIN_DIR . 'admin/partials/settings-tabs/advanced-settings.php';
						break;
					case 'general':
					default:
						include FDPBR_PLUGIN_DIR . 'admin/partials/settings-tabs/general-settings.php';
						break;
				}
				?>
			</div>
		</div>
	</div>
</div>
