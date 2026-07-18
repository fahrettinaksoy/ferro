# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Settings now drive the engine.** The Settings window pushes a consolidated runtime-settings object to the main process on startup and on every save, wiring these previously UI-only preferences to real behavior:
  - **Connection:** connect timeout, retry count + delay (feeds the transfer retry/backoff engine), FTP keep-alive toggle.
  - **File exists policy:** overwrite / overwrite-if-newer / overwrite-if-different-size / resume / rename / skip, applied per transfer for both directions (the "ask" dialog remains future work and falls back to resume).
  - **FTP transfer type:** ASCII/binary auto-classification (by extension, extension-less, and dotfile rules) issuing `TYPE A`/`TYPE I`.
  - **Editor:** a custom editor path (with a working "Browse…" picker) is launched for edit-in-place instead of the system default.
  - **Logging:** file-logging on/off and rotation size.
  - **Updates:** release channel (stable/beta/nightly) and check frequency (daily/weekly/never).
- **Master password vault mode.** Credentials can be protected with a user master password (scrypt key derivation + AES-256-GCM) as an alternative to the OS keychain, for portable installs or systems without a keyring. Includes a set/change flow, a switch-back-to-keychain flow, and a startup unlock dialog; secrets are re-encrypted when the master password changes.
- **SFTP proxy support.** Connections can be routed through an HTTP CONNECT or SOCKS4/SOCKS5 proxy (via ssh2's socket option).
- **Sidebar swap.** The "swap panes" interface preference moves the sidebar to the right; the message log can be hidden.

### Fixed

- Connection pool no longer leaks a live connection when a session is closed while a new connection is still being opened (destroy race), and pool accounting stays consistent across destroy paths.
- Transfer queue records and job-ownership entries are pruned when a job reaches a terminal state (completed/failed/cancelled) — long sessions no longer grow memory unboundedly.
- Disconnecting a session now cleanly cancels its queued and active transfers (abort + retry timers cleared) instead of letting them churn through retries against a closed pool.
- The transfers pause/resume menu action reports IPC failures via toast like the toolbar button does.
- Log redaction masks the full remainder of `PASS`/`ACCT` lines (passwords containing spaces no longer leak their tail).
- Auto-updater silently skips when `app-update.yml` is absent (unpacked/dev builds) instead of logging an ENOENT error.
- Error toasts are now localized: `FerroError` codes are translated through the i18n catalog, so English users no longer see Turkish engine messages.
- File-list transfer buttons are excluded from the tab order (`tabindex="-1"`) to conform to the ARIA listbox pattern.

### Security

- **FTPS certificate pinning:** trusting a self-signed certificate now pins its SHA-256 fingerprint. If the server later presents a different certificate, a prominent "certificate has changed" warning is shown instead of connecting silently (possible MITM). Previously trust was recorded per host:port only; those legacy entries are re-confirmed once and upgraded to pinned entries.
- **Runtime IPC validation:** every IPC channel payload is now validated against a schema (zod) at the router boundary; unknown fields are stripped and invalid payloads are rejected before reaching handlers.
- **IPC sender verification:** IPC calls are only accepted from the application's own top-level frame.
- **Local filesystem guardrails:** destructive local operations (delete, rename source) refuse the filesystem root, drive roots and the home directory itself; all local paths are normalized and must be absolute.
- **Reduced renderer attack surface:** the generic raw IPC passthrough bridge (with `process.env` exposure) was removed; only the typed `window.ferro` API remains.
- **External link hardening:** `shell.openExternal` is restricted to `https:`, `http:` and `mailto:` URLs; in-app top-level navigation is blocked.
- **Stricter CSP:** added `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`, `frame-src 'none'`; removed unused Google Fonts allowances.

### Added (UI & quality)

- **Virtualized file lists:** both panes now render through a virtual scroller, so directories with thousands of entries stay fast (only visible rows are in the DOM).
- **Keyboard navigation & accessibility:** file lists are keyboard-operable (arrow keys, Home/End, Enter to open/transfer, Backspace for parent directory, Delete, Shift+F10/context-menu key), with listbox ARIA semantics, focusable sort-header buttons with `aria-sort`, and `aria-label`s on icon-only buttons.
- **Settings now take effect:** file size format (bytes/IEC/SI, thousands separator, decimal places), date/time format (system/ISO/custom strftime subset), file list sorting (dirs-first/files-first/mixed, case/natural name sort), double-click behavior (transfer/view-edit/none) and the concurrent-transfers count (drives the connection pool size for new sessions) are all wired to real behavior.
- Richer error taxonomy (`NOT_FOUND`, `PERMISSION_DENIED`, `TIMEOUT`) classified structurally from FTP reply codes / SFTP status codes / system errno instead of message regexes; timeouts are retried, permanent errors are not.
- **Transfer retry with backoff:** transient failures (connection drops, transfer errors) are retried up to 3 times with exponential backoff + jitter; each retry acquires a fresh pooled connection, so dropped connections auto-reconnect. Permanent errors (auth, rejected certificates) are not retried.
- **SFTP resume:** interrupted SFTP downloads continue from the local offset and interrupted uploads continue via append — verified against a real OpenSSH server in integration tests.
- **Graceful SFTP cancel:** cancelling an SFTP transfer destroys the transfer stream instead of killing the SSH connection; the connection returns to the pool for the next job.
- **Rotating file logs:** the main process now logs to `app.getPath('logs')/ferro.log` with size-based rotation (5 MB × 5 files), ISO timestamps and automatic credential redaction (`PASS`/`password`/`passphrase` patterns are masked).
- Process-level `uncaughtException`/`unhandledRejection` handlers that record crashes to the log file.
- Per-site connection limit (`maxConnections`) is now wired into the transfer connection pool (1–10, default 3).
- Test coverage tooling (`@vitest/coverage-v8`, `npm run test:coverage`) and new unit suites: store corruption/migration, vault fallback, connection pool edge cases, IPC validation, transfer retry, EditManager; plus SFTP resume integration tests.
- ESLint (flat config) with TypeScript and Vue support; `npm run lint` now works.
- GitHub Actions CI (lint, typecheck, unit tests, Docker-backed integration tests, package smoke test) and a tag-triggered multi-platform release workflow that publishes to GitHub Releases.
- Dependabot for npm and GitHub Actions updates.
- Conventional Commits enforcement via commitlint + husky; staged-file linting via lint-staged.
- Community files: CONTRIBUTING, CODE_OF_CONDUCT, issue/PR templates, security policy.
- `test:unit` / `test:integration` script split so the fast suite runs without Docker.

### Changed

- **SettingsDialog split:** the 1600-line settings god-component was decomposed into 22 per-page child components under `components/settings/` (no behavior change).
- Host key and TLS certificate approval prompts now time out after 5 minutes (rejecting safely) instead of hanging the connection forever if the UI cannot answer.
- Transfer job IDs are session-prefixed, so cancelling a job in one session can never hit a job in another.
- Bandwidth throttling switched to a token-bucket pacer — after a stall it no longer "catches up" with an unbounded burst.
- Recursive folder transfers guard against pathological/symlink-looped trees with a depth limit.
- Date/number formatting follows the UI language instead of hardcoded `tr-TR`; remaining hardcoded Turkish strings (protocol descriptions, theme scheme/font names, folder tooltip suffix) moved into the i18n catalogs.
- Duplicated renderer logic consolidated: one `sortEntries`/name-comparator module, one path-join module, one `errText` helper; `vue-router` removed (single-view app renders `MainView` directly).
- Startup IPC failures and pause/resume errors now surface as error toasts instead of unhandled rejections.
- **Durable stores:** `sites.json`, `known_hosts.json` and `trusted_certs.json` are now written atomically (temp file + rename) with a `{version, data}` schema envelope. Corrupted files are quarantined as `.corrupt` instead of being silently overwritten, and legacy formats migrate automatically.
- **Credential fallback policy:** when OS-level encryption (`safeStorage`) is unavailable, passwords are no longer persisted as base64 — the site is saved without a stored password and the user is prompted at connect time. Existing `p0:` records remain readable.
- Connection pool rewritten: leased-connection tracking (session teardown closes in-flight connections), waiter timeouts, waiter promotion on dead-connection returns, and drift-free size accounting.
- Toolchain and dependencies upgraded; `npm audit` is now clean (0 vulnerabilities).
- Auto-update feed now uses GitHub Releases (was a placeholder URL).
- README rewritten in English (Turkish version available as README.tr.md).

## [0.1.0] - 2026-07-03

Initial development version: dual-pane FTP/FTPS/SFTP client with transfer queue,
connection pooling, resume (FTP), directory sync, edit-in-place, host key TOFU,
encrypted credential vault (OS keychain), bandwidth throttling and TR/EN localization.
