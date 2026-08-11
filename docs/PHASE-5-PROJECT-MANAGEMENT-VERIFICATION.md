# Phase 5 — Project Management Verification

## Objective

Wire the Phase 2 Project menu's Rename, Duplicate, and Delete Draft controls (previously no-ops) to a real
Workspace project-management abstraction, using a development-only adapter that matches the future Laravel
contract, without waiting for the backend. Download .sb3 (already functional) must keep working unchanged.

## Investigated Phase 2/3/4 seams

- **Project menu**: `packages/scratch-gui/src/components/kidscode-menu-bar/kidscode-project-controls.jsx` —
  `KidscodeProjectMenu` already had Rename/Duplicate/Download/Delete menu items and `RenameProjectDialog` /
  `DeleteDraftDialog` confirmation modals. Rename updated the Redux title locally and called a no-op
  `onRenameProject`; Duplicate and Delete called no-ops threaded from `render-gui.jsx`
  (`onDuplicateProject`/`onDeleteDraft` = `() => {}`). Download already worked via the real `SB3Downloader`.
- **Phase 3 session**: `useKidscodeWorkspaceSession()` (`src/contexts/kidscode-workspace-session-context.jsx`)
  exposes `project.project_ref`, `project.status`, `project.project_type`, and `workspace_access_token` — the only
  place these values are available. Previously only the Phase 4 persistence HOC read this context.
  `project.status` was defined in the PropTypes shape but never enforced anywhere.
- **Phase 4 persistence**: `kidscode-workspace-persistence-hoc.jsx` owns save/autosave and calls
  `vm.saveProjectSb3()`; `kidscode-development-persistence-adapter.js` + `kidscode-development-project-store.js`
  (IndexedDB, `kidscode-workspace-dev-store`) is the only development storage in the repo. The Phase 4 adapter
  factory pattern (`{environment, store}` options, `throw` if `environment === 'production'`,
  `createUnavailable...Adapter()` for production) was reused as-is for Phase 5.

## Architecture

```
KidscodeProjectMenu (presentational; unaware of adapters)
        ↓ onRenameProject / onDuplicateProject / onDeleteDraft (promises) + kidscodeProjectManagementStatus
KidscodeWorkspaceProjectManagementHOC              ← the "Kidscode Project Management Controller"
        ↓ (wraps useKidscodeProjectManagementController)
kidscode-workspace-project-management-contract.js  ← Project Management Interface
        ↓
kidscode-development-project-management-adapter.js (dev)   |  createUnavailable...Adapter() (production)
        ↓
kidscode-development-project-store.js (Phase 4's shared IndexedDB store, extended)
```

`KidscodeWorkspaceProjectManagementHOC` is mounted in `render-gui.jsx` **above** (wrapping)
`KidscodeWorkspacePersistenceHOC`, itself wrapped by `KidscodeWorkspaceLaunchHOC`:

```js
KidscodeWorkspaceLaunchHOC(compose(
    AppStateHOC, HashParserHOC, KidscodeWorkspaceProjectManagementHOC, KidscodeWorkspacePersistenceHOC
)(GUI))
```

This lets the new HOC (a) override `kidscodeWorkspaceState` to `PROJECT_DELETED` once a delete succeeds, which the
persistence HOC forwards on with the same launch-priority precedence it already gives Session Expired /
Corrupted Project, and (b) pass `kidscodeProjectDeleted` down as a boolean the persistence HOC checks before every
manual save and autosave attempt — the single, root-cause place both are blocked, instead of duplicating the
guard in the UI.

The mutation logic itself lives in a plain hook, `useKidscodeProjectManagementController`
(`use-kidscode-project-management-controller.js`), used by the HOC. Its three actions resolve with the adapter's
`data` payload on success or reject with the adapter's error on failure — no raw storage/adapter logic reaches
`KidscodeProjectMenu`, which only ever sees three promise-returning callbacks plus an `{isRenaming, isDuplicating,
isDeleting, deleted}` status object.

