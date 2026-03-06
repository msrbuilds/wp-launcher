<?php
/**
 * Tools tab view for the MCP Tools for Elementor admin settings page.
 *
 * Displays all MCP tools grouped by category with toggle switches.
 *
 * @package Elementor_MCP
 * @since   1.0.0
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/** @var Elementor_MCP_Admin $this */
$elementor_mcp_all_tools     = $this->get_all_tools();
$elementor_mcp_disabled      = get_option( Elementor_MCP_Admin::OPTION_DISABLED_TOOLS, array() );
$elementor_mcp_enabled_count = $this->get_enabled_tool_count();
$elementor_mcp_total_count   = $this->get_total_tool_count();
?>

<form method="post" action="options.php" id="elementor-mcp-tools-form">
	<?php settings_fields( Elementor_MCP_Admin::SETTINGS_GROUP ); ?>

	<p class="elementor-mcp-tools-summary">
		<?php
		printf(
			/* translators: %1$s: opening strong tag, %2$d: enabled count, %3$d: total count, %4$s: closing strong tag */
			esc_html__( '%1$s%2$d of %3$d%4$s tools enabled.', 'elementor-mcp' ),
			'<strong>',
			(int) $elementor_mcp_enabled_count,
			(int) $elementor_mcp_total_count,
			'</strong>'
		);
		?>
	</p>

	<div class="elementor-mcp-bulk-actions">
		<button type="button" class="button elementor-mcp-enable-all"><?php esc_html_e( 'Enable All', 'elementor-mcp' ); ?></button>
		<button type="button" class="button elementor-mcp-disable-all"><?php esc_html_e( 'Disable All', 'elementor-mcp' ); ?></button>
	</div>

	<?php foreach ( $elementor_mcp_all_tools as $elementor_mcp_category_id => $elementor_mcp_category ) : ?>
		<div class="elementor-mcp-category" data-category="<?php echo esc_attr( $elementor_mcp_category_id ); ?>">
			<h2 class="elementor-mcp-category-header">
				<?php echo esc_html( $elementor_mcp_category['label'] ); ?>
				<span class="elementor-mcp-category-count">
					<?php
					$elementor_mcp_cat_total   = count( $elementor_mcp_category['tools'] );
					$elementor_mcp_cat_enabled = 0;
					foreach ( $elementor_mcp_category['tools'] as $elementor_mcp_slug => $elementor_mcp_tool ) {
						if ( ! in_array( $elementor_mcp_slug, $elementor_mcp_disabled, true ) ) {
							$elementor_mcp_cat_enabled++;
						}
					}
					printf(
						/* translators: %1$d: enabled, %2$d: total */
						esc_html__( '%1$d / %2$d', 'elementor-mcp' ),
						(int) $elementor_mcp_cat_enabled,
						(int) $elementor_mcp_cat_total
					);
					?>
				</span>
				<span class="elementor-mcp-category-actions">
					<button type="button" class="button-link elementor-mcp-cat-enable-all"><?php esc_html_e( 'All', 'elementor-mcp' ); ?></button>
					<span class="elementor-mcp-separator">&middot;</span>
					<button type="button" class="button-link elementor-mcp-cat-disable-all"><?php esc_html_e( 'None', 'elementor-mcp' ); ?></button>
				</span>
			</h2>

			<div class="elementor-mcp-tools-grid">
				<?php foreach ( $elementor_mcp_category['tools'] as $elementor_mcp_slug => $elementor_mcp_tool ) : ?>
					<?php $elementor_mcp_is_enabled = ! in_array( $elementor_mcp_slug, $elementor_mcp_disabled, true ); ?>
					<label class="elementor-mcp-tool-card <?php echo esc_attr( $elementor_mcp_is_enabled ? 'is-enabled' : 'is-disabled' ); ?>">
						<input
							type="checkbox"
							name="<?php echo esc_attr( Elementor_MCP_Admin::OPTION_DISABLED_TOOLS ); ?>[]"
							value="<?php echo esc_attr( $elementor_mcp_slug ); ?>"
							<?php checked( $elementor_mcp_is_enabled ); ?>
						/>
						<span class="elementor-mcp-toggle" aria-hidden="true">
							<span class="elementor-mcp-toggle-track"></span>
						</span>
						<span class="elementor-mcp-tool-info">
							<span class="elementor-mcp-tool-name">
								<?php echo esc_html( $elementor_mcp_tool['label'] ); ?>
								<?php foreach ( $elementor_mcp_tool['badges'] as $elementor_mcp_badge ) : ?>
									<span class="elementor-mcp-badge elementor-mcp-badge--<?php echo esc_attr( $elementor_mcp_badge ); ?>">
										<?php echo esc_html( $elementor_mcp_badge ); ?>
									</span>
								<?php endforeach; ?>
							</span>
							<span class="elementor-mcp-tool-desc"><?php echo esc_html( $elementor_mcp_tool['description'] ); ?></span>
							<code class="elementor-mcp-tool-slug"><?php echo esc_html( $elementor_mcp_slug ); ?></code>
						</span>
					</label>
				<?php endforeach; ?>
			</div>
		</div>
	<?php endforeach; ?>

	<?php submit_button( __( 'Save Changes', 'elementor-mcp' ) ); ?>
</form>
