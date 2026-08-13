# Blueprint Restrictions — Design

**Goal:** Make the blueprint's restriction toggles actually govern a launched
site, so unchecking them yields a less restricted site and checking them all
preserves today's lockdown exactly.

**Tech Stack:** Express + better-sqlite3 (API), Dockerode (provisioner),
WordPress mu-plugin (PHP). No new dependencies.

---

## Background: the toggles have never done anything

The blueprint editor exposes three groups — Disable File Modifications, seven
Blocked Capabilities, six Hidden Admin Menu Items. All three are saved to the
blueprint and validated by zod, and **no code reads them**.

- `disable_file_mods`, `blocked_capabilities`, `hidden_menu_items` appear only in
  `blueprint.service.ts` (the type) and `utils/schemas.ts` (the schema).
- The entire mechanism is one boolean. The provisioner emits
  `WPL_RESTRICT=true|false` and nothing else.
- The mu-plugin hardcodes what it strips: a 12-entry `$restricted_caps` array, a
  fixed set of `remove_menu_page`/`remove_submenu_page` calls, and a fixed
  `$blocked_pages` list.
- `site.service` decides that boolean from
  `req.restrictCapabilities ?? policy.defaultRestrictCapabilities()` — the
  **panel-wide** setting — and never consults the blueprint at all.

So a site launches locked regardless of the blueprint, which is the reported bug.

### The two models also disagree

The mu-plugin strips 12 capabilities; the editor offers 7. Missing from the UI
entirely: `update_plugins`, `update_themes`, `delete_plugins`, `delete_themes`,
`edit_files`. The menu removals differ too — the plugin removes plugin-install,
theme-install, the editors, tools and update-core, while the UI offers tools,
settings, pages, users, plugins and appearance.

### What existing blueprints specify

All five shipped blueprints (`_default`, `demo-sqlite`, `demo-mysql`,
`demo-mariadb`, `demo-persistent`) list all 7 capabilities, hide `tools.php`, and
set `disable_file_mods: true`. Under the group mapping below those 7 expand to
exactly the 12 capabilities stripped today, so **their behaviour does not
change**.

The editor's default for a *new* blueprint is only 5 — it omits `export` and
`import`. A blueprint created in the panel is therefore already weaker than
`_default.json`. That is a pre-existing inconsistency and is corrected here.

## Decisions (from brainstorming)

- **The blueprint is authoritative.** Its lists decide what is restricted; all
  toggles off means stock WordPress. The panel-wide setting becomes the fallback
  for blueprints carrying no `restrictions` block.
- **Each UI toggle blocks a coherent capability group**, so the 7 toggles cover
  all 12 capabilities and incoherent states are impossible.
- **Submenu removal derives from the capability list**, not the menu list.
- **The editor default gains `export` and `import`**, matching the shipped
  blueprints.

---

## Architecture

```
blueprint.restrictions ──► site.service ──► provisioner ──► container env ──► mu-plugin
  disable_file_mods          resolve +        WPL_DISABLE_FILE_MODS
  blocked_capabilities[]     expand groups    WPL_BLOCKED_CAPS=a,b,c
  hidden_menu_items[]                         WPL_HIDDEN_MENUS=x,y
```

Group expansion happens **in the API**, so the mu-plugin receives a resolved,
literal list and stays free of policy. That also makes the mapping unit-testable
without a WordPress runtime.

## Components

### 1. `restrictions.service.ts` (new, API)

Pure functions, no I/O:

- `CAPABILITY_GROUPS: Record<string, string[]>` — the 7 toggles to their
  capabilities.
- `expandCapabilities(toggles: string[]): string[]` — deduplicated, sorted.
- `DEFAULT_BLOCKED_TOGGLES: string[]` — all 7, used as the fallback.
- `resolveRestrictions(input: { blueprint?: BlueprintRestrictions; panelDefault: boolean }): ResolvedRestrictions`
  where `ResolvedRestrictions = { restrict: boolean; blockedCapabilities: string[]; hiddenMenus: string[]; disableFileMods: boolean }`.

Resolution: a blueprint block wins outright. No block falls back to the panel
default — `true` yields the full legacy lockdown, `false` yields nothing
restricted.

### 2. Capability groups

