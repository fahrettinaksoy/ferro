# Security Policy

## Reporting a vulnerability

Please **do not** report security vulnerabilities through public GitHub issues.

Instead, use one of these private channels:

- **GitHub Security Advisories** (preferred): [Report a vulnerability](https://github.com/fahrettinaksoy/ferro/security/advisories/new)
- **Email:** <backend@cyh.com.tr> — include "SECURITY" in the subject line

Please include: a description of the issue, steps to reproduce, the affected version/platform, and any suggested mitigation. You can expect an acknowledgement within **72 hours** and a status update within **7 days**. We will credit reporters in the release notes unless you prefer otherwise.

## Supported versions

| Version        | Supported           |
| -------------- | ------------------- |
| Latest release | ✅                  |
| Older releases | ❌ — please upgrade |

## Scope

Ferro is a desktop FTP/FTPS/SFTP client. Reports we are especially interested in:

- Credential exposure (vault, logs, memory of persisted files)
- Bypass of TLS certificate pinning or SSH host key verification
- Renderer → main privilege escalation (IPC validation bypass, sandbox escape)
- Path traversal in local or remote file operations
- Auto-update integrity issues

Plain FTP transmitting data unencrypted is a protocol property, not a vulnerability.

## Security posture

Measures currently in place:

- **Process isolation:** all network and Node.js access is confined to the main process. The renderer runs with `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false` and a strict CSP; the only bridge is the typed `window.ferro` API.
- **IPC hardening:** a single bridge channel, per-channel schema validation (zod), sender frame verification, and structured error serialization (no stack traces cross the bridge).
- **Credential storage:** passwords are encrypted with the OS keychain (`keyring`) or a user master password (scrypt + AES-256-GCM). When neither is available, secrets are not persisted and the user is warned.
- **SFTP host keys:** trust-on-first-use with SHA-256 fingerprint pinning and a prominent warning when a stored key changes.
- **FTPS certificates:** strict verification first (credentials are never sent to an unverified server); self-signed certificates require explicit user approval and are pinned by SHA-256 fingerprint, with a warning if the certificate later changes.
- **Local filesystem guardrails:** destructive operations refuse filesystem roots and the home directory; all paths are validated and normalized at the IPC boundary.
- **Navigation/link hardening:** new windows are denied, external links are restricted to `https:`/`http:`/`mailto:`, in-app navigation is blocked.

## Release integrity

Official builds are published via GitHub Releases by the CI release workflow. macOS and Windows packages are code-signed when signing certificates are configured; updates are verified with the Tauri updater's minisign signatures. Always download Ferro from the official repository's Releases page.
