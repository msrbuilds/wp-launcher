# Changelog

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
