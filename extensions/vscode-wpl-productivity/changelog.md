# Changelog

## 0.2.7

- The status bar now says why it cannot show a total: `key rejected` when the
  panel refuses the API key, `offline` when the panel is unreachable, and
  `set API key` when none is configured. Hover for the panel URL and details.
- Whitespace around a pasted API key is now trimmed

## 0.2.6

- Added `apiKey` setting. WP Launcher now requires an owner/admin caller for
  productivity stats, so the status bar needs your panel's `API_KEY` to show
  today's total. Heartbeat tracking is unaffected and still needs no key.
- The status bar shows `set API key` when the key is missing, instead of `NaN`
- Stats requests that fail or return an unexpected body no longer render as `NaN`

## 0.2.5

- Added `heartbeatSecret` setting for authenticating heartbeats with WP Launcher API
- Secret is generated in Dashboard > Productivity > Cloud Settings and pasted into VS Code settings

## 0.2.0

- Refactored to use shared `@wpl/heartbeat-core` library
- Multi-editor support: same heartbeat protocol across VS Code, Cursor, Windsurf, Antigravity, Sublime Text, and JetBrains IDEs
- Updated repository link to github.com/msrbuilds/wp-launcher

## 0.1.0

- Initial release
- Automatic heartbeat tracking on file edit, save, and switch
- Per-language, per-project, and per-branch tracking
- Status bar showing today's coding time
- Configurable API URL and enable/disable toggle
- Batch heartbeat sending (every 30s)
- Offline queue with retry (up to 500 heartbeats)
- Backoff on consecutive failures
