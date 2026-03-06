<?php
/**
 * Storage page template.
 *
 * @package    FiveDPBR
 * @subpackage FiveDPBR/admin/partials
 * @since      1.0.0
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

// phpcs:disable WordPress.NamingConventions.PrefixAllGlobals.NonPrefixedVariableFound
$destinations = get_option( 'fdpbr_storage_destinations', array() );

$providers = array(
	'local'    => array( 'name' => __( 'Local Storage', '5dp-backup-restore' ), 'icon' => 'dashicons-media-archive', 'color' => 'teal', 'desc' => __( 'Store backups on your server.', '5dp-backup-restore' ) ),
	's3'       => array( 'name' => __( 'Amazon S3 / S3-Compatible', '5dp-backup-restore' ), 'icon' => 'dashicons-cloud', 'color' => 'orange', 'desc' => __( 'AWS S3, Wasabi, DigitalOcean Spaces, Backblaze B2, MinIO, Cloudflare R2.', '5dp-backup-restore' ) ),
	'gcs'      => array( 'name' => __( 'Google Cloud Storage', '5dp-backup-restore' ), 'icon' => 'dashicons-cloud', 'color' => 'sky', 'desc' => __( 'Google Cloud Storage buckets.', '5dp-backup-restore' ) ),
	'gdrive'   => array( 'name' => __( 'Google Drive', '5dp-backup-restore' ), 'icon' => 'dashicons-media-default', 'color' => 'success', 'desc' => __( 'Store backups in your Google Drive.', '5dp-backup-restore' ) ),
	'dropbox'  => array( 'name' => __( 'Dropbox', '5dp-backup-restore' ), 'icon' => 'dashicons-media-archive', 'color' => 'indigo', 'desc' => __( 'Store backups in your Dropbox account.', '5dp-backup-restore' ) ),
	'onedrive' => array( 'name' => __( 'OneDrive', '5dp-backup-restore' ), 'icon' => 'dashicons-cloud', 'color' => 'sky', 'desc' => __( 'Store backups in Microsoft OneDrive.', '5dp-backup-restore' ) ),
	'ftp'      => array( 'name' => __( 'FTP', '5dp-backup-restore' ), 'icon' => 'dashicons-networking', 'color' => 'amber', 'desc' => __( 'Upload backups via FTP.', '5dp-backup-restore' ) ),
	'sftp'     => array( 'name' => __( 'SFTP', '5dp-backup-restore' ), 'icon' => 'dashicons-lock', 'color' => 'rose', 'desc' => __( 'Upload backups via secure SFTP.', '5dp-backup-restore' ) ),
	'webdav'   => array( 'name' => __( 'WebDAV', '5dp-backup-restore' ), 'icon' => 'dashicons-admin-site', 'color' => 'purple', 'desc' => __( 'Upload backups via WebDAV protocol.', '5dp-backup-restore' ) ),
);
?>
<div class="fdpbr-app">
	<?php include FDPBR_PLUGIN_DIR . 'admin/partials/header-nav.php'; ?>

	<div class="fdpbr-content">

		<div class="fdpbr-section-card">
			<div class="fdpbr-section-card__header">
				<div>
					<h2><?php esc_html_e( 'Storage Destinations', '5dp-backup-restore' ); ?></h2>
					<p class="fdpbr-section-card__desc"><?php esc_html_e( 'Configure where your backups are stored. You can use multiple destinations simultaneously.', '5dp-backup-restore' ); ?></p>
				</div>
			</div>
			<div class="fdpbr-section-card__body">
				<div class="fdpbr-feature-grid">
					<?php foreach ( $providers as $slug => $provider ) :
						$is_configured = isset( $destinations[ $slug ] );
					?>
						<div class="fdpbr-storage-card" data-provider="<?php echo esc_attr( $slug ); ?>">
							<div class="fdpbr-storage-card__header">
								<div class="fdpbr-feature-card__icon fdpbr-feature-card__icon--<?php echo esc_attr( $provider['color'] ); ?>">
									<span class="dashicons <?php echo esc_attr( $provider['icon'] ); ?>"></span>
								</div>
								<div>
									<h3><?php echo esc_html( $provider['name'] ); ?></h3>
									<span class="fdpbr-badge <?php echo $is_configured ? 'fdpbr-badge--success' : 'fdpbr-badge--inactive'; ?>">
										<?php echo $is_configured ? esc_html__( 'Connected', '5dp-backup-restore' ) : esc_html__( 'Not configured', '5dp-backup-restore' ); ?>
									</span>
								</div>
							</div>
							<div class="fdpbr-storage-card__body">
								<p class="fdpbr-storage-card__meta"><?php echo esc_html( $provider['desc'] ); ?></p>
							</div>
							<div class="fdpbr-storage-card__footer">
								<button type="button" class="fdpbr-btn fdpbr-btn--secondary fdpbr-btn--small fdpbr-configure-storage" data-provider="<?php echo esc_attr( $slug ); ?>">
									<?php echo $is_configured ? esc_html__( 'Edit', '5dp-backup-restore' ) : esc_html__( 'Configure', '5dp-backup-restore' ); ?>
								</button>
								<?php if ( $is_configured ) : ?>
									<button type="button" class="fdpbr-btn fdpbr-btn--ghost fdpbr-btn--small fdpbr-test-storage" data-provider="<?php echo esc_attr( $slug ); ?>">
										<?php esc_html_e( 'Test', '5dp-backup-restore' ); ?>
									</button>
								<?php endif; ?>
							</div>
						</div>
					<?php endforeach; ?>
				</div>
			</div>
		</div>

	</div>
</div>
