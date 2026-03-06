<?php
/**
 * REST API controller.
 *
 * Central REST controller that registers all plugin REST API routes,
 * including migration and staging sync endpoints.
 *
 * @package    FiveDPBR
 * @subpackage FiveDPBR/api
 * @since      1.0.0
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Class FiveDPBR_REST_Controller
 *
 * @since 1.0.0
 */
class FiveDPBR_REST_Controller extends WP_REST_Controller {

	/**
	 * REST API namespace.
	 *
	 * @var string
	 */
	protected $namespace = 'fdpbr/v1';

	/**
	 * Initialize the REST controller.
	 *
	 * @since 1.0.0
	 */
	public static function init() {
		$instance = new self();
		add_action( 'rest_api_init', array( $instance, 'register_routes' ) );
	}

	/**
	 * Register all REST API routes.
	 *
	 * Delegates migration routes to FiveDPBR_Migration_API and registers
	 * staging sync routes directly.
	 *
	 * @since 1.0.0
	 */
	public function register_routes() {
		// Migration routes are registered by FiveDPBR_Migration_API::register_routes().
		// They are loaded via FiveDPBR_Migration_API::init() and fire on rest_api_init.

		// -----------------------------------------------------------------
		// Staging Sync Routes
		// -----------------------------------------------------------------

		// POST /fdpbr/v1/staging/pair — Pair with a remote staging site.
		register_rest_route(
			$this->namespace,
			'/staging/pair',
			array(
				'methods'             => WP_REST_Server::CREATABLE,
				'callback'            => array( $this, 'endpoint_staging_pair' ),
				'permission_callback' => array( $this, 'check_staging_permission' ),
			)
		);

		// POST /fdpbr/v1/staging/changes — Get pending changes for sync.
		register_rest_route(
			$this->namespace,
			'/staging/changes',
			array(
				'methods'             => WP_REST_Server::CREATABLE,
				'callback'            => array( $this, 'endpoint_staging_changes' ),
				'permission_callback' => array( $this, 'check_staging_permission' ),
			)
		);

		// POST /fdpbr/v1/staging/sync — Synchronize changes.
		register_rest_route(
			$this->namespace,
			'/staging/sync',
			array(
				'methods'             => WP_REST_Server::CREATABLE,
				'callback'            => array( $this, 'endpoint_staging_sync' ),
				'permission_callback' => array( $this, 'check_staging_permission' ),
			)
		);

		// POST /fdpbr/v1/staging/push — Receive push data from the other site.
		register_rest_route(
			$this->namespace,
			'/staging/push',
			array(
				'methods'             => WP_REST_Server::CREATABLE,
				'callback'            => array( $this, 'endpoint_staging_push' ),
				'permission_callback' => array( $this, 'check_staging_permission' ),
			)
		);

		// POST /fdpbr/v1/staging/pull — Serve pull data to the requesting site.
		register_rest_route(
			$this->namespace,
			'/staging/pull',
			array(
				'methods'             => WP_REST_Server::CREATABLE,
				'callback'            => array( $this, 'endpoint_staging_pull' ),
				'permission_callback' => array( $this, 'check_staging_permission' ),
			)
		);
	}

	// =========================================================================
	// Permission Callbacks
	// =========================================================================

	/**
	 * Check staging endpoint permissions.
	 *
	 * Validates the migration key from the request header.
	 *
	 * @since 1.0.0
	 *
	 * @param WP_REST_Request $request The request object.
	 * @return bool|WP_Error True if authorized, WP_Error otherwise.
	 */
	public function check_staging_permission( $request ) {
		return FiveDPBR_Migration_API::validate_migration_key( $request );
	}

	// =========================================================================
	// Staging Endpoints
	// =========================================================================

	/**
	 * Endpoint: Pair with a remote staging site.
	 *
	 * Establishes the link between production and staging environments.
	 *
	 * @since 1.0.0
	 *
	 * @param WP_REST_Request $request The request object.
	 * @return WP_REST_Response
	 */
	public function endpoint_staging_pair( $request ) {
		$params     = $request->get_json_params();
		$remote_url = isset( $params['remote_url'] ) ? esc_url_raw( $params['remote_url'] ) : '';
		$site_type  = isset( $params['site_type'] ) ? sanitize_text_field( $params['site_type'] ) : '';

		if ( empty( $remote_url ) ) {
			return new WP_REST_Response(
				array(
					'success' => false,
					'message' => __( 'Remote URL is required.', '5dp-backup-restore' ),
				),
				400
			);
		}

		// Store the pairing info.
		update_option( 'fdpbr_staging_pair', array(
			'remote_url' => untrailingslashit( $remote_url ),
			'site_type'  => $site_type,
			'paired_at'  => current_time( 'mysql', true ),
		), false );

		FiveDPBR_Logger::info(
			'staging',
			sprintf( 'Staging pair established with %s (type: %s).', $remote_url, $site_type )
		);

		global $wp_version;

		return new WP_REST_Response(
			array(
				'success' => true,
				'message' => __( 'Pairing successful.', '5dp-backup-restore' ),
				'data'    => array(
					'site_url'       => home_url(),
					'wp_version'     => $wp_version,
					'plugin_version' => defined( 'FDPBR_VERSION' ) ? FDPBR_VERSION : '1.0.0',
				),
			),
			200
		);
	}

