# Workspace Phase 4: Save, Load, Continue + Autosave Verification

## Result

**PASS** — the Workspace loads the correct saved/starter/blank project through the official Scratch VM importer,
serialises real edits through the official VM exporter on manual Save and debounced autosave, tracks
Unsaved/Saving/Saved/Save failed through the existing Kidscode workspace-state UI, and survives a genuine
close/reopen cycle (verified in a real, driven browser session, not just unit tests).

Phase 5 was not started.

## Objective

Phase 4 makes the actual Scratch project persistent: load an existing saved `.sb3` (or a lesson starter, or a blank
project) when the Workspace opens, track edits, save on demand or automatically, and restore the exact project
(blocks, sprites, costumes, sounds, variables) on a later open — all through an isolated persistence adapter so the
real Laravel API can replace the development mock later without touching the Workspace UI.

## Investigation findings

- **VM exporter/importer** — `vm.saveProjectSb3()` (`packages/scratch-vm/src/virtual-machine.js`) is the existing
  official serialiser (already used by Phase 2's `SB3Downloader`); it resolves with a `Blob`. `vm.loadProject()` is
  the existing official importer (already used by `SBFileUploaderHOC` for local file uploads); it accepts an
  `ArrayBuffer`, a string, or a plain object, and **rejects on invalid data** — the mechanism Phase 4 reuses for
  Corrupted Project detection. Critically, `vm.loadProject()` does **not** accept a raw `Blob` — passing one gets
  silently `JSON.stringify`'d into `"{}"`, which then fails validation. This was found only by driving the app in a
  real browser (see "Testing performed" below); the Workspace now explicitly converts the exporter's `Blob` to an
  `ArrayBuffer` (`blob.arrayBuffer()`) before it ever reaches the adapter or a later `vm.loadProject()` call.
- **Change detection** — `state.scratchGui.projectChanged`, already dispatched by the existing `vm-listener-hoc` on
  the VM's `PROJECT_CHANGED` event, is reused unmodified. Phase 4 dispatches `setProjectUnchanged()` after a
  successful load or save, exactly like the existing `vmManagerHOC`/`ProjectSaverHOC` do for the non-Kidscode path.
- **Kidscode workspace states** — `kidscode-workspace-state.js` and its UI (`kidscode-workspace-state.jsx`) already
  had `LOADING_PROJECT`, `SAVING`, `SAVE_FAILED`, `CORRUPTED_PROJECT` defined and fully rendered (status pill with
  retry, blocking modal) since Phase 2/3, anticipating Phase 4. No UI component changed.
- **Legacy `project-state.js` reducer** (the classic Scratch website save/load state machine: numeric project ids,
  remixing, copies) was deliberately **not** reused for Kidscode content — it models a different product (the
  scratch.mit.edu REST API) and driving it would fight the framework for no benefit. Kidscode instead extends the
  same `kidscodeWorkspaceState` mechanism the launch HOC already established, keeping one state model for the whole
  Workspace lifecycle instead of two.
- **`SAVED` is not synthesised by `resolveKidscodeWorkspaceState`** — that resolver (unchanged) only derives
  `SAVING`/`UNSAVED`; a `SAVED` value must be explicitly set and is then automatically superseded by `UNSAVED` the
  moment `projectChanged` next becomes `true`. Phase 4's controller relies on this existing behaviour rather than
  re-deriving it.

## Persistence architecture

```text
Existing Scratch GUI (vm.saveProjectSb3 / vm.loadProject)
        |
        v
KidscodeWorkspacePersistenceHOC   (Kidscode Save/Load Controller)
        |
        v
Workspace Persistence Interface   (kidscode-workspace-persistence-contract.js)
        |
        v
Development Persistence Adapter  <-- production instead uses an always-rejecting adapter
        |
        v
Development-only IndexedDB project store (kidscode-workspace-dev-store)
```

`KidscodeWorkspacePersistenceHOC` is inserted into the existing HOC chain in `render-gui.jsx`, between the launch
HOC (Phase 3, unchanged) and `GUI`:

```text
KidscodeWorkspaceLaunchHOC( AppStateHOC( HashParserHOC( KidscodeWorkspacePersistenceHOC( GUI ) ) ) )
```

This places it inside the redux `Provider` (so it can read `vm` and drive `projectChanged`) and inside the launch
HOC's session context (so it can read `project_ref`/`workspace_access_token`/`launch_type`). It owns the *content*
half of `kidscodeWorkspaceState` (`LOADING_PROJECT` for project-content loading, `SAVING`, `SAVED`, `SAVE_FAILED`,
`CORRUPTED_PROJECT`); the launch HOC still owns the *launch* half. Whichever is active takes priority — the
persistence controller only starts once the launch has resolved.

No IndexedDB call, raw `fetch`, mock project data, or `.sb3` binary handling exists in any UI component — it is
confined to `kidscode-development-project-store.js` (IndexedDB only) and
`kidscode-development-persistence-adapter.js` (mock business logic only).

## Development persistence adapter

`kidscode-development-persistence-adapter.js` implements the same `{loadProject, saveProject}` interface the future
Laravel adapter will. Like the Phase 3 development launch resolver, `createKidscodeDevelopmentPersistenceAdapter`
throws if constructed with `environment: 'production'`, and `render-gui.jsx` only ever constructs it when
`process.env.NODE_ENV !== 'production'` — production uses `createUnavailableKidscodeWorkspacePersistenceAdapter()`,
which always rejects. There is no "Laravel failed, fall back to IndexedDB" path.

`loadProject` requires a non-empty `workspaceAccessToken` (a `project_ref` alone is not authorisation) and then:

- returns the stored record if one exists for that `project_ref` (`source: "saved"`);
- otherwise returns the bundled starter project for `new_lesson` launches (`source: "starter"`);
- otherwise returns `source: "blank"` with `sb3: null`, leaving the Workspace's own already-loaded blank project in
  place.

`saveProject` requires the same token, increments a monotonic version (`SCR-DEV-VER-1`, `SCR-DEV-VER-2`, ...), and
persists `{project_ref, version_ref, version_number, saved_at, sb3}` — no token, launch data, or student identity.

Two reserved development `project_ref` fixtures, wired to dedicated launch tokens (see "Development demo" below),
let the failure paths be demonstrated without conditionals in UI code:

- `demo-save-failure` → every `saveProject` call rejects.
- `demo-corrupted-project` → `loadProject` returns deliberately unparsable bytes, so `vm.loadProject()` rejects.

## How `.sb3` is stored in development

`kidscode-development-project-store.js` wraps the browser's IndexedDB (`kidscode-workspace-dev-store`, object store
`projects`, keyed by `project_ref`) behind a `{getProject, putProject}` interface. It is the only file that touches
`indexedDB` anywhere in the Workspace. It stores only the fields above — never a launch token, workspace access
token, or student identity — so it persists across page reloads/browser reopens (verified live; see below) while
staying clearly isolated as development-only project storage, never credential storage.

