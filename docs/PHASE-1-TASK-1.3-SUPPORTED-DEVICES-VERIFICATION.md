# Phase 1, Task 1.3 — Supported Devices Verification

## Test date

2026-08-06

## Environment

- Node.js `v24.18.0` (approved deviation from the official `24.19.0` pin — see
  [`KIDSCODE-WORKSPACE-SETUP.md`](KIDSCODE-WORKSPACE-SETUP.md))
- npm `10.9.9`, invoked via `npx npm@10.9.9`
- Branch: `phase1/scratch-editor-import`
- Dev server: `http://localhost:8601/`

## Method

Two rounds of testing, both via headless-Chromium (Playwright, using the `playwright-core`
package already in the dependency tree):

1. **Initial-load tests** — a fresh page load at each exact pixel size, checking the stage,
   block palette, sprite pane, and header; horizontal overflow; and uncaught JavaScript errors.
2. **Live-transition tests** — a single page session with `setViewportSize()` changing the
   viewport *without* a reload, simulating window resize and device rotation, checking that the
   editor and restriction message correctly swap, that no project state is lost, and that no
   JavaScript error occurs during the transition.

## Initial-load results

| Viewport | Size | Group | Result |
|---|---|---|---|
| Desktop | 1440×900 | Supported | **Pass** — editor loads, no overflow |
| Laptop | 1366×768 | Supported | **Pass** — editor loads, no overflow |
| Tablet landscape | 1280×800 | Supported | **Pass** — editor loads, no overflow |
| Tablet landscape | 1024×768 | Supported | **Pass** — editor loads, no overflow |
| Tablet portrait | 768×1024 | Restricted | **Pass** — restriction message shown, no overflow |
| Phone | 390×844 | Restricted | **Pass** — restriction message shown, no overflow |
| Phone | 360×800 | Restricted | **Pass** — restriction message shown, no overflow |

Zero uncaught JavaScript errors at every viewport.

Before any code change, the untouched editor did not reflow below its fixed layout width; it
simply overflowed and relied on horizontal scrolling (`index.css`'s `min-width: 1024px` rule,
comment: *"Setting min height/width makes the UI scroll below those sizes"*). On phones this made
the stage, sprite pane, and green flag completely unreachable — confirmed by screenshot: only the
block palette was visible, with no way to scroll to the rest of the interface.

## Live-transition results

All tested without reloading the page — a single session, viewport changed mid-session:

| Scenario | Result |
|---|---|
| Start portrait tablet (768×1024, unsupported) → rotate to landscape (1024×768) | **Pass** — message disappears, editor mounts live, no reload |
| Start landscape tablet (1024×768, supported, editor in use) → rotate to portrait (768×1024) | **Pass** — message reappears, *covering* the still-mounted editor |
| ...→ rotate back to landscape | **Pass** — message disappears, editor reappears; a sprite renamed before the portrait rotation was still named correctly afterward — **no project state was lost** |
| Desktop (1440×900) → resize to 500×900 → resize back to 1440×900 → resize to 800×900 | **Pass** — message and editor correctly alternate on every crossing, in both directions, repeated |

Zero uncaught JavaScript errors across every transition.

The state-preservation check (rename a sprite, cover the editor by rotating to portrait, rotate
back, confirm the rename survived) is the most important result here: the editor is **never
unmounted** once it has been mounted, even while the restriction message is covering it. Only a
full-viewport overlay toggles. This was a deliberate design choice — see "How live detection
works" below.

## Decision: was a code change needed?

**Yes.** Phones failed outright (the core stage/sprite/run controls were entirely unreachable,
confirmed visually, not just measured). Tablet portrait was borderline. Rather than special-case
by device label, the fix gates on **viewport width**, with a threshold matching the narrowest
layout observed to render cleanly (1024px, the tested landscape-tablet width).

A first version of the fix checked this only once, at initial page load (matching the existing
`supportedBrowser()` precedent) — a user rotating a tablet or resizing a window below the
threshold mid-session would have needed to reload to see the restriction message. Independent
review flagged this as insufficient given the message explicitly tells the user to rotate their
device, so the fix was extended to detect changes live, as documented above.

## Files changed

All changes are additive at the playground "shell" entry point, mirroring the existing
`supportedBrowser()` → `BrowserModalComponent` pattern already used in `index.jsx` for unsupported
browsers. No Scratch-internal (VM, renderer, blocks, GUI container) code was touched.

