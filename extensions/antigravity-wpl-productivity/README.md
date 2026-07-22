# WPL Productivity Tracker for Antigravity

Track your coding time automatically from Antigravity, Google's AI-powered IDE. Part of the [WP Launcher](https://wplauncher.msrbuilds.com) productivity monitoring system — a WakaTime-like time tracker that combines your coding activity with WordPress site activity in a single dashboard.

![Productivity Dashboard](https://raw.githubusercontent.com/msrbuilds/wp-launcher/main/extensions/screenshots/dashboard.png)

## What is WP Launcher?

[WP Launcher](https://wplauncher.msrbuilds.com) is a Docker-based platform for creating isolated WordPress demo sites on demand. It includes a built-in **Productivity Monitor** that tracks how you spend your development time — across code editors and WordPress admin panels.

This extension connects your editor to WP Launcher so your coding time is tracked alongside your WordPress activity.

## Features

- **Automatic time tracking** — records coding time in the background, no manual action needed
- **Per-language stats** — see how much time you spend in TypeScript, PHP, CSS, Python, and more
- **Per-project stats** — tracks time per workspace/project folder
- **Git branch tracking** — know which branch you were working on
- **Status bar** — shows today's total coding time at a glance (click to open dashboard)
- **Cloud sync** — syncs with WP Launcher cloud for cross-device aggregated stats
- **Privacy first** — data stays on your local machine, synced only when you explicitly connect a cloud account
- **Lightweight** — minimal CPU/memory footprint, heartbeats are debounced and batched

## Prerequisites

Before using this extension, you need:

1. **WP Launcher installed and running locally**
   - Download from [wplauncher.msrbuilds.com](https://wplauncher.msrbuilds.com) or install via:
     ```bash
     git clone https://github.com/msrbuilds/wp-launcher.git
     cd wp-launcher
     bash install.sh
     ```
   - The API runs on `http://localhost:3737` by default

2. **Productivity Monitor feature enabled**
   - Open WP Launcher dashboard (`http://localhost`)
   - Go to **Admin** > **Features**
   - Enable **Productivity Monitor**

3. **Cloud account linked**
   - Go to **Productivity** page in the dashboard
   - Click **Cloud Settings**
   - Enter your WP Launcher Cloud URL and API key
   - This is required for heartbeat tracking to be active

   ![Cloud API Keys](https://raw.githubusercontent.com/msrbuilds/wp-launcher/main/extensions/screenshots/cloud.png)

## Getting Started

1. **Install this extension** from [OpenVSX](https://open-vsx.org/extension/msrbuilds/wpl-productivity-antigravity)
2. **Verify WP Launcher is running** — open `http://localhost:3737/health` in your browser
3. **Start coding** — the extension activates automatically and begins tracking
4. **Check your stats** — click the "WPL: Xh Ym" indicator in the status bar, or open the Productivity page in WP Launcher

## How It Works

The extension sends lightweight "heartbeats" to your local WP Launcher API every time you:
- **Edit a file** — debounced to max 1 heartbeat per file per 2 minutes
- **Save a file** — always recorded immediately (marked as a "write" event)
- **Switch between files** — recorded when you change the active editor tab

Each heartbeat captures: relative file path, language, project name, git branch, editor name, and timestamp. **No file contents are ever sent.**

Heartbeats are queued locally and flushed to the API every 30 seconds. If the API is unreachable, heartbeats are kept in a local queue (up to 500) and retried with backoff.

## What It Tracks

| Metric | How |
|--------|-----|
| **Language** | Antigravity's built-in language detection (TypeScript, PHP, CSS, etc.) |
| **Project** | Workspace folder name |
| **File** | Relative path within the project (never absolute paths) |
| **Branch** | Current git branch via `git rev-parse` |
| **Editor** | `antigravity` |
| **Machine** | Antigravity's unique machine ID (for multi-device tracking) |
| **Saves** | File save events are marked separately for write-frequency stats |

## Viewing Your Stats

Your coding stats appear in WP Launcher's **Productivity** page (`http://localhost/productivity`) alongside WordPress site activity:

![Productivity Dashboard](https://raw.githubusercontent.com/msrbuilds/wp-launcher/main/extensions/screenshots/dashboard.png)

- **Daily activity chart** — coding vs WordPress time, day by day
- **Source split** — coding time vs WordPress admin time
- **Language breakdown** — time per programming language
- **Project breakdown** — time per workspace/project
- **Editor breakdown** — time per editor (VS Code, Cursor, Sublime, etc.)
- **Hourly activity** — when you're most productive
- **Weekday averages** — your weekly patterns
- **Daily goals** — set and track coding time goals
- **Current streak** — consecutive days with 30+ minutes of activity

## Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `wplProductivity.apiUrl` | `http://localhost:3737` | WP Launcher API URL |
| `wplProductivity.enabled` | `true` | Enable/disable tracking |

## Commands

Open the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`) and search for:

- **WP Launcher: Show Today's Stats** — opens the Productivity dashboard in your browser
- **WP Launcher: Toggle Tracking** — quickly enable or disable tracking

## Multi-Editor Support

WP Launcher Productivity extensions are available for multiple editors. All data flows to the same dashboard:

- **VS Code** — [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=msrbuilds.wpl-productivity)
- **Cursor** — [OpenVSX](https://open-vsx.org/extension/msrbuilds/wpl-productivity-cursor)
- **Windsurf** — [OpenVSX](https://open-vsx.org/extension/msrbuilds/wpl-productivity-windsurf)
- **Antigravity** (current) — [OpenVSX](https://open-vsx.org/extension/msrbuilds/wpl-productivity-antigravity)
- **Sublime Text** — [GitHub](https://github.com/msrbuilds/wp-launcher/tree/main/extensions/dist/sublime-text)
- **JetBrains IDEs** — Coming soon

## Troubleshooting

**Status bar shows "WPL: --"**
- Check that WP Launcher is running: `http://localhost:3737/health`
- Verify the API URL in settings matches your WP Launcher instance

**Heartbeats not being recorded**
- Ensure the Productivity Monitor feature is enabled in Admin > Features
- Ensure a cloud account is linked in the Productivity page > Cloud Settings
- Check the API URL setting (default: `http://localhost:3737`)

**Extension not activating**
- The extension activates on startup. Check `wplProductivity.enabled` is `true`
- Reload the window: `Ctrl+Shift+P` > "Developer: Reload Window"

## Privacy

- Heartbeats are stored locally in WP Launcher's SQLite database on your machine
- Only synced to the cloud when you explicitly connect a cloud account
- No file contents, code snippets, or sensitive data is ever collected — only metadata
- You can clear all productivity data anytime from the Productivity page
- You can disable tracking at any time via the Toggle Tracking command

## Links

- [WP Launcher Website](https://wplauncher.msrbuilds.com)
- [GitHub Repository](https://github.com/msrbuilds/wp-launcher)
- [Report Issues](https://github.com/msrbuilds/wp-launcher/issues)