	/**
	 * Endpoint: Get pending changes for staging sync.
	 *
	 * Returns a list of files and database tables that have changed
	 * since the last sync.
	 *
	 * @since 1.0.0
	 *
	 * @param WP_REST_Request $request The request object.
	 * @return WP_REST_Response
	 */
	public function endpoint_staging_changes( $request ) {
		$params    = $request->get_json_params();
		$since     = isset( $params['since'] ) ? sanitize_text_field( $params['since'] ) : '';
		$direction = isset( $params['direction'] ) ? sanitize_text_field( $params['direction'] ) : 'pull';

		FiveDPBR_Logger::info( 'staging', sprintf( 'Staging changes requested (since: %s, direction: %s).', $since, $direction ) );

		// TODO: Implement change detection in a future staging phase.
		// For now, return an empty change set.
		return new WP_REST_Response(
			array(
				'success' => true,
				'data'    => array(
					'files'     => array(),
					'tables'    => array(),
					'since'     => $since,
					'direction' => $direction,
					'timestamp' => current_time( 'mysql', true ),
				),
			),
			200
		);
	}

	/**
	 * Endpoint: Synchronize staging changes.
	 *
	 * Applies a set of changes between production and staging.
	 *
	 * @since 1.0.0
	 *
	 * @param WP_REST_Request $request The request object.
	 * @return WP_REST_Response
	 */
	public function endpoint_staging_sync( $request ) {
		$params    = $request->get_json_params();
		$direction = isset( $params['direction'] ) ? sanitize_text_field( $params['direction'] ) : 'pull';
		$scope     = isset( $params['scope'] ) ? $params['scope'] : array();

		FiveDPBR_Logger::info( 'staging', sprintf( 'Staging sync initiated (direction: %s).', $direction ) );

		// TODO: Implement full sync in a future staging phase.
		return new WP_REST_Response(
			array(
				'success' => true,
				'message' => __( 'Sync initiated.', '5dp-backup-restore' ),
				'data'    => array(
					'direction' => $direction,
					'scope'     => $scope,
					'timestamp' => current_time( 'mysql', true ),
				),
			),
			200
		);
	}

	/**
	 * Endpoint: Receive push data from the other site.
	 *
	 * Accepts file and database changes pushed from a remote site.
	 *
	 * @since 1.0.0
	 *
	 * @param WP_REST_Request $request The request object.
	 * @return WP_REST_Response
	 */
	public function endpoint_staging_push( $request ) {
		$params    = $request->get_json_params();
		$backup_id = isset( $params['backup_id'] ) ? sanitize_text_field( $params['backup_id'] ) : '';
		$changes   = isset( $params['changes'] ) ? $params['changes'] : array();

		if ( empty( $backup_id ) && empty( $changes ) ) {
			return new WP_REST_Response(
				array(
					'success' => false,
					'message' => __( 'No push data provided.', '5dp-backup-restore' ),
				),
				400
			);
		}

		FiveDPBR_Logger::info( 'staging', sprintf( 'Push data received (backup_id: %s).', $backup_id ) );

		// TODO: Implement push handling in a future staging phase.
		return new WP_REST_Response(
			array(
				'success' => true,
				'message' => __( 'Push data received.', '5dp-backup-restore' ),
				'data'    => array(
					'backup_id' => $backup_id,
					'timestamp' => current_time( 'mysql', true ),
				),
			),
			200
		);
	}

	/**
	 * Endpoint: Serve pull data to the requesting site.
	 *
	 * Packages and serves changes that the remote site is pulling.
	 *
	 * @since 1.0.0
	 *
	 * @param WP_REST_Request $request The request object.
	 * @return WP_REST_Response
	 */
	public function endpoint_staging_pull( $request ) {
		$params = $request->get_json_params();
		$scope  = isset( $params['scope'] ) ? $params['scope'] : array();
		$since  = isset( $params['since'] ) ? sanitize_text_field( $params['since'] ) : '';

		FiveDPBR_Logger::info( 'staging', sprintf( 'Pull request received (since: %s).', $since ) );

		// TODO: Implement pull data serving in a future staging phase.
		return new WP_REST_Response(
			array(
				'success' => true,
				'message' => __( 'Pull data prepared.', '5dp-backup-restore' ),
				'data'    => array(
					'scope'     => $scope,
					'since'     => $since,
					'changes'   => array(),
					'timestamp' => current_time( 'mysql', true ),
				),
			),
			200
		);
	}
}
