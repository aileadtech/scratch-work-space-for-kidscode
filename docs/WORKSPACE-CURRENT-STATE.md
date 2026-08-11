# Kidscode Scratch Workspace — Current State

This is the **living handoff document**. Update it after every merged Workspace phase — see "Update rule" at the
bottom. It is not a historical changelog; keep it describing only the current state.

## Repository state

- main HEAD: `7598c7f3824eede4a4da808937f41dc371824572`
- Current completed phases: 1–5
- Current next phase: Phase 6 — Submission + Tutor Review

## Phase status

| Phase | Name | Status |
| --- | --- | --- |
| 1 | Workspace Foundation | COMPLETE |
| 2 | Kidscode Workspace Interface | COMPLETE |
| 3 | Secure Launch / Project Context | COMPLETE |
| 4 | Save / Load / Continue / Autosave | COMPLETE |
| 5 | Project Management | COMPLETE |
| 6 | Submission + Tutor Review | NOT STARTED |
| 7 | Navigation / Recovery | NOT STARTED |
| 8 | Production / Compliance | NOT STARTED |
| 9 | Final Verification | NOT STARTED |

## What works now

**Phase 1** — Scratch editor foundation; supported-viewport guard (sub-1024 width restricted).

**Phase 2** — Kidscode branding; Project menu controls (Rename/Duplicate/Download/Delete, then no-ops); Save/Submit
surfaces; project title and student display; Share / See Project Page / Backpack removed from the Kidscode UI.

**Phase 3** — one-time `?launch=` token; injected launch-resolver abstraction; `KidscodeWorkspaceSessionProvider`
(runtime memory only); resolved student/project context feeding the existing title/student UI; loading and error
blocking states (Session Expired, Access Blocked, Connection Lost); development mock launch resolver; production
fails closed (no real resolver configured yet).

**Phase 4** — real `.sb3` serialisation/load through the official VM exporter/importer; manual Save; debounced
autosave with concurrent-save and stale-edit protection; development-only IndexedDB persistence
(`kidscode-workspace-dev-store`); verified close/reopen restore; `version_ref` retained and sent as
`baseVersionRef`; starter/blank/corrupted-project handling; production fails closed.

**Phase 5** — Rename (adapter-confirmed, title updates only on success), Duplicate (serialises current, possibly
unsaved, editor state; always creates an **independent draft**, never a second lesson project attached to the
original assignment/course/lesson), Delete Draft (confirmation required; blocks Save/autosave/Rename/Duplicate
for the rest of that session once deleted); conservative status-restriction rule (Rename/Delete draft-only,
Duplicate always allowed); development rename survives a close/reopen (dev-only launch-resolver title hydration
from the shared store); production fails closed.

## Current architecture

```text
KidscodeWorkspaceLaunchHOC
  └─ compose(
       AppStateHOC,
       HashParserHOC,
       KidscodeWorkspaceProjectManagementHOC,
       KidscodeWorkspacePersistenceHOC
     )(GUI)
```

(Verified directly in `packages/scratch-gui/src/playground/render-gui.jsx`.) Launch wraps everything; Project
Management sits above (outside) Persistence so a successful Delete can force the launch-priority
`kidscodeWorkspaceState` to `PROJECT_DELETED` and block Persistence's save/autosave via a `kidscodeProjectDeleted`
prop — the persistence layer never needs to know *why* it's blocked, only that it is.

**Development adapters** (all environment-guarded, thrown-if-production):
- mock launch resolver (`createDevelopmentMockLaunchResolver`)
- IndexedDB persistence adapter (`createKidscodeDevelopmentPersistenceAdapter`)
- IndexedDB project-management adapter (`createKidscodeDevelopmentProjectManagementAdapter`)

The persistence and project-management adapters share **one** IndexedDB store
(`kidscode-workspace-dev-store`) rather than each keeping their own; the store's `putProject` merges partial
records so a save from one adapter cannot erase metadata written by the other.

**Future**: Laravel adapters/endpoints for all three, implementing the same interfaces — see
`docs/SHARED-API-CONTRACT.md`.

## Current sources of truth

- **Launch/session data**: `KidscodeWorkspaceSessionProvider` — set once per launch, immutable for the life of
  the page load.
- **Visible current project title (running session)**: the existing Scratch `state.scratchGui.projectTitle`
  Redux value, seeded from the launch session via `TitledHOC` and updated by Rename's success handler — *not*
  `session.project.title` directly (which stays frozen at its launch-time value).
- **Development project metadata** (title/type/status/timestamps): the shared IndexedDB store, written by the
  project-management adapter, read back by the development launch resolver on reopen (title only) and by the
  project-management adapter itself (status checks).
- **`.sb3` content**: the shared IndexedDB store's `sb3` field, written/read by the persistence adapter.
- **API shapes**: `docs/SHARED-API-CONTRACT.md` — do not duplicate its contents here.

Phase 5 decision worth remembering: the runtime-confirmed title is carried entirely through the existing Scratch
title/Redux flow, not through the (immutable) session object. Once a real Laravel launch response exists, it
becomes authoritative for title on every real launch — the development title-hydration trick in the mock
resolver has no production equivalent or code path.

## Security invariants

- The launch token is temporary, single-use, and removed from the URL (`history.replaceState`) after a
  successful resolve.
- `workspace_access_token` lives in runtime memory only.
- No auth credential of any kind is ever written to IndexedDB, `localStorage`, or `sessionStorage`.
- `project_ref` alone is never treated as authorisation — every adapter call requires the token too.
- Development adapters throw if constructed with `environment: 'production'`.
- Production never silently falls back to a development/mock adapter.

## Backend integration still missing

- **Phase 3**: real Laravel launch resolver (`POST /api/scratch/workspace/launch/resolve`).
- **Phase 4**: real Laravel project file load/save adapter (`GET .../file`, `POST .../save`).
- **Phase 5**: real Laravel rename/duplicate/delete adapter (`PATCH`/`POST .../duplicate`/`DELETE`).

None of these endpoints exist yet. See `docs/SHARED-API-CONTRACT.md` for the full proposed request/response
shapes — they are not duplicated here.

## Next Workspace phase

Phase 6: Submission + Tutor Review. Direction only, not designed here — that is Phase 6's own task.

## Update rule

After every merged Workspace phase, update this file:

- main HEAD
- phase status table
- "What works now"
- "Current architecture" (only if it changed)
- "Backend integration still missing"
- "Next Workspace phase"

Keep this file a snapshot of *now*, not a log of how it got here.