- **New:** `packages/scratch-gui/src/lib/supported-viewport.js` — `supportedViewport()` (checks
  `window.innerWidth >= 1024`) and `watchSupportedViewport(onChange)`, a `matchMedia`-backed
  subscription that fires only when the threshold is actually crossed (not on every resize event,
  so it does not fire excessively while a window is being dragged).
- **New:** `packages/scratch-gui/src/components/viewport-modal/viewport-modal.jsx` and
  `viewport-modal.css` — the restriction message, modeled on the existing `browser-modal`
  component's conventions (`FormattedMessage`, shared CSS variables). `role="alert"` and a focus
  move to the heading on mount announce the message to screen reader and keyboard users — relevant
  now that it can appear after initial load, not just at first paint.
- **New:** `packages/scratch-gui/src/components/viewport-modal/viewport-guard.jsx` — a small
  stateful component that watches `watchSupportedViewport()` and renders `ViewportModal` or
  nothing accordingly; mounted once, independently of the editor, and lives for the page's
  lifetime.
- **Modified:** `packages/scratch-gui/src/playground/index.jsx` — mounts `ViewportGuard`
  immediately (always live), and mounts the real editor lazily the first time the viewport is wide
  enough (immediately, if it already is at load).

### How live detection works (and why the editor is never unmounted)

`ViewportGuard` is mounted into its own DOM node immediately, independently of the editor, and
stays mounted for the page's lifetime. The real editor is mounted lazily — the first time
`supportedViewport()` becomes true — and is **never unmounted again** afterward, even if the
viewport later becomes too narrow. Unmounting it would destroy in-progress project state (the VM,
sprites, scripts, etc. all live inside it). Instead, `ViewportGuard`'s full-viewport,
high-z-index, `position: fixed` overlay simply covers the editor while the viewport is too narrow,
and is removed (renders `null`) once it is wide enough again. This is why the state-preservation
test above passed.

### Bugs found and corrected during implementation

1. `ViewportModal` used `FormattedMessage`/`useIntl` without an `IntlProvider` ancestor, causing a
   render crash (blank white screen — the intended message never appeared). Fixed by composing it
   with the existing `LocalizationHOC`, the same mechanism the real GUI uses.
2. `index.css`'s `min-width: 1024px` rule targets `html` and `body` directly (not just the app
   root's `.app` class), so the page reported horizontal overflow even though the message itself
   (which uses `position: fixed` centering) was already fully visible. Fixed with an inline-style
   override on `document.documentElement`/`document.body`, applied only until the real editor
   first mounts (at which point it is restored, since the mounted editor's own layout does need
   that floor).
3. (Caught in independent review, before any of the above was committed) The initial
   once-at-load-only check did not update on rotation or resize, contradicting the restriction
   message's own instruction to rotate the device. Replaced with the live `matchMedia`-based
   design described above.

## Final supported-device rule

The editor requires a viewport at least **1024 CSS pixels wide**, checked continuously for the
life of the page (not just at load). This covers desktop, laptop, and tablets in landscape mode.
Phones and narrow tablet-portrait orientations fall below this width and see a full-page message
instead of (or, if the editor was already in use, covering) the editor: *"Screen too small — The
Scratch Workspace is designed for a desktop, a laptop, or a tablet in landscape mode. Please
rotate your device or switch to a larger screen to continue."* Rotating the device or resizing the
window past the threshold, in either direction, updates the view immediately with no reload and no
loss of in-progress project state.

## Browser-console findings

Zero uncaught JavaScript errors in every tested scenario — initial load at all seven viewports,
and all four live-transition scenarios (rotation into support, rotation out of support and back,
and repeated desktop resize crossings). The two implementation bugs above were caught and fixed
during development, before this final result was recorded. Console output is otherwise limited to
the same benign React development-mode warnings already documented in the Task 1.1 and 1.2
verification reports, unrelated to this change.

## Final Task 1.3 result

**PASS.** Desktop, laptop, and tablet-landscape viewports render and work correctly. Phones and
narrow tablet-portrait viewports, which were previously unusable (stage and controls entirely
off-screen with no explanation), now show a clear, accessible, correctly-localized restriction
message directing the user to a supported screen size or orientation — live, on rotation or
resize, without a reload, and without ever losing in-progress project state.