## Manual save flow

Pressing Save calls the HOC's `handleManualSave`, which:

1. Serialises the current project via `vm.saveProjectSb3()` (official exporter), converts the resulting `Blob` to
   an `ArrayBuffer`.
2. Calls `adapter.saveProject({..., reason: "manual"})`; sets state to `SAVING` first.
3. On success: records the returned `version_ref` as the next save's `baseVersionRef`, dispatches
   `setProjectUnchanged()`, and sets state to `SAVED`.
4. On failure: sets state to `SAVE_FAILED`. The existing status pill's retry button
   (`onWorkspaceStateAction('saveFailed')`) re-attempts the save as a fresh manual save.

`Unsaved → Saving → Saved` and `Unsaved → Saving → Save failed → (retry) → Saved` were both driven end-to-end in a
real browser (see "Testing performed").

## Autosave flow

Every VM `PROJECT_CHANGED` event resets a single debounce timer (`KIDSCODE_AUTOSAVE_DEBOUNCE_MS`, declared once in
`kidscode-workspace-persistence-contract.js`, overridable via a `kidscodeAutosaveDebounceMs` prop for tests — the
same pattern the existing `ProjectSaverHOC.autoSaveIntervalSecs` prop already uses); a burst of edits (e.g. dragging
a block) therefore produces exactly one save once edits pause, not one per change. Autosave only arms after the
initial project load completes.

