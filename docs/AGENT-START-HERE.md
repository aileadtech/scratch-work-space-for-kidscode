# Kidscode Scratch Workspace — Agent Start Here

## What this repository is

This repository hosts the **Kidscode Scratch Workspace**: a customised build of the official Scratch Editor,
imported unmodified at the repository root (see `UPSTREAM-SOURCE.md`) and then extended for Kidscode's use.

- The Workspace is the student-facing Scratch editor students land in when Kidscode opens a project for them —
  it is a separate application from the main Kidscode frontend and backend, which live in other repositories.
- Kidscode-specific customisation is concentrated almost entirely in `packages/scratch-gui`, layered on top of
  the unmodified Scratch editor via composition (Higher Order Components, a dedicated `kidscode-*` file
  namespace) rather than by editing core Scratch files.
- The eventual production backend is a Laravel application (not in this repository). Until it exists, every
  backend-shaped behaviour (launch, save/load, rename/duplicate/delete) is served by an isolated
  development-only adapter that **fails closed** in production — there is no "real backend unavailable, fall
  back to the mock" path anywhere.

## First-read sequence

1. root `AGENTS.md`
2. `docs/AGENT-START-HERE.md` (this file)
3. `docs/WORKSPACE-CURRENT-STATE.md`
4. `docs/SHARED-API-CONTRACT.md`
5. the most recently completed phase's verification document (`docs/PHASE-N-*-VERIFICATION.md`)
6. only the files relevant to the current task

**Do not perform a whole-repository rediscovery unless the task actually requires it.** The documents above
already record the current architecture and seams; a targeted read of the specific files a task touches (plus a
quick `git log`/`git status` sanity check) is normally sufficient. Widen investigation only when a specific fact
needed for the task cannot be verified from these documents.

## Important code areas

A compact map — not an exhaustive file list:

| Area | Location |
| --- | --- |
| Kidscode menu bar / project controls | `packages/scratch-gui/src/components/kidscode-menu-bar/` |
| Workspace state enum + status/blocking UI | `packages/scratch-gui/src/lib/kidscode-workspace-state.js`, `.../components/kidscode-menu-bar/kidscode-workspace-state.jsx` |
| Workspace session context | `packages/scratch-gui/src/contexts/kidscode-workspace-session-context.jsx` |
| Secure launch | `packages/scratch-gui/src/lib/kidscode-workspace-launch.js`, `kidscode-workspace-launch-hoc.jsx` |
| Persistence (save/load/autosave) | `packages/scratch-gui/src/lib/kidscode-workspace-persistence/` |
| Project management (rename/duplicate/delete) | `packages/scratch-gui/src/lib/kidscode-workspace-project-management/` |
| Playground / HOC wiring entry point | `packages/scratch-gui/src/playground/render-gui.jsx` |
| Unit tests | `packages/scratch-gui/test/unit/{components,util}/kidscode-*` |
| Docs | `docs/` — this file, current-state, shared contract, testing guide, per-phase verification records |

## Architecture pattern

```text
Secure Launch (Phase 3)
        ↓
Workspace Session Context (Phase 3 — runtime memory only)
        ↓
Project Management HOC (Phase 5) → Persistence HOC (Phase 4)
        ↓
Scratch GUI / VM (unmodified)
```

Project management and persistence both follow the same adapter pattern: a small `*-contract.js` interface file
describes the shape; a **development adapter** implements it against an isolated local mock (IndexedDB / static
fixtures); a future **Laravel adapter** will implement the same interface against the real backend.
`render-gui.jsx` selects the adapter by `process.env.NODE_ENV` — production always receives an adapter that
rejects every call.

**UI components never contain raw backend/mock/storage logic.** `kidscode-project-controls.jsx`, `menu-bar.jsx`,
and `gui.jsx` only ever receive already-composed callback props and status objects from the relevant HOC.

## Development environment

- Node: `24.19.0` pinned (`.nvmrc`); `24.18.0` verified to work with no observed issues.
- npm: `10.9.9`, invoked via `npx npm@10.9.9 <command>` (see `docs/KIDSCODE-WORKSPACE-SETUP.md` for full local
  setup, including the required sibling-package build order).
- Start the dev server: `npx npm@10.9.9 start` (or `npm start` once the pinned version is active).
- Local URL: `http://localhost:8601/`
- Development launch fixtures live behind `?launch=<token>` query params (e.g. `demo-lesson`,
  `demo-independent`) — see `docs/SHARED-API-CONTRACT.md` and the relevant phase verification document for the
  current full list, including reserved failure fixtures.

## Protected boundaries

Summarised here; `AGENTS.md` is the source of truth — read it, do not duplicate it:

- No unrelated refactors; no dependency upgrades without need.
- `LICENSE`, `TRADEMARK`, `UPSTREAM-SOURCE.md` stay preserved and unmodified.
- Avoid modifying `scratch-vm`/`scratch-render`/`scratch-storage`/blocks/paint unless the phase genuinely
  requires it — stop and report before doing so if it seems necessary.
- No secrets/tokens/credentials in code, storage, or logs; no `console.log`/`console.info`/`debugger`.
- No development-adapter fallback in production.
- Do not deploy unless explicitly instructed.

## Phase workflow

```text
read compact context (this file + current-state + contract + last phase doc)
        ↓
create feature branch
        ↓
inspect relevant seams (targeted, not whole-repository)
        ↓
implement
        ↓
focused tests during development (docs/TESTING-GUIDE.md, Level 1)
        ↓
phase verification (docs/TESTING-GUIDE.md, Level 2)
        ↓
update docs/WORKSPACE-CURRENT-STATE.md
        ↓
review
        ↓
commit / PR / merge
```

**One Workspace phase per development session/branch**, unless explicitly directed otherwise.