The UI must not know which adapter is active: `render-gui.jsx` selects
`createKidscodeDevelopmentProjectManagementAdapter()` when `process.env.NODE_ENV !== 'production'` and
`createUnavailableKidscodeWorkspaceProjectManagementAdapter()` (always rejects) otherwise — the exact same
production-safe selection pattern as the Phase 4 persistence adapter, enforced twice (selection site +
factory-level throw).

## Development adapter and store

`kidscode-development-project-management-adapter.js` implements `renameProject` / `duplicateProject` /
`deleteDraftProject` against the **same** IndexedDB store the Phase 4 persistence adapter uses
(`kidscode-workspace-dev-store`) rather than a second store. The store's `putProject` was changed from a blind
overwrite to a read-modify-write merge (`kidscode-development-project-store.js`), so a save from one adapter can
never erase metadata written by the other — this was necessary because both adapters now share one record per
`project_ref` (content fields owned by Phase 4, metadata fields — `title`, `projectType`, `status`, `createdAt`,
`updatedAt`, `deletedAt` — owned by Phase 5). The Phase 4 persistence adapter's `loadProject`/`saveProject` were
also given a small defense-in-depth check: they reject if the shared record's `deletedAt` is set, on top of the
client-side block described above.

## Rename behaviour

`renameProject({projectRef, workspaceAccessToken, title})`: trims the title, rejects if empty or over 100
characters (`KIDSCODE_PROJECT_TITLE_MAX_LENGTH`, matching the dialog's existing `maxLength`), rejects if the
project isn't a draft, persists `{title, status, updatedAt}` via the merge-put, and returns
`{success: true, data: {project_ref, title, updated_at}}`.

The Redux-visible title is **only** updated after this call resolves — `KidscodeWorkspaceProjectManagementHOC`
dispatches `setProjectTitle` in the success handler, not before. `menu-bar.jsx`'s old `handleRenameProject` (which
updated the title synchronously, then fired the — until now no-op — callback) was removed; `onRenameProject` is
now passed straight through as the already-composed, adapter-backed handler. On failure the dialog stays open,
shows a generic localized error, and the Rename button re-enables for a retry; the previously confirmed title is
never touched.

### Development-only: rename survives a close/reopen

A live-browser reopen check (`?launch=demo-lesson` after renaming) initially showed the *original* fixture title
again, not the renamed one — the rename correctly reached the shared IndexedDB store (item above), but the
development launch resolver (`createDevelopmentMockLaunchResolver`, Phase 3) serves a static, module-level fixture
object that never consulted it. This is fixed for development only: the resolver now reads the same
project-management store for the fixture's `project_ref` and, if a record with a `title` exists, overlays it onto
the (shallow-cloned, never-mutated) fixture response before resolving. If the read fails or no record exists yet,
it falls back to the static fixture title unchanged.

This is explicitly **not** a change to the Phase 3 session model or contract, and does not make IndexedDB
authoritative anywhere: the resolver is only ever constructed when `NODE_ENV !== 'production'`
(`render-gui.jsx` always selects a rejecting resolver in production, same guarantee as every other Phase 3/4/5
development factory), so this code path is unreachable outside local development. A real Laravel launch response
remains the sole authority for project title once connected — its own project table is the source of truth, and
there is no separate client-side store for it to disagree with, so there is nothing to hydrate against in
production. `title` was deliberately **not** added to the Phase 4 `LoadResult`/persistence contract to achieve
this — title hydration lives entirely in the launch resolver, reading the *metadata* the Phase 5 store already
had, not project content.

## Duplicate behaviour

`duplicateProject()` (the controller) calls `vm.saveProjectSb3()` **immediately**, converts the resulting Blob to
an ArrayBuffer (same conversion the Phase 4 HOC already does), and only then calls the adapter — so the duplicate
always contains whatever is currently visible in the editor, including edits that haven't been manually saved yet.
The adapter allocates a new `project_ref`, sets `status: draft` and **`project_type: independent` unconditionally**
— regardless of the original's status or type — and titles the copy `${currentConfirmedTitle} Copy`
(`buildDuplicateProjectTitle`) using the **current** confirmed title (i.e. reflecting an earlier rename in the same
session), not the launch-time title.