**Overlapping/stale saves:**

- A save already in flight is never duplicated — a second manual or autosave request while one is running is
  recorded as a single pending reason (manual takes priority over autosave) and runs immediately after the current
  save finishes.
- An edit that lands while a save is in flight is tracked via a change-generation counter incremented on every
  `PROJECT_CHANGED` event. If the generation changed between the start and end of a save, that save's success does
  *not* clear the Unsaved state (the just-persisted bytes didn't include the newer edit) — the next autosave or
  manual save covers it instead of the Workspace incorrectly showing stale content as Saved.

## Existing-project load behaviour

Once the launch session resolves and the Workspace's own initial blank project has finished loading
(`isShowingProject`), the controller calls `adapter.loadProject()` exactly once. If a saved project exists
(`source: "saved"`), its `sb3` is loaded via `vm.loadProject()` — the same official importer used for local file
upload — before the editor is exposed; the editor stays behind the existing `LOADING_PROJECT` blocking state until
that decision is made.

## New-project behaviour

`source: "blank"` (no saved record, non-`new_lesson` launch) leaves the VM's own already-loaded blank project as-is
— no extra `vm.loadProject()` call. `demo-new-independent` verified this in-browser.

## Starter-project behaviour

`source: "starter"` (no saved record, `new_lesson` launch) loads a small bundled starter project
(`kidscode-workspace-starter-project.js`: a "Starter Sprite" with a `when green flag clicked → move 10 steps`
script) via `vm.loadProject()`, reusing the same costume/backdrop assets already registered in the builtin asset
store by the editor's own default project — no new binary fixture committed. `demo-new-lesson` verified this
in-browser, including correct costume/backdrop rendering.

## Corrupted-project behaviour

Both failure sources map to the existing `CORRUPTED_PROJECT` blocking state (Project could not be opened /
"Your project data has not been changed."), and neither overwrites the VM with a blank project:

- the adapter successfully returns bytes, but `vm.loadProject()` rejects them (a genuinely corrupt `.sb3`);
- the adapter itself rejects (e.g. unreachable) — treated the same way rather than silently opening a blank project,
  per the Phase 4 requirement that a corrupted/unavailable server project must never auto-replace itself with blank
  content.

`demo-corrupted-project` verified the blocking modal in-browser.

## Save-failure behaviour

The `demo-save-failure` development fixture project always rejects `saveProject`, isolated entirely inside the
development adapter (no `if project title === ...` in UI code). Verified in-browser: drag a block → Unsaved → Save
→ Save failed with a Try again button, matching the required `Unsaved → Saving → Save failed` sequence.

## Version_ref behaviour

The latest `version_ref` returned by either `loadProject` or `saveProject` is kept in the controller's runtime
state and sent as `baseVersionRef` on the next `saveProject` call. Verified both by a focused unit test
(`SCR-DEV-VER-5` retained from load, sent as `baseVersionRef` on the next save) and by the development adapter's own
version-increment test (`SCR-DEV-VER-1` → `2` → `3` across repeated saves).

## Close/reopen persistence demo (performed live)

Driven with Playwright against the actual compiled dev server (`npm start`, `http://localhost:8601/`), not just
reasoning from the code:

1. Opened `http://localhost:8601/?launch=demo-lesson`; editor loaded, status pill read **Saved**.
2. Dragged a real "move 10 steps" block from the palette onto the canvas (genuine pointer drag, not a simulated
   event) — status pill changed to **Unsaved**.
3. Clicked **Save** — pill showed **Saving...**, then **Saved**.
4. Confirmed via `indexedDB.databases()` that `kidscode-workspace-dev-store` now exists, and that `localStorage`
   contained only the pre-existing, unrelated `minilogSettings` key (no Kidscode token of any kind); `sessionStorage`
   was empty.
5. Navigated again to `http://localhost:8601/?launch=demo-lesson` (a fresh launch, matching how the student would
   reopen — the one-time launch token is already removed from the URL bar by Phase 3's `history.replaceState` after
   the first success, so a bare page *reload* correctly hits Access Blocked; this is existing, verified Phase 3
   behaviour, not a Phase 4 regression).
6. The exact same "move 10 steps" block was present on the canvas, and the pill read **Saved** — confirmed visually
   via screenshot.

This run is what surfaced and confirmed the fix for the `Blob`-vs-`ArrayBuffer` bug described above; after the fix,
the full cycle passed as described.

## Download .sb3

Verified unchanged and still correct: after the close/reopen above, downloading `.sb3` via the existing Phase 2
`SB3Downloader` (unmodified) produced a 41,915-byte file named `Make the Cat Walk.sb3`, reflecting the restored
project. No duplicate download implementation was added — `SB3Downloader` already uses the same
`vm.saveProjectSb3()` exporter Phase 4 reuses, operating on the same shared VM instance Phase 4 loads content into.

## Security

- `workspace_access_token` is required by both adapter calls but is never written to the IndexedDB store, to
  `localStorage`, or to `sessionStorage` — confirmed by grep across all new/changed files and by a live
  `localStorage`/`sessionStorage`/`indexedDB.databases()` inspection in-browser.
- `project_ref` alone is not treated as authorisation (`loadProject`/`saveProject` both reject a missing token).
- The development adapter cannot be constructed with `environment: 'production'`, and `render-gui.jsx` only ever
  constructs it outside production — double-guarded exactly like the Phase 3 development launch resolver. Production
  uses an always-rejecting adapter; there is no mock fallback path.
- No hardcoded production Laravel URL exists anywhere (the only URL literal in changed files is the pre-existing,
  unrelated `https://scratch.mit.edu` logo destination).
- No `console.log`, `console.info`, or `debugger` in any new/changed file.

## Tests

### Automated focused tests

```text
npx jest --runInBand --runTestsByPath \
  test/unit/components/menu-bar.test.jsx \
  test/unit/components/kidscode-project-controls.test.jsx \
  test/unit/components/kidscode-workspace-state.test.jsx \
  test/unit/util/kidscode-workspace-launch.test.js \
  test/unit/util/kidscode-workspace-launch-hoc.test.jsx \
  test/unit/util/kidscode-development-persistence-adapter.test.js \
  test/unit/util/kidscode-workspace-persistence-hoc.test.jsx \
  test/unit/util/kidscode-workspace-persistence-contract.test.js
```

Result: **8 suites passed, 69 tests passed** (0 failed).

New Phase 4 coverage (22 tests across 3 new files) includes: saved/starter/blank load outcomes, corrupted-project
mapping from both a `vm.loadProject()` rejection and an adapter rejection, manual save's
Saving→Saved sequence (asserting the real `Blob`→`ArrayBuffer` conversion via `vm.saveProjectSb3`), save failure and
its retry path, debounced autosave (a burst of changes producing exactly one save), concurrent-save prevention, a
change landing mid-save not being reported as stale Saved, `version_ref` retention as the next `baseVersionRef`,
monotonic version incrementing, the reserved save-failure/corrupted-project fixtures, token requirement on both
adapter calls, the token never being persisted, and the production-guard throw on both the adapter factory and the
always-rejecting fallback.

Targeted ESLint (new/changed files) completed with **zero errors**; remaining warnings are the same pre-existing
`arrow-parens` style warnings already present on unrelated Phase 3 lines in the same files (confirmed by their
column/line positions matching code this phase did not touch).

No new `defineMessages`/`FormattedMessage` were added anywhere in this phase (all Workspace-state text already
existed from Phase 2/3), so `npm run i18n:src` was not required and was not run.

### Build

`BUILD_TYPE=dev npx webpack` (the Windows-equivalent of `npm run build:dev`, following the same POSIX-vs-Windows
note as the Phase 3 doc) compiled **successfully with zero errors**. `npm start` (`webpack serve`) also compiled
successfully and served the app used for all live browser verification below.

## Phase 1–3 regression result

**PASS**, verified both by the shared automated suite above and by driving the compiled app in a real browser:

- Phase 1: the four required viewports (1440×900, 1366×768, 1280×800, 1024×768) all loaded the editor with no
  horizontal overflow; 1023×768 correctly showed the existing "Screen too small" restriction.
- Phase 2: Kidscode branding, File/Edit/Project/Settings menus, Save/Submit buttons, project title, and student
  indicator all present; Share, See Project Page, and Backpack all confirmed absent from the rendered page and the
  File menu; the Project menu still lists Rename/Duplicate/Download .sb3/Delete draft/Return to My Scratch Projects.
- Phase 3: `demo-expired` → Session Expired, `demo-invalid`/`demo-denied` → Workspace Access Blocked, `demo-offline`
  → Connection Lost, all still correct; the one-time launch-token removal from the URL bar on success is intact
  (and is what makes a bare reload correctly show Access Blocked, as noted above).

## Responsive result

See Phase 1–3 regression above — all four required desktop viewports plus the sub-1024 restriction were checked
live against the Phase 4 build, not just the Phase 3 build.

## Diff and repository-cleanliness result

**PASS**:

- `git status --short --untracked-files=all` lists exactly the 12 files below — nothing stray.
- `git diff --check` reported no whitespace errors.
- No `package.json`/`package-lock.json`/`LICENSE`/`TRADEMARK`/`UPSTREAM-SOURCE.md` changes.
- No `scratch-vm`, `scratch-render`, `scratch-storage`, `scratch-paint`, or blocks changes.
- No committed `.sb3` fixtures, screenshots, dev logs, or webpack build output (all live browser-demo screenshots
  were written outside the repository, to the session scratchpad).
- No Phase 5 code (rename/duplicate/delete connections, project-management APIs, submission, tutor review,
  approval workflow, or return-navigation redesign).

## Git status

```text
 M docs/SHARED-API-CONTRACT.md
 M packages/scratch-gui/src/lib/kidscode-workspace-launch.js
 M packages/scratch-gui/src/playground/render-gui.jsx
?? docs/PHASE-4-SAVE-LOAD-CONTINUE-VERIFICATION.md
?? packages/scratch-gui/src/lib/kidscode-workspace-persistence/kidscode-development-persistence-adapter.js
?? packages/scratch-gui/src/lib/kidscode-workspace-persistence/kidscode-development-project-store.js
?? packages/scratch-gui/src/lib/kidscode-workspace-persistence/kidscode-workspace-persistence-contract.js
?? packages/scratch-gui/src/lib/kidscode-workspace-persistence/kidscode-workspace-persistence-hoc.jsx
?? packages/scratch-gui/src/lib/kidscode-workspace-persistence/kidscode-workspace-starter-project.js
?? packages/scratch-gui/test/unit/util/kidscode-development-persistence-adapter.test.js
?? packages/scratch-gui/test/unit/util/kidscode-workspace-persistence-contract.test.js
?? packages/scratch-gui/test/unit/util/kidscode-workspace-persistence-hoc.test.jsx
```

Nothing has been committed; the branch (`phase4/save-load-continue`) holds these as working-tree changes pending
human review, per the Phase 4 commit boundary.

## Files changed

- `docs/SHARED-API-CONTRACT.md` — adds the Phase 4 persistence section (Phase 3 launch section untouched).
- `docs/PHASE-4-SAVE-LOAD-CONTINUE-VERIFICATION.md` — this document.
- `packages/scratch-gui/src/lib/kidscode-workspace-launch.js` — adds two reserved development launch fixtures
  (`demo-save-failure`, `demo-corrupted-project`) and their shared `project_ref` constants; no changes to existing
  fixtures or validation logic.
- `packages/scratch-gui/src/playground/render-gui.jsx` — wires `KidscodeWorkspacePersistenceHOC` into the existing
  HOC chain and constructs the development/unavailable persistence adapter with the same
  production-vs-development pattern already used for the launch resolver.
- `packages/scratch-gui/src/lib/kidscode-workspace-persistence/kidscode-workspace-persistence-contract.js` — shared
  types/constants and the always-rejecting production fallback adapter.
- `packages/scratch-gui/src/lib/kidscode-workspace-persistence/kidscode-development-project-store.js` — the only
  file that touches IndexedDB.
- `packages/scratch-gui/src/lib/kidscode-workspace-persistence/kidscode-development-persistence-adapter.js` — the
  development mock adapter (business logic; no IndexedDB or UI code).
- `packages/scratch-gui/src/lib/kidscode-workspace-persistence/kidscode-workspace-starter-project.js` — the bundled
  lesson starter project fixture.
- `packages/scratch-gui/src/lib/kidscode-workspace-persistence/kidscode-workspace-persistence-hoc.jsx` — the
  Kidscode Save/Load Controller: drives load, manual save, autosave, and the content half of
  `kidscodeWorkspaceState`.
- `packages/scratch-gui/test/unit/util/kidscode-development-persistence-adapter.test.js`
- `packages/scratch-gui/test/unit/util/kidscode-workspace-persistence-contract.test.js`
- `packages/scratch-gui/test/unit/util/kidscode-workspace-persistence-hoc.test.jsx`

No UI component (`kidscode-workspace-state.jsx`, `kidscode-project-controls.jsx`, `menu-bar.jsx`, `gui.jsx`) needed
any change — their Phase 2/3 contracts already anticipated Phase 4.

## Development demo

```text
http://localhost:8601/?launch=demo-lesson              existing saved lesson (after a first save) / blank on first run
http://localhost:8601/?launch=demo-independent          existing independent project
http://localhost:8601/?launch=demo-new-independent       new project -> blank
http://localhost:8601/?launch=demo-new-lesson             new lesson -> starter project
http://localhost:8601/?launch=demo-save-failure          save always fails (Save failed + retry demo)
http://localhost:8601/?launch=demo-corrupted-project     load always fails safely (Corrupted Project demo)
```

Procedure for the main persistence demo (performed exactly as below during this verification):

1. Open `http://localhost:8601/?launch=demo-lesson`; wait for **Saved**.
2. Drag a block onto the canvas; observe **Unsaved**.
3. Press **Save**; observe **Saving...** then **Saved**.
4. Navigate again to `http://localhost:8601/?launch=demo-lesson` (a fresh launch — the token is single-use and
   already removed from the URL bar after the first success).
5. Verify the same block is present and the pill reads **Saved**.

## Remaining Laravel integration

The Laravel application must implement `GET /api/scratch/workspace/projects/{project_ref}/file` and
`POST /api/scratch/workspace/projects/{project_ref}/save` per the contract in
`docs/SHARED-API-CONTRACT.md`, including the `409 PROJECT_VERSION_CONFLICT` response. A `LaravelPersistenceAdapter`
implementing the same `{loadProject, saveProject}` interface as the development adapter then replaces
`createKidscodeDevelopmentPersistenceAdapter()` in `render-gui.jsx` for non-production builds, and the
`createUnavailableKidscodeWorkspacePersistenceAdapter()` production fallback is replaced by the real adapter once
the endpoint is live — no other Workspace code changes. No version-history UI, rename/duplicate/delete-backend
connection, submission, or tutor review work was implemented; none of that was in scope for Phase 4.

## Confirmation Phase 5 was not started

Confirmed: no rename/duplicate/delete backend connections, project-management APIs, submission, tutor review,
approval/changes-requested workflow, return-navigation redesign, or deployment work exists anywhere in this diff.
Nothing was deployed.
