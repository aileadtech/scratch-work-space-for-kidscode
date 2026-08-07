# Phase 2, Task 2.1 — Kidscode Workspace Layout Verification

## Test date

2026-08-07

## Environment

- Node.js `v24.18.0`, npm `10.9.9` (see [`KIDSCODE-WORKSPACE-SETUP.md`](KIDSCODE-WORKSPACE-SETUP.md))
- Branch: `phase2/kidscode-workspace-interface`, branched from the updated `main` after the Phase 1
  merge
- Dev server: `http://localhost:8601/`

## Task objective

Wrap the existing, unmodified Scratch editor in a Kidscode-specific workspace chrome: a project
title, a student indicator, and a "Back to Kidscode" control, with no normal Kidscode dashboard
sidebar, and no backend integration. The editor itself remains the main working area.

## Final architecture: single integrated menu bar

An earlier iteration of this task added a second, separate header bar above Scratch's own menu
bar. That was revised: **there is exactly one horizontal bar** — Scratch's existing purple menu
bar — with the three Kidscode elements integrated directly into it, alongside Scratch's own
File/Edit/Settings menus, title slot, and account-info area. No second bar exists anywhere in the
layout.

The integration point is `MenuBar` (`components/menu-bar/menu-bar.jsx`), extended with three new,
optional props (`onBackToKidscode`, `kidscodeProjectTitle`, `kidscodeStudentName`) threaded through
`GUIComponent`. All three default to `undefined`; when unset, `MenuBar` renders exactly as
upstream Scratch does, so the change is additive and does not alter behaviour for any other
consumer of `GUIComponent`.

## Files created

- `packages/scratch-gui/src/components/kidscode-menu-bar/back-to-kidscode-button.jsx` (+ `.css`)
- `packages/scratch-gui/src/components/kidscode-menu-bar/kidscode-project-title.jsx` (+ `.css`)
- `packages/scratch-gui/src/components/kidscode-menu-bar/kidscode-student-indicator.jsx` (+ `.css`)

## Files modified

- `packages/scratch-gui/src/components/gui/gui.jsx` — threads the three new props through to
  `<MenuBar>`.
- `packages/scratch-gui/src/components/menu-bar/menu-bar.jsx` — renders the three Kidscode
  elements, each conditional on its prop being present.
- `packages/scratch-gui/src/playground/render-gui.jsx` — mount site; supplies the Phase 2
  placeholder values and passes them to `<WrappedGui>`.

## Back to Kidscode implementation

A new button, first item in the menu bar's existing `.file-group` (left cluster), before the
Scratch logo. Takes a required `onBackToKidscode` callback prop — no hardcoded URL, no
`console`/debug placeholder. `playground/render-gui.jsx` supplies a safe no-op
(`const onBackToKidscode = () => {};`) as the Phase 2 default; Phase 3 can pass a real navigation
handler at that single call site without touching `MenuBar`, `GUIComponent`, or the button
component itself.

## Project-title placeholder implementation