**Lesson projects always duplicate as independent drafts.** The request the controller sends to the adapter has no
`projectType` field at all — the original review round found that passing `session.project.project_type` straight
through would let a lesson project's duplicate also carry `project_type: lesson`, which is exactly the "student
ends up with two active lesson projects for the same assignment" outcome the product explicitly rules out. Since
`duplicateProject` never accepts a type from the caller, this can't be reintroduced by a future caller passing one
by mistake. The duplicate consequently has no `assignment_ref`/`course_ref`/`lesson_ref` association, matching the
existing convention that an independent project has none (see the `demo-independent` launch fixture).

**Why the current Workspace stays on the original project**: the Phase 3 `workspace_access_token` authorises only
the project that was actually launched; it is not assumed to authorise a project that didn't exist at launch time.
Nothing in the duplicate path mutates `session`, `project_ref`, or the launch token — the HOC's `duplicateProject`
callback only updates its own local dialog-facing state (`isDuplicating`, the resolved `{project_ref, title}`). The
duplicate becomes reachable later through the normal secure-launch flow, like any other project — that hand-off is
explicitly out of Phase 5's scope.

A `DuplicateProjectDialog` (new, same `Modal` pattern as Rename/Delete) opens the moment Duplicate is clicked,
shows a spinner while in flight, then either the new title or a retry-capable error.

## Delete Draft behaviour

`deleteDraftProject({projectRef, workspaceAccessToken})` requires `status === draft`, rejects if already deleted,
and otherwise sets `deletedAt` (soft delete — the record and its content are kept, only flagged, matching a
realistic backend "soft delete" and letting a future "My Scratch Projects" list still reference it).

On success, `KidscodeWorkspaceProjectManagementHOC` sets `kidscodeProjectDeleted = true` and forces
`kidscodeWorkspaceState = PROJECT_DELETED`, a new state value added to `kidscode-workspace-state.js` and rendered
by the existing `KidscodeWorkspaceBlockingState` modal (non-dismissable, same pattern as Session Expired /
Corrupted Project) with new "Draft Deleted" copy. From that point, for the rest of the page session: the
persistence HOC's `attemptSave` and its autosave-scheduling effect both bail out immediately on
`kidscodeProjectDeleted`, so neither manual Save nor autosave can fire; the Project menu's Rename/Duplicate/Delete
items are all disabled (`workspaceState === PROJECT_DELETED` short-circuits every `can*` check in
`KidscodeProjectMenu`). Phase 7's return-navigation redesign was explicitly out of scope — no navigation is
attempted from the blocking state.

Delete requires an existing confirmation dialog click (`DeleteDraftDialog`, reused, extended with an error/retry
state); a second click while a request is in flight is rejected by the controller
(`deleteInFlightRef`) rather than starting a duplicate request.

## Status restrictions (conservative rule, documented in `docs/SHARED-API-CONTRACT.md`)

No established product rule existed for anything but `draft` (every fixture/adapter response hard-codes
`status: "draft"`; the other three values never appear anywhere in the repo). Phase 5 adopts:

| Status | Rename | Duplicate | Delete |
| --- | --- | --- | --- |
| `draft` | allowed | allowed | allowed |
| `submitted` / `changes_requested` / `approved` | blocked | allowed | blocked |

Duplicate is allowed regardless of status because it only creates a new independent draft and never touches the
original's authorisation. Enforced twice: `KidscodeProjectMenu` greys out (and blocks the click on) Rename/Delete
using `session.project.status` (falling back to `draft` when no session/record exists, matching every fixture's
default), and the development adapter re-checks the shared store's `status` before mutating, so a stale/manipulated
client can't bypass it. This is flagged in the contract doc as a documented, reversible Phase 5 decision, not an
invented permanent rule — if Kidscode's real product rule differs, that's a future, explicit decision.

## Save/autosave interaction

