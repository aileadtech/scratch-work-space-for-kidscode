# Phase 2, Task 2.2 - Project Controls Verification

## Test date

2026-08-07

## Environment

- Branch: `phase2/kidscode-workspace-interface`
- Starting commit: `723e72c` (`feat: add Kidscode workspace menu integration`)
- Package under test: `packages/scratch-gui`
- Local editor URL used for browser verification: `http://localhost:8602/`

## Final menu structure

There is still one integrated Scratch menu bar. The Kidscode path is:

`Back to Kidscode | Scratch home | File | Edit | Project | Settings | Project title | Save | Submit | existing Scratch actions | Student`

`Project` contains:

1. Rename
2. Duplicate
3. Download `.sb3`
4. Delete draft
5. Return to lesson
6. Return to My Scratch Projects

The existing Scratch Share, Project Page, Tutorials, and Debug actions remain available. At compact
supported widths, lower-priority labels collapse while their accessible button names remain.
No second horizontal header was added.

## Language-control decision

The existing language selector was already implemented as a `LanguageMenu` nested inside
`SettingsMenu`, with locale selection still dispatched through Scratch's existing Redux locale
action. It was therefore not moved or rewritten. For Kidscode, the Settings trigger is icon-only
to recover menu-bar space; its accessible name and its Language, Theme, and Color Mode menus remain
unchanged. Live verification opened Settings and then Language and confirmed that the full locale
list, including the selected English locale, remains reachable.

## Project-control behavior

| Control | Phase 2.2 behavior | Later-phase seam |
|---|---|---|
| Save | Permanent menu-bar button; invokes `onSaveProject`. `Ctrl+S`/`Cmd+S` uses the same seam in Kidscode mode. No success message is shown. | Server persistence in Phase 4. |
| Submit | Permanent menu-bar button; invokes `onSubmitProject`. No submission or success state is simulated. | Real submission in Phase 6. |
| Rename | Opens a compact localized modal with confirm/cancel. Confirm trims and writes the title to Scratch's existing `projectTitle` Redux state, then invokes `onRenameProject`; a blank title cannot be confirmed. | Optional persistence through `onRenameProject` later. |
| Duplicate | Invokes `onDuplicateProject` and closes the menu. It does not create or claim a persistent project identity. | Backend duplication in Phase 5. |
| Download `.sb3` | Uses Scratch's existing `SB3Downloader`, `vm.saveProjectSb3`, and save-to-computer handler. No serializer was added. | Fully functional now; no backend dependency. |
| Delete draft | Opens a localized confirmation modal. Cancel has no effect; confirm invokes `onDeleteDraft` and closes the modal. No deletion or success message is simulated. | Backend deletion in Phase 5. |
| Return to lesson | Invokes `onReturnToLesson`; no URL is embedded and the Phase 2 playground callback is a no-op. | Real navigation in a later phase. |
| Return to My Scratch Projects | Invokes `onReturnToMyScratchProjects`; no URL is embedded and the Phase 2 playground callback is a no-op. | Real navigation in a later phase. |

All eight controls were exercised in the running editor without a crash. Callback-only actions
left the page, project title, and editor state unchanged, and no fake saved/submitted/deleted state
appeared.

## Download and reopen result

Live selection of `Project > Download .sb3` produced:

- File: `C:\Users\User\Downloads\Kidscode Rename Test.sb3`
- Size: 41,906 bytes
- SHA-256: `BE59D4B4A154C486AC38BD053CA6FF8C309635533FF6C22F13C3FAD7279580C0`
- Archive contents: `project.json`, three SVG costumes/backdrops, and two WAV sounds

The downloaded archive was passed back to this checkout's actual `scratch-vm` `loadProject` path.
It loaded successfully and reconstructed the Stage plus `Sprite1`, including one Stage costume,
two sprite costumes, and both sounds. The command-line check did not attach a renderer or audio
engine, so it emitted the expected asset-render/audio warnings while still completing with exit
code 0 and `loaded: true`.

The Chrome extension file chooser could not set the downloaded local file because file-URL access
is disabled in that browser extension. This is a browser-tool permission limitation, not an editor
load or archive-validation failure; the real VM reopen above supplies the reopen verification.

## Rename result

- Cancel test: entered `Cancelled title`, selected Cancel, and confirmed the dialog closed while
  the visible title remained `Untitled Project`.