`kidscodeProjectTitle` takes over the *same* growable slot `MenuBar` already used for either the
editable `ProjectTitleInput` (`canEditTitle`) or `AuthorInfo`, checked first in that conditional.
`render-gui.jsx` passes `canEditTitle={false}` and `kidscodeProjectTitle="Untitled Project"`, so
there is structurally one title-rendering slot in the DOM, not two. The value is plain project
data (same treatment as Scratch's own `state.scratchGui.projectTitle`), not routed through
`FormattedMessage`.

## Student placeholder implementation

`kidscodeStudentName` takes over the "no Scratch login session" branch of `MenuBar`'s existing
account-info area (which, in this config, otherwise only shows inert coming-soon placeholder
icons). `render-gui.jsx` passes `kidscodeStudentName="Student"`. The value is session data,
rendered as-is; a screen-reader-only `"(student account)"` label supplements it (see
Accessibility below).

## Confirmation: File/Edit/language functionality remains available

`file-menu.jsx`, `edit-menu.jsx`, `settings-menu.jsx`, `language-menu.jsx`, `mode-menu.jsx`,
`about-menu.jsx` are untouched — zero lines changed (confirmed via `git diff`, no hunks touch these
files). Verified live: at every supported width, `aria-label` on the rendered trigger buttons
reads `"File menu"`, `"Edit menu"`, `"Settings menu"` respectively, each opens its existing
dropdown, and language selection remains reachable through Settings exactly as upstream.

## Confirmation: no second header exists

`git diff` for this task touches only `gui.jsx`, `menu-bar.jsx`, `render-gui.jsx`, and the new
`kidscode-menu-bar/` folder. No wrapping shell, no second `<header>`/flex-column layout component
exists anywhere in the tree. Screenshots at all four supported widths (below) show a single purple
bar.

## Accessibility check at the 1024px collapsed state

At `max-width: 1024px`, `menu-bar.css`'s existing collapse pattern (already used for Scratch's own
Tutorials/Debug labels) hides secondary text labels to keep everything on one line without
overflow. Two gaps were found and fixed; a third item was confirmed already correct.

| Element | Before fix | Fix applied | After fix |
|---|---|---|---|
| Back to Kidscode | Visible label hidden via `display: none`; button had no `aria-label` and the icon `<img>` had no `alt` — accessible name was empty at ≤1024px (confirmed: `aria-label` attr `null`, `innerText` `""`) | Added `aria-label={intl.formatMessage(backToKidscodeMessage)}` on the `<button>`, reusing the same message object as the visible label — the identical pattern already used by `MenuBar`'s own Tutorials/Debug buttons | `aria-label` = `"Back to Kidscode"` at every width (confirmed live) |
| Student indicator | Visible name hidden via `display: none` at ≤1024px, which removes it from the accessibility tree — only the always-present hidden `"(student account)"` label remained, with no name attached (confirmed: `innerText` at 1024px = `"S\n(student account)"`, missing the name) | Changed the ≤1024px rule for `.student-name` from `display: none` to the same clip-rect visually-hidden technique already used by the `"(student account)"` label — visually collapsed, but still present for assistive tech | `innerText` at 1024px = `"S\nStudent\n(student account)"` — name preserved; visual appearance unchanged (avatar-only), confirmed by screenshot |
| File / Edit / Settings menus | Not collapsible; not affected by this task's CSS at all | None needed | `aria-label` = `"File menu"` / `"Edit menu"` / `"Settings menu"` at every width (confirmed live, all four supported widths) |

Both fixes were verified to leave the visual presentation at 1024px unchanged (screenshot
comparison before/after) and did not introduce new lint errors, test failures, or build errors
(reconfirmed after the fix — see Lint/Unit-test/Webpack results below).

## Results at supported viewports

Tested via headless-Chromium (Playwright, `playwright-core`), matching the Phase 1 methodology.

| Viewport | Horizontal overflow | Single bar | Console errors (non-benign) | Result |
|---|---|---|---|---|
| 1440×900 | None | Yes | None | **Pass** |
| 1366×768 | None | Yes | None | **Pass** |
| 1280×800 | None | Yes | None | **Pass** |
| 1024×768 | None | Yes | None | **Pass** |

At 1024×768, the collapse behaviour was confirmed visually: Back to Kidscode, Tutorials, and Debug
all drop to icon-only, and the student indicator drops to avatar-only — nothing wraps or overflows
the bar.

## Restricted viewport result (below 1024px)

Tested at 800×800. The Phase 1 `ViewportGuard` — unmodified by this task — correctly renders its
full-viewport "Screen too small" overlay on top of the entire page, including the new Kidscode menu
bar elements. The editor remains mounted underneath (see Project-state preservation below).

## Scratch editor regression result

