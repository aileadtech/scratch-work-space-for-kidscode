# Kidscode Scratch Workspace — Local Setup Guide

This repository's root (`packages/`, `package.json`, `LICENSE`, `TRADEMARK`, etc.) is an unmodified import of
the official Scratch Foundation editor monorepo. See [`UPSTREAM-SOURCE.md`](../UPSTREAM-SOURCE.md) for the
exact imported commit. This guide covers getting that untouched editor running locally on Windows.

## Prerequisites

### Official required environment

- Node.js `24.19.0` (see `.nvmrc`)
- npm `10.9.9`

### Environment verified on this machine

- Node.js `24.18.0` — one minor version behind the official pin. No Node version manager (`nvm`, `fnm`,
  `volta`) was available on this machine, and installing/replacing the system-wide Node install was
  deliberately not done, since other projects on this machine may depend on it. This gap was verified to
  cause **no observed problems** across a full install, build, dev-server, and editor smoke test.
- npm `10.9.9`, invoked per-command via `npx npm@10.9.9 <command>` rather than replacing the system-wide npm
  (`11.16.0`). This pins the exact required npm version without any system-wide change — `npx` runs it from
  its own cache.

New developers should use the exact `.nvmrc` Node version where practical (e.g., via `nvm-windows` on a
machine dedicated to this project).

### Other requirements

- Git for Windows (provides Git Bash — some upstream scripts, e.g. `scripts/update-legal.sh`, are POSIX shell).
- Recommended: `git config core.longpaths true` in this repo before installing — the monorepo's `node_modules`
  tree is deep enough to risk Windows path-length limits otherwise.

## Installation

```bash
git clone https://github.com/aileadtech/scratch-work-space-for-kidscode.git
cd scratch-work-space-for-kidscode
git checkout phase1/scratch-editor-import
npx npm@10.9.9 ci
```

Do not run `npm audit fix` or `npm audit fix --force` — see [Known dependency status](#known-dependency-status)
below.

## Required package build order

`scratch-gui`'s dev server resolves several sibling workspace packages via their built `dist/` output
(e.g. `packages/scratch-storage/package.json` → `"main": "./dist/node/scratch-storage.js"`). `npm ci` installs
dependencies but does not build them, so the following six packages must be built once, from the repository
root, before `npm start` will compile:

```bash
npx npm@10.9.9 run build --workspace=packages/task-herder
npx npm@10.9.9 run build --workspace=packages/scratch-storage
npx npm@10.9.9 run build --workspace=packages/scratch-svg-renderer
npx npm@10.9.9 run build --workspace=packages/scratch-paint
npx npm@10.9.9 run build --workspace=packages/scratch-render
npx npm@10.9.9 run build --workspace=packages/scratch-vm
```

`scratch-media-lib-scripts` is a dev-time asset-generation tool, not something `scratch-gui` imports at
runtime — it does not need to be built for local development.

## Running the editor

```bash
npx npm@10.9.9 start
```

- Local URL: **http://localhost:8601/**
- To stop: find the listening process and stop it —
  `netstat -ano | findstr :8601` (note the PID), then `taskkill /PID <pid> /F`. Plain `Ctrl-C` in the
  terminal that launched it also works for an interactive (non-backgrounded) run.
- If a previous run's process is still holding port 8601, `npm start` fails with `EADDRINUSE` — stop the old
  process first (steps above) before starting a new one.

## Common Windows issues encountered

- **`ECONNRESET` during `npm ci`.** An unstable network connection dropped mid-download. Fixed with a one-off
  retry using increased fetch tolerance — nothing persisted to config:
  ```bash
  npx npm@10.9.9 ci --fetch-retries=8 --fetch-retry-mintimeout=20000 --fetch-retry-maxtimeout=120000 --fetch-timeout=300000
  ```
- **Native `canvas` package file-lock (`EPERM`) during install.** `canvas` ships a prebuilt binary for
  `win32-x64` — `prebuild-install` downloaded it correctly, but hit a transient Windows file lock (`EPERM`,
  likely antivirus real-time scanning) renaming the temp file into the npm cache. This made the install
  fall back to compiling from source via `node-gyp`, which then failed because Visual Studio Build Tools
  (the "Desktop development with C++" workload) aren't installed on this machine. **A plain retry of
  `npm ci` resolved it** — the prebuilt binary was already fully cached by the first attempt, so the second
  attempt picked it up directly and never touched `node-gyp`. Visual Studio Build Tools were not needed and
  were not installed.
- **Windows path length.** The monorepo's `node_modules` tree is deep; `git config core.longpaths true` was
  set in this repo to reduce the risk of path-length failures.
- **Port already in use (`EADDRINUSE`).** See [Running the editor](#running-the-editor) above — a prior dev
  server instance can keep the port bound even after its parent `npm`/`npx` command reports failure.

## Verification checklist

Confirmed on this machine (Node `24.18.0`, npm `10.9.9` via `npx`):

- [x] `npx npm@10.9.9 ci` completes (2,837 packages installed)
- [x] The six sibling packages build with no errors
- [x] `npx npm@10.9.9 start` compiles with **zero webpack errors**
- [x] Editor loads at `http://localhost:8601/` (HTTP 200)
- [x] Stage appears
- [x] All block categories appear (Motion, Looks, Sound, Events, Control, Sensing, Operators, Variables, My Blocks)
- [x] Sprite pane and sprite controls appear
- [x] Green flag click works
- [x] No fatal JavaScript errors in the browser console (only benign React dev-mode warnings: a
      `defaultProps` deprecation notice, a list-key warning, and a null `projectId` prop on the standalone
      playground route)
- [x] Git working tree remains clean after install/build (nothing tracked changes; `node_modules` and `dist/`
      output stay git-ignored)

Not yet performed (future task): `.sb3` project export/reopen round-trip testing.

## Known dependency status

`npm audit` reports **80 vulnerabilities** in the imported upstream dependency tree: 6 low, 28 moderate,
37 high, 9 critical.

- These were reported by `npm audit` against the upstream-authored `package-lock.json`, unmodified by this
  import.
- No automatic fixes have been applied.
- `npm audit fix` (and especially `npm audit fix --force`) must **not** be run blindly — it can alter the
  upstream dependency tree and versions in ways that diverge from the officially maintained lockfile.
- These require a separate, deliberate compatibility and security review before any fix is applied.

## Licence reminder

- This repository contains AGPL-3.0-only Scratch-derived source at its root.
- `LICENSE`, `TRADEMARK`, and `UPSTREAM-SOURCE.md` must remain preserved and unmodified except through a
  deliberate, reviewed licence/provenance update.
- Never commit secrets, credentials, or student information to this repository — it is public.
