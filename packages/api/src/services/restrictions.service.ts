/**
 * Turns a blueprint's restriction toggles into the literal lists a site
 * container is launched with.
 *
 * Grouping happens here rather than in the mu-plugin so the policy is one
 * testable place and the plugin stays a dumb consumer of resolved lists.
 */

/**
 * Each UI toggle to the capabilities it blocks. Grouped because the alternatives
 * are incoherent: blocking `install_plugins` while allowing `update_plugins` is
 * not a restriction, since an "update" can carry arbitrary code.
 */
export const CAPABILITY_GROUPS: Record<string, string[]> = {
  install_plugins: ['install_plugins', 'update_plugins', 'delete_plugins'],
  install_themes: ['install_themes', 'update_themes', 'delete_themes'],
  edit_plugins: ['edit_plugins', 'edit_files'],
  edit_themes: ['edit_themes', 'edit_files'],
  update_core: ['update_core'],
  export: ['export'],
  import: ['import'],
};

/** Every toggle checked — the fallback for a blueprint that declares nothing. */
export const DEFAULT_BLOCKED_TOGGLES: readonly string[] = Object.keys(CAPABILITY_GROUPS);

/**
 * What the mu-plugin hardcoded before this change. Kept as the definition of
 * "fully locked" so the fallback path and the all-toggles-on path are provably
 * the same set — see the regression test.
 */
export const LEGACY_BLOCKED_CAPABILITIES: readonly string[] = [
  'install_plugins', 'install_themes', 'edit_plugins', 'edit_themes',
  'update_plugins', 'update_themes', 'update_core', 'delete_plugins',
  'delete_themes', 'export', 'import', 'edit_files',
];

/** The menus the legacy lockdown hid. */
export const LEGACY_HIDDEN_MENUS: readonly string[] = ['tools.php'];

export interface BlueprintRestrictions {
  disable_file_mods?: boolean;
  blocked_capabilities?: string[];
  hidden_menu_items?: string[];
}

export interface ResolvedRestrictions {
  /** True when anything at all is restricted; drives WPL_RESTRICT. */
  restrict: boolean;
  blockedCapabilities: string[];
  hiddenMenus: string[];
  disableFileMods: boolean;
}

/** Expand UI toggles into the real capabilities, deduplicated and sorted. */
export function expandCapabilities(toggles: string[]): string[] {
  const out = new Set<string>();
  for (const toggle of toggles) {
    // Unknown toggles are ignored rather than rejected: a blueprint may come
    // from a newer panel version than the one launching it.
    for (const cap of CAPABILITY_GROUPS[toggle] || []) out.add(cap);
  }
  return [...out].sort();
}

/**
 * A blueprint's `restrictions` block is authoritative — including when it is
 * empty, which means "the operator unchecked everything". Only a blueprint that
 * declares no block at all falls back to the panel-wide default, so existing
 * blueprints and API callers keep today's behaviour.
 */
export function resolveRestrictions(input: {
  blueprint?: BlueprintRestrictions;
  panelDefault: boolean;
}): ResolvedRestrictions {
  if (!input.blueprint) {
    return input.panelDefault
      ? {
          restrict: true,
          blockedCapabilities: [...LEGACY_BLOCKED_CAPABILITIES].sort(),
          hiddenMenus: [...LEGACY_HIDDEN_MENUS],
          disableFileMods: true,
        }
      : { restrict: false, blockedCapabilities: [], hiddenMenus: [], disableFileMods: false };
  }

  const blockedCapabilities = expandCapabilities(input.blueprint.blocked_capabilities || []);
  const hiddenMenus = [...(input.blueprint.hidden_menu_items || [])];
  const disableFileMods = input.blueprint.disable_file_mods === true;

  return {
    restrict: blockedCapabilities.length > 0 || hiddenMenus.length > 0 || disableFileMods,
    blockedCapabilities,
    hiddenMenus,
    disableFileMods,
  };
}