Stage, block palette (all 9 categories), sprite pane, green-flag/stop controls, and Scratch's own
File/Edit/Settings/Share/Tutorials/Debug controls all render and remain reachable at every
supported width. No Scratch-internal file (`scratch-vm`, `scratch-render`, `scratch-storage`,
`scratch-blocks`, `scratch-paint`) was modified.

## Project-state preservation result

Repeated the Phase 1 methodology against the revised architecture: renamed the default sprite to
`KidscodeStateTest`, resized to 800×800 (viewport guard covers the editor), resized back to
1280×800. The renamed sprite's name field still read `KidscodeStateTest` after the round trip —
**no project state was lost**. The editor is never unmounted; only the guard's overlay toggles,
exactly as documented in
[`PHASE-1-TASK-1.3-SUPPORTED-DEVICES-VERIFICATION.md`](PHASE-1-TASK-1.3-SUPPORTED-DEVICES-VERIFICATION.md).

## Lint result

`eslint` on all created/modified files (`kidscode-menu-bar/`, `menu-bar.jsx`, `gui.jsx`,
`render-gui.jsx`): **0 errors.** The only warnings reported (`arrow-parens`, e.g.
`export default appTarget => {`) are on pre-existing lines this task did not touch, confirmed by
inspecting the `git diff` hunks — each warning's line falls outside every changed range.

## Unit-test result

`jest test/unit/components test/unit/containers`: **18/18 suites, 84/84 tests pass**, including
`menu-bar.test.jsx`. Re-run after the accessibility fixes with the same result.

## Webpack result

`BUILD_TYPE=dev webpack`: **compiled successfully**, zero errors, both before and after the
accessibility fixes.

## Browser-console result

No new console errors were introduced. Two categories were checked:

- **Deterministic, pre-existing warnings**: `defaultProps` deprecation notices, a null `projectId`
  prop warning on the standalone playground route, and a missing list-key warning in
  `ConfirmationPrompt` — all already documented as benign in the Phase 1 verification docs.
- **An intermittent "React does not recognize the `X` prop on a DOM element" warning**, referencing
  prop names unrelated to this task (`dynamicSprites`, `localesOnly`, `onUpdateDynamicAssets`,
  `setTheme`) that trace back to `GUIComponent`'s pre-existing `if (children) return <Box
  {...componentProps}>...` branch. Reproduced identically (same 0/3/3 pattern across three fresh
  page loads) on both this branch and a clean `git stash` baseline of unmodified `main` — confirmed
  pre-existing, timing-dependent, and unrelated to this task's diff. `PHASE-1-TASK-1.2` already logs
  "an unrecognized DOM prop" as one of the known baseline warnings.

Zero uncaught JavaScript exceptions (`pageerror`) at any point across all testing.

## Confirmation: no backend integration was added

No Laravel API calls, no authentication, no secure launch logic, no database integration, no
autosave/save/submission/project-loading logic, and no production URLs anywhere in this task's
diff. `onBackToKidscode` is a plain callback prop defaulting to a no-op; the two placeholder
strings (`"Untitled Project"`, `"Student"`) are local constants in `render-gui.jsx`, not fetched
from anywhere.

## Confirmation: VM, renderer, storage, blocks, and paint untouched

`git diff --stat` (below) touches only `scratch-gui` source files under `components/gui/`,
`components/menu-bar/`, `components/kidscode-menu-bar/` (new), and `playground/`. No file under
`packages/scratch-vm`, `packages/scratch-render`, `packages/scratch-storage`,
`packages/scratch-svg-renderer`, or scratch-blocks/paint packages was touched.

## Final result

**PASS.** The single-menu-bar architecture is implemented, matches all ten requirements from the
revision request, the two accessibility gaps found during this verification pass were corrected
with minimal, targeted changes, and all automated checks (lint, unit tests, build) plus manual
verification (four supported viewports, restricted-viewport guard, editor regression,
project-state preservation, console output) pass. Task 2.1 is ready to close.
