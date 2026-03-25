# WP Launcher Productivity Extensions

Pre-built extensions for tracking coding time across editors. All data flows to your local WP Launcher dashboard.

## VS Code

Install from [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=msrbuilds.wpl-productivity) or sideload:
```
code --install-extension wpl-productivity-0.2.0.vsix
```

## Cursor

Install from [OpenVSX](https://open-vsx.org/extension/msrbuilds/wpl-productivity-cursor) or sideload:
```
cursor --install-extension wpl-productivity-cursor-0.1.0.vsix
```

## Windsurf

Install from [OpenVSX](https://open-vsx.org/extension/msrbuilds/wpl-productivity-windsurf) or sideload:
```
windsurf --install-extension wpl-productivity-windsurf-0.1.0.vsix
```

## Antigravity (Google)

Install from [OpenVSX](https://open-vsx.org/extension/msrbuilds/wpl-productivity-antigravity) or sideload the `.vsix` file via the Antigravity CLI.

## Sublime Text

Copy the `sublime-text/` folder contents into your Sublime Text Packages directory:
- **macOS**: `~/Library/Application Support/Sublime Text/Packages/WPLProductivity/`
- **Linux**: `~/.config/sublime-text/Packages/WPLProductivity/`
- **Windows**: `%APPDATA%\Sublime Text\Packages\WPLProductivity\`

## JetBrains (PhpStorm, WebStorm, IntelliJ, PyCharm, GoLand, etc.)

Coming soon to JetBrains Marketplace. Source available in the repository at `extensions/jetbrains-wpl-productivity/`.

## Setup

1. Make sure WP Launcher is running (default: `http://localhost:3737`)
2. Enable **Productivity Monitor** in Admin > Features
3. Link a cloud account in the Productivity dashboard
4. Start coding — tracking begins automatically
