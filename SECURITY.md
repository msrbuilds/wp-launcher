# Security Policy

## Reporting a vulnerability

**Please do not open a public issue for a security problem.** Report it privately instead:

1. Go to the repository's **[Security → Advisories](https://github.com/msrbuilds/wp-launcher/security/advisories/new)** page.
2. Choose **Report a vulnerability** and fill in the form.

Only the maintainers can see the report. Please include:

- the WP Launcher version or commit you tested
- how WP Launcher was installed (local mode, VPS installer, or Dokploy) and which features were enabled
- steps to reproduce, or a proof of concept
- what an attacker gains, and what access they need first (anonymous, member, site owner, admin)

## What to expect

- An acknowledgement within **3 business days**.
- An assessment and an expected timeline within **10 business days**.
- A fix released before the details are made public, coordinated with you. We will credit you in the release notes and the advisory, unless you prefer not to be named.

## Supported versions

Security fixes go into the latest release. Upgrade with `wpl update`, the panel's update button, or `bash scripts/update.sh`.

| Version | Supported |
|---|---|
| 2.5.x (latest) | Yes |
| Older | No — please upgrade |

## Scope

In scope: the panel, the API, the provisioner, the WordPress image and mu-plugins shipped in this repository, the WP Launcher Connector plugin, the installers, and the editor extensions under `extensions/`.

Out of scope:

- Vulnerabilities in WordPress core or in third-party plugins and themes running inside a demo site. Report those upstream.
- Findings that need an already-compromised host, or a panel owner acting against their own install.
- Denial of service by flooding traffic.
