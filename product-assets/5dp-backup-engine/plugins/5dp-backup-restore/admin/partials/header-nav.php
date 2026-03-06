<?php
/**
 * Shared top navigation bar template.
 *
 * @package    FiveDPBR
 * @subpackage FiveDPBR/admin/partials
 * @since      1.0.0
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

// phpcs:disable WordPress.NamingConventions.PrefixAllGlobals.NonPrefixedVariableFound -- Template partial loaded within class method scope.
$nav_tabs    = FiveDPBR_Settings::get_nav_tabs();
$current_page = isset( $_GET['page'] ) ? sanitize_key( $_GET['page'] ) : 'fdpbr'; // phpcs:ignore WordPress.Security.NonceVerification.Recommended
?>
<div class="fdpbr-topbar">
	<div class="fdpbr-topbar__brand">
		<span class="dashicons dashicons-cloud-saved fdpbr-topbar__icon"></span>
		<span class="fdpbr-topbar__name"><?php esc_html_e( '5DP Backup & Restore', '5dp-backup-restore' ); ?></span>
		<span class="fdpbr-topbar__version"><?php echo esc_html( 'v' . FDPBR_VERSION ); ?></span>
	</div>

	<nav class="fdpbr-topbar__nav">
		<?php foreach ( $nav_tabs as $slug => $tab ) : ?>
			<a href="<?php echo esc_url( admin_url( 'admin.php?page=' . $slug ) ); ?>"
			   class="fdpbr-topbar__tab <?php echo $current_page === $slug ? 'fdpbr-topbar__tab--active' : ''; ?>">
				<span class="dashicons <?php echo esc_attr( $tab['icon'] ); ?>"></span>
				<?php echo esc_html( $tab['label'] ); ?>
			</a>
		<?php endforeach; ?>
	</nav>

	<div class="fdpbr-topbar__actions">
		<a href="https://developer.suspended.suspended" target="_blank" rel="noopener noreferrer" class="fdpbr-topbar__action-btn">
			<span class="dashicons dashicons-book"></span>
			<?php esc_html_e( 'Documentation', '5dp-backup-restore' ); ?>
		</a>
		<a href="https://developer.suspended.suspended" target="_blank" rel="noopener noreferrer" class="fdpbr-topbar__action-btn">
			<span class="dashicons dashicons-sos"></span>
			<?php esc_html_e( 'Support', '5dp-backup-restore' ); ?>
		</a>
	</div>
</div>
