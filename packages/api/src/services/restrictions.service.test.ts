import { describe, it, expect } from 'vitest';
import {
  CAPABILITY_GROUPS,
  DEFAULT_BLOCKED_TOGGLES,
  LEGACY_BLOCKED_CAPABILITIES,
  expandCapabilities,
  resolveRestrictions,
} from './restrictions.service';

describe('expandCapabilities', () => {
  it('expands a toggle to its whole group', () => {
    expect(expandCapabilities(['install_plugins']))
      .toEqual(['delete_plugins', 'install_plugins', 'update_plugins']);
  });

  it('collapses edit_files when both editor toggles are on', () => {
    const caps = expandCapabilities(['edit_plugins', 'edit_themes']);
    expect(caps.filter((c) => c === 'edit_files')).toHaveLength(1);
    expect(caps).toEqual(['edit_files', 'edit_plugins', 'edit_themes']);
  });

  it('passes through single-capability toggles', () => {
    expect(expandCapabilities(['update_core', 'export', 'import']))
      .toEqual(['export', 'import', 'update_core']);
  });

  it('returns nothing for an empty list', () => {
    expect(expandCapabilities([])).toEqual([]);
  });

  it('ignores unknown toggles rather than throwing', () => {
    expect(expandCapabilities(['not_a_toggle'])).toEqual([]);
  });

  /**
   * The regression guard for this whole change: a blueprint with every toggle
   * checked must strip exactly what the hardcoded lockdown strips today. If this
   * fails, upgrading silently weakens every existing site.
   */
  it('covers exactly the legacy capability set when all toggles are on', () => {
    expect(expandCapabilities([...DEFAULT_BLOCKED_TOGGLES]))
      .toEqual([...LEGACY_BLOCKED_CAPABILITIES].sort());
  });

  it('offers a toggle for each of the seven UI switches', () => {
    expect(Object.keys(CAPABILITY_GROUPS).sort()).toEqual([
      'edit_plugins', 'edit_themes', 'export', 'import',
      'install_plugins', 'install_themes', 'update_core',
    ]);
  });
});

describe('resolveRestrictions', () => {
  it('lets the blueprint win over the panel default', () => {
    const r = resolveRestrictions({
      blueprint: { disable_file_mods: false, blocked_capabilities: ['export'], hidden_menu_items: ['tools.php'] },
      panelDefault: true,
    });
    expect(r.restrict).toBe(true);
    expect(r.blockedCapabilities).toEqual(['export']);
    expect(r.hiddenMenus).toEqual(['tools.php']);
    expect(r.disableFileMods).toBe(false);
  });

  it('restricts nothing when the blueprint unchecks everything', () => {
    const r = resolveRestrictions({
      blueprint: { disable_file_mods: false, blocked_capabilities: [], hidden_menu_items: [] },
      panelDefault: true,
    });
    expect(r.restrict).toBe(false);
    expect(r.blockedCapabilities).toEqual([]);
    expect(r.hiddenMenus).toEqual([]);
    expect(r.disableFileMods).toBe(false);
  });

  it('treats an empty restrictions block as "unchecked everything"', () => {
    const r = resolveRestrictions({ blueprint: {}, panelDefault: true });
    expect(r.restrict).toBe(false);
    expect(r.blockedCapabilities).toEqual([]);
  });

  it('falls back to the full legacy lockdown when the blueprint says nothing', () => {
    const r = resolveRestrictions({ blueprint: undefined, panelDefault: true });
    expect(r.restrict).toBe(true);
    expect(r.blockedCapabilities).toEqual([...LEGACY_BLOCKED_CAPABILITIES].sort());
    expect(r.disableFileMods).toBe(true);
    expect(r.hiddenMenus).toEqual(['tools.php']);
  });

  it('restricts nothing when no blueprint block and the panel default is off', () => {
    const r = resolveRestrictions({ blueprint: undefined, panelDefault: false });
    expect(r.restrict).toBe(false);
    expect(r.blockedCapabilities).toEqual([]);
    expect(r.disableFileMods).toBe(false);
  });

  it('stays restricted when only file mods are disabled', () => {
    const r = resolveRestrictions({
      blueprint: { disable_file_mods: true, blocked_capabilities: [], hidden_menu_items: [] },
      panelDefault: false,
    });
    expect(r.restrict).toBe(true);
    expect(r.disableFileMods).toBe(true);
  });

  it('stays restricted when only a menu is hidden', () => {
    const r = resolveRestrictions({
      blueprint: { disable_file_mods: false, blocked_capabilities: [], hidden_menu_items: ['users.php'] },
      panelDefault: false,
    });
    expect(r.restrict).toBe(true);
  });

  it('expands blueprint toggles into real capabilities', () => {
    const r = resolveRestrictions({
      blueprint: { disable_file_mods: true, blocked_capabilities: ['install_plugins'], hidden_menu_items: [] },
      panelDefault: false,
    });
    expect(r.blockedCapabilities).toEqual(['delete_plugins', 'install_plugins', 'update_plugins']);
  });
});
