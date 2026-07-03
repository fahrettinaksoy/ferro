# Contributing to Ferro

Thanks for your interest in contributing! This document explains how to set up a development environment, run the test suite, and submit changes.

## Development setup

Requirements:

- **Node.js 22** (see `.nvmrc` — `nvm use` picks it up automatically)
- **Docker** (only for the integration test suite)

```bash
git clone https://github.com/fahrettinaksoy/ferro.git
cd ferro
npm install
npm run dev        # electron-vite dev server with HMR
```

> **Note:** if `ELECTRON_RUN_AS_NODE=1` is set in your shell, Electron starts as plain Node and no window opens. Run `unset ELECTRON_RUN_AS_NODE && npm run dev`.

## Project layout

- `src/main` — Electron main process: transfer engine, IPC handlers, stores. All network and filesystem access lives here.
- `src/preload` — hardened `contextBridge` bridge. Only `window.ferro` (`invoke` + `on`) is exposed to the renderer.
- `src/renderer` — Vue 3 + Vuetify UI (Pinia stores, vue-i18n locales).
- `src/shared` — the typed IPC contract (`ipc.ts`), error model (`errors.ts`) and domain types (`transfer.ts`). **Every IPC channel is defined here and validated at runtime in `src/main/ipc/validation.ts` — when you add or change a channel, update both.**
- `test` — Vitest unit and integration tests plus the Docker compose file for real FTP/SFTP servers.

## Quality checks

```bash
npm run lint         # ESLint (flat config)
npm run typecheck    # tsc (main/preload) + vue-tsc (renderer)
npm run test:unit    # fast, no external dependencies
```

Integration tests run against real servers in Docker:

```bash
docker compose -f test/docker-compose.yml up -d
npm run test:integration
docker compose -f test/docker-compose.yml down
```

All four commands must pass before a PR can be merged; CI runs them automatically.

## Guidelines

- **i18n:** every user-facing string must go through vue-i18n and be added to **both** `src/renderer/src/locales/en.ts` and `tr.ts`. CI-visible reviews will reject hardcoded strings.
- **IPC safety:** never expose new preload APIs beyond `window.ferro`. New channels need a schema in `src/main/ipc/validation.ts`.
- **Security posture:** `contextIsolation`, `sandbox` and the strict CSP are non-negotiable. Changes that weaken them will not be accepted.
- **Style:** Prettier and ESLint are the source of truth (`npm run format`). Match the conventions of the surrounding code.

## Commit messages

We use [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/), enforced by commitlint via a git hook:

```
feat(transfer): add retry with exponential backoff
fix(sftp): preserve permissions on upload
docs: clarify FTPS certificate pinning behavior
```

Common types: `feat`, `fix`, `docs`, `refactor`, `test`, `build`, `ci`, `chore`.

## Submitting a pull request

1. Fork the repository and create a branch from `main`.
2. Make your change, including tests where it makes sense (the transfer engine and IPC layer especially).
3. Make sure lint, typecheck and tests pass.
4. Open a PR using the template. Keep PRs focused — one logical change per PR.

## Reporting security issues

Please **do not** open public issues for vulnerabilities — see [SECURITY.md](SECURITY.md).