| Toggle | Capabilities blocked |
|--------|----------------------|
| `install_plugins` | `install_plugins`, `update_plugins`, `delete_plugins` |
| `install_themes` | `install_themes`, `update_themes`, `delete_themes` |
| `edit_plugins` | `edit_plugins`, `edit_files` |
| `edit_themes` | `edit_themes`, `edit_files` |
| `update_core` | `update_core` |
| `export` | `export` |
| `import` | `import` |

All 7 expand to exactly the 12 the mu-plugin strips today. Grouping exists
because the alternatives are incoherent: blocking `install_plugins` while
allowing `update_plugins` is not a restriction, since an "update" can carry
arbitrary code.

### 3. Transport

`site.service` calls `resolveRestrictions` and passes the result to
`createSiteContainer`; the provisioner emits:

- `WPL_RESTRICT` — unchanged, true when anything at all is restricted
- `WPL_BLOCKED_CAPS` — comma-separated resolved capabilities
- `WPL_HIDDEN_MENUS` — comma-separated menu slugs
- `WPL_DISABLE_FILE_MODS` — `true|false`

### 4. mu-plugin becomes list-driven

`wp-launcher-restrictions.php` reads the three variables instead of its hardcoded
arrays:

- `user_has_cap` strips exactly the capabilities in `WPL_BLOCKED_CAPS`.
- `admin_menu` removes exactly the slugs in `WPL_HIDDEN_MENUS`, **plus** the
  submenus implied by the blocked capabilities: no `install_plugins` removes
  Plugins → Add New, no `edit_themes` removes the theme editor, and so on.
- `DISALLOW_FILE_MODS` / `DISALLOW_FILE_EDIT` are defined only when
  `WPL_DISABLE_FILE_MODS` is true.
- The `admin_init` page block and the REST write block derive from the same
  capability list rather than a separate hardcoded set.

## Failing closed

The property that matters most: **a missing `WPL_BLOCKED_CAPS` must mean full
lockdown, never none.** A container created by an older API, or one predating
this change, must not silently unlock when it gets a newer image.

So when `WPL_RESTRICT=true` and `WPL_BLOCKED_CAPS` is *absent*, the mu-plugin
applies today's hardcoded 12. Only an explicitly present-but-empty value means
"block nothing". The distinction is between an unset variable and an empty
string, and it is the difference between a safe upgrade and an accidental
exposure.

## Error handling

- **Unknown capability or menu slug in a blueprint** — passed through to
  WordPress, which ignores unknown capabilities and menu slugs. No crash, and no
  validation error, because a future WordPress may add capabilities this version
  has never heard of.
- **Blueprint with an empty `restrictions: {}`** — treated as a present block
  with empty lists: nothing restricted. This is the "I unchecked everything"
  case and must not be confused with an absent block.
- **Existing running sites** keep their current behaviour; nothing is
  retroactively changed.

## Testing

- **Unit, group expansion:** each toggle yields its group; all 7 yield exactly
  the 12 capabilities stripped today (the regression guard against weakening the
  default); an empty list yields empty; duplicates collapse (`edit_files` appears
  once when both editor toggles are on).
- **Unit, resolution:** a blueprint block wins over the panel default; an absent
  block with `panelDefault: true` yields the full legacy lockdown; an absent
  block with `panelDefault: false` restricts nothing; an empty block restricts
  nothing.
- **Live:** launch from a blueprint with everything unchecked and confirm
  Plugins → Add New is reachable and file editing works; launch from `_default`
  and confirm both are still blocked. This pair is the whole point — one proves
  the toggles work, the other proves the default did not regress.

## Rollout

The mu-plugin ships inside `wp-launcher/wordpress`, so the change reaches sites
only after the base image is rebuilt, and existing sites keep their behaviour
until relaunched. Sites with bind-mounted `wp-content` pick up new plugin *code*
on the next page load but cannot gain new env vars without being recreated —
which is exactly why the fail-closed fallback above is required rather than
merely prudent.

## Out of scope (YAGNI)

Per-site restriction overrides at launch time; a UI for the five capabilities not
currently exposed; restricting anything beyond capabilities, menus and file mods;
changing `panel.defaultRestrictCapabilities` semantics for blueprints that do
declare restrictions.