- Confirm test: entered `Kidscode Rename Test`, selected Rename, and confirmed that the dialog
  closed and the single visible title surface changed to `Kidscode Rename Test`.
- A focused regression test confirms a supplied title is not replaced when Scratch's default
  project finishes loading.

## Supported viewport results

| Viewport | Document width | Menu client/scroll width | Overflow or wrapping | Result |
|---|---:|---:|---|---|
| 1440x900 | 1440 | 1440 / 1440 | None | PASS |
| 1366x768 | 1366 | 1366 / 1366 | None | PASS |
| 1280x800 | 1280 | 1280 / 1280 | None | PASS |
| 1024x768 | 1024 | 1024 / 1024 | None | PASS |

At 800x800, the Phase 1 `Screen too small` overlay was visible while the editor remained mounted
underneath. The default sprite was renamed to `KidscodeStateTest` before entering the restricted
viewport; after returning to 1280x800 the sprite still had that name. The Save callback was also
exercised between the edit and the viewport round trip without changing editor state.

## Automated verification

- Focused ESLint over every created or modified JS/JSX file: **PASS, 0 errors**.
- Focused Jest: **PASS, 3 suites and 13 tests**, including the final non-Kidscode menu regression.
- `npm run i18n:src`: **PASS**; the new messages were extracted without changing dependencies.
- Windows-compatible `BUILD_TYPE=dev webpack`: **PASS**, webpack 5.109.2 compiled successfully in
  111,662 ms. The package's literal `npm run build:dev` script uses POSIX inline environment syntax,
  so the equivalent checked-in `cross-env` binary was used on Windows.

## Browser-console result

There were zero new fatal page errors and zero uncaught application exceptions during menu,
modal, download, viewport, and project-state testing. The error-level console entries were the
same known standalone-playground React warnings documented for Task 2.1 (`defaultProps`, missing
playground `projectId`, list keys, legacy DOM props, and `findDOMNode`). A separate
`chrome-extension://` content-script message was emitted by the browser extension and did not
originate from the editor.

## Files changed

Created:

- `packages/scratch-gui/src/components/kidscode-menu-bar/kidscode-project-controls.jsx`
- `packages/scratch-gui/src/components/kidscode-menu-bar/kidscode-project-controls.css`
- `packages/scratch-gui/src/components/kidscode-menu-bar/icon--project.svg`
- `packages/scratch-gui/src/components/kidscode-menu-bar/icon--save.svg`
- `packages/scratch-gui/src/components/kidscode-menu-bar/icon--submit.svg`
- `packages/scratch-gui/test/unit/components/kidscode-project-controls.test.jsx`
- `packages/scratch-gui/test/unit/util/titled-hoc.test.jsx`
- `docs/PHASE-2-TASK-2.2-PROJECT-CONTROLS-VERIFICATION.md`

Modified:

- `packages/scratch-gui/src/components/gui/gui.jsx`
- `packages/scratch-gui/src/components/kidscode-menu-bar/back-to-kidscode-button.css`
- `packages/scratch-gui/src/components/kidscode-menu-bar/kidscode-student-indicator.css`
- `packages/scratch-gui/src/components/menu-bar/menu-bar.css`
- `packages/scratch-gui/src/components/menu-bar/menu-bar.jsx`
- `packages/scratch-gui/src/components/menu-bar/settings-menu.css`
- `packages/scratch-gui/src/components/menu-bar/settings-menu.jsx`
- `packages/scratch-gui/src/lib/titled-hoc.jsx`
- `packages/scratch-gui/src/playground/render-gui.jsx`
- `packages/scratch-gui/test/unit/components/menu-bar.test.jsx`

## Scope and backend confirmation

The complete diff is confined to `scratch-gui` menu/title/playground code, focused tests, and this
verification document. No package manifest or lockfile changed. No VM, renderer, storage, blocks,
paint, licensing, dependency, database, authentication, secure-launch, autosave, server-save, or
submission implementation was added. Deferred actions use explicit callbacks, and no production
URL or console placeholder was added.

## Final result

**PASS.** Task 2.2 implements the requested project-control architecture, real local rename, and
real Scratch `.sb3` export while keeping later-phase operations honest and callback-only. The
single menu bar, localization path, supported layouts, Phase 1 viewport guard, and project state
all remain functional. Task 2.3 has not been started.