- Rename only ever changes metadata (`title`); it never touches `.sb3` content or `projectChanged`/Saved-Unsaved
  state.
- Duplicate calls `vm.saveProjectSb3()` independently of the Phase 4 persistence HOC's own save cycle; it does not
  call `onSetProjectUnchanged()` and does not affect the original's Saved/Unsaved status — the duplicate is a
  separate record entirely.
- Delete stops all future saves for the (now deleted) original, described above.
- Regression-tested directly: `kidscode-workspace-persistence-hoc.test.jsx` gained two new tests confirming
  `kidscodeProjectDeleted` blocks both a manual save and an autosave triggered by `vm.emit('PROJECT_CHANGED')`.

## Security

- `project_ref` alone is never authorisation — every adapter call requires a non-empty `workspaceAccessToken`
  (`requireWorkspaceAccessToken`, same guard function pattern as Phase 4).
- No launch token, workspace access token, or credential is ever written to the IndexedDB store (confirmed by a
  dedicated test asserting `JSON.stringify(record)` never contains the token) or to `localStorage`/`sessionStorage`
  (grepped the full diff — no matches).
- No `console.log`/`console.info`/`debugger` anywhere in the diff (grepped).
- No hardcoded production API URL was introduced; the documented future Laravel endpoints
  (`PATCH`/`POST .../duplicate`/`DELETE`) are proposals only, in the contract doc.
- The development adapter throws if constructed with `environment: 'production'`, and `render-gui.jsx` only
  constructs it when `NODE_ENV !== 'production'` — production always gets the rejecting adapter, with no
  "Laravel failed → fall back to IndexedDB" path, identical to the Phase 4 guarantee.
- Duplicate never inherits or changes the current Workspace's session/token (see "Duplicate behaviour" above).

## Tests

New/updated Jest suites (all under `packages/scratch-gui/test/unit/`), 70 Phase 5–relevant tests, all passing:

- `util/kidscode-workspace-project-management-contract.test.js` (new) — unavailable adapter rejects all three
  actions; `buildDuplicateProjectTitle`; status enum; title length constant.
- `util/kidscode-development-project-management-adapter.test.js` (new) — token requirement, trim/empty/too-long
  title, status-restriction blocking for rename/delete, duplicate creates a new draft record containing the given
  `sb3` and leaves the original untouched, double-delete rejected, all three reserved failure fixtures, no token
  persisted.
- `util/kidscode-workspace-project-management-hoc.test.jsx` (new) — rename dispatches the confirmed title only on
  success, duplicate serialises the current vm content and does not touch `kidscodeWorkspaceState`/
  `kidscodeProjectDeleted`, delete sets both, a second concurrent rename is rejected rather than duplicated.
- `components/kidscode-project-controls.test.jsx` (rewritten for the new async/promise-based flow) — rename
  closes only after adapter confirmation and shows a retryable error on failure; duplicate dialog shows progress
  → success/failure with retry; delete failure keeps the confirmation dialog open and retryable; Rename/Delete
  disabled for a non-draft session, all three disabled once `PROJECT_DELETED`; disabled while another action is
  in flight.
- `util/kidscode-development-persistence-adapter.test.js` (extended) — `loadProject`/`saveProject` both reject
  once the shared record's `deletedAt` is set.
- `util/kidscode-workspace-persistence-hoc.test.jsx` (extended) — `kidscodeProjectDeleted` blocks manual save and
  autosave.

## Browser/demo verification

