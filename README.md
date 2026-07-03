# Ferro

**A modern, security-focused FTP / FTPS / SFTP desktop client** built with Electron, Vue 3, Vuetify and TypeScript.

[![CI](https://github.com/fahrettinaksoy/ferro/actions/workflows/ci.yml/badge.svg)](https://github.com/fahrettinaksoy/ferro/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

_Türkçe belgeler için: [README.tr.md](README.tr.md)_

<!-- TODO: add screenshots (docs/screenshots/main.png) before the first public release -->

## Features

- **Protocols:** FTP, FTPS (explicit & implicit), SFTP
- **Dual-pane browsing** — local and remote panes with drag & drop transfers (files and folders)
- **Transfer queue** with connection pooling, parallel transfers, progress, cancel, and resume (FTP REST)
- **Directory synchronization** — compare local/remote and transfer the differences, direction-aware
- **Edit-in-place** — open a remote file in your local editor; saves upload automatically
- **Site Manager** — saved connections with folders, color labels and per-site advanced options
- **Security by default**
  - Credentials encrypted with the OS keychain (Electron `safeStorage`)
  - SSH host key trust-on-first-use with SHA-256 fingerprint pinning and change warnings
  - FTPS: strict certificate verification first (credentials never reach an unverified server); self-signed certificates require explicit approval and are **pinned by fingerprint**
  - Sandboxed renderer, context isolation, strict CSP, schema-validated IPC
- **Bandwidth throttling**, keep-alive, protocol log panel (command/reply stream)
- **Localization:** English and Turkish, Material 3 dynamic theming, auto-update

## Installation

Download the latest package for your platform from [Releases](https://github.com/fahrettinaksoy/ferro/releases):

- **macOS:** `Ferro-<version>-<arch>.dmg` (Apple Silicon + Intel)
- **Windows:** `Ferro-<version>-x64.exe` (NSIS installer)
- **Linux:** `Ferro-<version>-x64.AppImage` or `.deb`

## Development

Requires **Node.js 22** (`.nvmrc`) — and Docker if you want to run the integration tests.

```bash
npm install
npm run dev        # electron-vite dev server (HMR)
npm run typecheck  # tsc (main/preload) + vue-tsc (renderer)
npm run lint       # ESLint
npm run build      # typecheck + production bundle
npm run build:mac  # package for macOS (or build:win / build:linux)
```

> **Note:** if `ELECTRON_RUN_AS_NODE=1` is set, Electron starts as plain Node and no window opens. Run `unset ELECTRON_RUN_AS_NODE && npm run dev`.

### Try it against local test servers

```bash
docker compose -f test/docker-compose.yml up -d
npm run dev
# FTP  : localhost:21   user: ferro  pass: ferropass
# SFTP : localhost:2222 user: ferro  pass: ferropass
```

## Architecture

- **Main** (`src/main`) — Node.js process; the entire FTP/SFTP engine, session manager, transfer queue and persistent stores live here.
- **Preload** (`src/preload`) — hardened `contextBridge`; the renderer sees only the typed `window.ferro` API (`invoke` + `on`).
- **Renderer** (`src/renderer`) — Vue 3 + Vuetify UI with Pinia stores and vue-i18n.
- **Shared** (`src/shared`) — the single source of truth for the IPC contract (`ipc.ts`), error model (`errors.ts`) and domain types.

IPC is fully typed end-to-end: channels are declared in `InvokeMap`/`EventMap`, validated at runtime with zod in the main process, and errors cross the bridge as structured `FerroError`s.

## Testing

```bash
npm run test:unit                                  # fast, no external dependencies
docker compose -f test/docker-compose.yml up -d    # vsftpd + OpenSSH sftp
npm run test:integration                           # adapters/queue/session against real servers
```

The integration suite runs against real FTP/SFTP servers; see [test/COMPATIBILITY.md](test/COMPATIBILITY.md) for the server compatibility matrix.

## Contributing

Contributions are welcome! Please read [CONTRIBUTING.md](CONTRIBUTING.md) for the development workflow, commit conventions, and PR checklist. Security issues should be reported privately — see [SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE) © Fahrettin Aksoy
