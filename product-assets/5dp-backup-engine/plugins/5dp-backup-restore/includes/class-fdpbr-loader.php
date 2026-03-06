<?php
/**
 * Register all actions and filters for the plugin.
 *
 * @package    FiveDPBR
 * @subpackage FiveDPBR/includes
 * @since      1.0.0
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Class FiveDPBR_Loader
 *
 * Maintains a list of all hooks registered by the plugin
 * and registers them with the WordPress API.
 *
 * @since 1.0.0
 */
class FiveDPBR_Loader {

	/**
	 * Array of actions registered with WordPress.
	 *
	 * @since 1.0.0
	 * @var   array
	 */
	protected $actions = array();

	/**
	 * Array of filters registered with WordPress.
	 *
	 * @since 1.0.0
	 * @var   array
	 */
	protected $filters = array();

	/**
	 * Add an action to the collection.
	 *
	 * @since 1.0.0
	 * @param string $hook          The WordPress action hook name.
	 * @param object $component     The object instance containing the callback.
	 * @param string $callback      The callback method name.
	 * @param int    $priority      Optional. Hook priority. Default 10.
	 * @param int    $accepted_args Optional. Number of accepted arguments. Default 1.
	 */
	public function add_action( $hook, $component, $callback, $priority = 10, $accepted_args = 1 ) {
		$this->actions = $this->add( $this->actions, $hook, $component, $callback, $priority, $accepted_args );
	}

	/**
	 * Add a filter to the collection.
	 *
	 * @since 1.0.0
	 * @param string $hook          The WordPress filter hook name.
	 * @param object $component     The object instance containing the callback.
	 * @param string $callback      The callback method name.
	 * @param int    $priority      Optional. Hook priority. Default 10.
	 * @param int    $accepted_args Optional. Number of accepted arguments. Default 1.
	 */
	public function add_filter( $hook, $component, $callback, $priority = 10, $accepted_args = 1 ) {
		$this->filters = $this->add( $this->filters, $hook, $component, $callback, $priority, $accepted_args );
	}

	/**
	 * Add a hook to the given collection.
	 *
	 * @since  1.0.0
	 * @param  array  $hooks         The collection of hooks.
	 * @param  string $hook          The hook name.
	 * @param  object $component     The component instance.
	 * @param  string $callback      The callback method.
	 * @param  int    $priority      The hook priority.
	 * @param  int    $accepted_args Number of accepted arguments.
	 * @return array  The updated hooks collection.
	 */
	private function add( $hooks, $hook, $component, $callback, $priority, $accepted_args ) {
		$hooks[] = array(
			'hook'          => $hook,
			'component'     => $component,
			'callback'      => $callback,
			'priority'      => $priority,
			'accepted_args' => $accepted_args,
		);

		return $hooks;
	}

	/**
	 * Register all collected filters and actions with WordPress.
	 *
	 * @since 1.0.0
	 */
	public function run() {
		foreach ( $this->filters as $hook ) {
			add_filter(
				$hook['hook'],
				array( $hook['component'], $hook['callback'] ),
				$hook['priority'],
				$hook['accepted_args']
			);
		}

		foreach ( $this->actions as $hook ) {
			add_action(
				$hook['hook'],
				array( $hook['component'], $hook['callback'] ),
				$hook['priority'],
				$hook['accepted_args']
			);
		}
	}
}