A live `webpack serve` instance was driven with a real headless Chromium (via `playwright-core`, not the
project's own Playwright *test runner*, which is not Jest-compatible and was not used) at 1440×900:

1. `?launch=demo-lesson` → title "Make the Cat Walk" visible.
2. Rename to "My Walking Cat" → dialog closed and title updated **only** after the (simulated) adapter round trip.
3. Duplicate (menu closed immediately) → "Your project was duplicated as "Make the Cat Walk Copy"." shown; the
   original project remained open the entire time.
4. `?launch=demo-independent` → Delete Draft confirmed → non-dismissable "Draft Deleted" blocking state shown.

**This browser pass caught a real bug** the unit tests did not: the first version of
`KidscodeWorkspaceProjectManagementHOC` destructured `projectTitle` out of its incoming props for its own internal
use (as the duplicate title base) but never re-forwarded it, silently breaking the existing
Launch-HOC → `TitledHOC` chain that seeds Redux's project title from the Kidscode session — the visible title got
stuck on the generic "Scratch Project" default instead of the real launch title. Fixed by reading the store's own
live title under a distinctly-named prop (`confirmedProjectTitle`, from a fresh `mapStateToProps`) instead of
intercepting the `projectTitle` ownProp that passes through this layer. Re-verified in the browser after the fix;
all four steps above passed. All 70 relevant Jest tests and the full 429-test suite were re-run clean afterward.

## Responsive result

Checked in the same real-browser harness: 1440×900, 1366×768, 1280×800, 1024×768 — Project menu and Save button
visible and usable, Rename menu item reachable, at every size. At 800×600 (below the existing 1024 restriction)
the Project menu and Save button are correctly not shown — Phase 5 did not touch the `@media (max-width: 1025px)`
rule or the Phase 1 device-support gate, only added non-layout-affecting CSS (`.disabled-menu-item`,
`.dialog-error`, `.duplicate-message`).

## Phase 1–4 regression

- Full `scratch-gui` unit suite (`test/unit`): **59/59 suites, 429/430 tests passing, 1 pre-existing skip** — run
  both before any Phase 5 code changes (baseline) and again after the final fix; identical pass count both times.
- Full `eslint` (`test:lint` scope): clean, 0 errors/warnings.
- `npm run i18n:src`: succeeded; every new message id (`kidscode.renameProject.failed`,
  `kidscode.deleteDraft.failed`, `kidscode.duplicateProject.*`, `kidscode.workspaceState.projectDeleted*`,
  `kidscode.projectDialog.tryAgain`/`ok`) confirmed present in the generated (gitignored) translation source.
- `webpack` dev build (`BUILD_TYPE=dev webpack`, invoked directly since the `build:dev` npm script itself is not
  Windows-portable — it's missing `cross-env`, unrelated to Phase 5): compiled successfully with no errors.
- Phase 2 chrome (File/Edit/Project/Settings menus, Save/Submit buttons, student indicator, no Share/no See
  Project Page/no Backpack in Kidscode mode) unaffected — no Phase 2 files outside the Project menu/menu-bar
  prop-threading were touched.
- Phase 3 launch flow, four launch types, token cleanup, expired/invalid/denied/offline states: untouched logic;
  `kidscode-workspace-launch.js` gained three new fixture project_refs, three new demo launch tokens, and (as a
  post-review correction) development-only title hydration in `createDevelopmentMockLaunchResolver` — additive to
  the resolver's options (a new optional `store` parameter, defaulted so existing callers are unaffected) and
  guarded by the same `environment !== 'production'` check every other development factory already uses.
- Phase 4 save/load/autosave/version_ref: covered by the full unchanged Phase 4 test suite passing, plus the two
  new deletion-interaction tests above.

## Files changed

**New:**
- `packages/scratch-gui/src/lib/kidscode-workspace-project-management/kidscode-workspace-project-management-contract.js`
- `packages/scratch-gui/src/lib/kidscode-workspace-project-management/kidscode-development-project-management-adapter.js`
- `packages/scratch-gui/src/lib/kidscode-workspace-project-management/use-kidscode-project-management-controller.js`
- `packages/scratch-gui/src/lib/kidscode-workspace-project-management/kidscode-workspace-project-management-hoc.jsx`
- `packages/scratch-gui/test/unit/util/kidscode-workspace-project-management-contract.test.js`
- `packages/scratch-gui/test/unit/util/kidscode-development-project-management-adapter.test.js`
- `packages/scratch-gui/test/unit/util/kidscode-workspace-project-management-hoc.test.jsx`

**Modified:**
- `docs/SHARED-API-CONTRACT.md` — new Phase 5 section appended; Phase 3/4 sections untouched.
- `packages/scratch-gui/src/components/kidscode-menu-bar/kidscode-project-controls.jsx` — status/in-flight gating,
  async rename/delete confirm handlers, new `DuplicateProjectDialog`, new messages.
- `packages/scratch-gui/src/components/kidscode-menu-bar/kidscode-project-controls.css` — 3 new classes.
- `packages/scratch-gui/src/components/kidscode-menu-bar/kidscode-workspace-state.jsx` — `PROJECT_DELETED`
  blocking-state copy.
- `packages/scratch-gui/src/components/menu-bar/menu-bar.jsx` — removed the optimistic `handleRenameProject`
  wrapper and now-dead `onSetProjectTitle` plumbing; passes `workspaceState`/`kidscodeProjectManagementStatus`
  through to `KidscodeProjectMenu`.
- `packages/scratch-gui/src/components/gui/gui.jsx` — threads `kidscodeProjectManagementStatus` to `MenuBar`.
- `packages/scratch-gui/src/lib/kidscode-workspace-launch.js` — 3 new failure-fixture project_refs + 3 new demo
  launch tokens; `createDevelopmentMockLaunchResolver` now overlays the development project-management store's
  title onto its fixture responses (development-only, additive `store` option, see "Development-only: rename
  survives a close/reopen" above).
- `packages/scratch-gui/test/unit/util/kidscode-workspace-launch.test.js` — explicit in-memory store injection
  (previously relied on jsdom lacking IndexedDB); new tests for the title-hydration behaviour above.
- `packages/scratch-gui/src/lib/kidscode-workspace-state.js` — `PROJECT_DELETED` state + priority ordering.
- `packages/scratch-gui/src/lib/kidscode-workspace-persistence/kidscode-development-persistence-adapter.js` —
  `deletedAt` guard on `loadProject`/`saveProject`.
- `packages/scratch-gui/src/lib/kidscode-workspace-persistence/kidscode-development-project-store.js` —
  `putProject` merge-put instead of overwrite; doc comment updated.
- `packages/scratch-gui/src/lib/kidscode-workspace-persistence/kidscode-workspace-persistence-hoc.jsx` —
  `kidscodeProjectDeleted` prop blocks manual save + autosave.
- `packages/scratch-gui/src/playground/render-gui.jsx` — mounts the new HOC, selects the new adapter, removes the
  three now-dead no-op callbacks it used to supply.
- `packages/scratch-gui/test/unit/components/kidscode-project-controls.test.jsx` — rewritten for async flow, new
  status/duplicate/failure tests.
- `packages/scratch-gui/test/unit/util/kidscode-development-persistence-adapter.test.js` — deletion-guard tests.
- `packages/scratch-gui/test/unit/util/kidscode-workspace-persistence-hoc.test.jsx` — `kidscodeProjectDeleted`
  tests.

No changes to `package.json`, `package-lock.json`, `scratch-vm`, `scratch-render`, `scratch-storage`, `blocks`, or
`paint`.

## Remaining Laravel integration

Everything under "Future Laravel HTTP endpoints" in `docs/SHARED-API-CONTRACT.md` (Phase 5 section) is a proposal
only. A real `LaravelProjectManagementAdapter` implementing the same three-function interface (`renameProject`/
`duplicateProject`/`deleteDraftProject`) needs to be written and wired into `render-gui.jsx`'s production branch;
nothing on the Workspace/UI side should need to change to accommodate it.

## Confirmation Phase 6 was not started

No Submit API, submission record, tutor review (mode or workflow), changes-requested workflow, approval workflow,
resubmission, parent visibility, automatic grading, or return-navigation redesign was implemented. `onSubmitProject`
remains the same no-op it was in Phase 2/4 (`render-gui.jsx`); it was not touched.

## PASS/FAIL

**PASS.** All 24 checklist items complete; full regression suite green; a real bug found via live-browser
verification was fixed and re-verified; no protected files touched; no secrets/tokens/console logging in the diff;
production fails closed with no development fallback.
