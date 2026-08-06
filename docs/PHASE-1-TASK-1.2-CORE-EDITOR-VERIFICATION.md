# Phase 1, Task 1.2 — Core Scratch Editor Verification

## Test date

2026-08-06

## Environment

- Node.js `v24.18.0` (approved deviation from the official `24.19.0` pin — see
  [`KIDSCODE-WORKSPACE-SETUP.md`](KIDSCODE-WORKSPACE-SETUP.md))
- npm `10.9.9`, invoked via `npx npm@10.9.9`
- Branch: `phase1/scratch-editor-import`, unmodified official Scratch Editor import
- Dev server: `http://localhost:8601/`

## Method

The editor was driven end-to-end with a headless-Chromium script (Playwright, using the
`playwright-core` package already present in the installed dependency tree) performing real
mouse/keyboard interactions against the running dev server — including genuine drag-and-drop of
blocks from the palette into the workspace — rather than programmatically injecting project data.
This exercises the actual editor UI and the real save/load code paths.

## Test-project contents

| Element | What was created |
|---|---|
| Sprites | Default sprite renamed `Sprite1` → **Player**; one additional sprite added from the built-in library, auto-named **Abby** (kept, per "rename at least one sprite" already satisfied by Player) |
| Backdrop | Added **Arctic** backdrop from the library (alongside the default `backdrop1`) |
| Costume | Added one additional costume to Abby (5 costumes total, up from the library sprite's default 4) |
| Sound | Added **A Bass** to Abby (alongside her default `Pop`); Player's default **Meow** sound is used in the script |
| Variable | Created global variable **score** via Variables → Make a Variable (alongside the pre-existing default `my variable`) |
| Script (Player) | One fully connected stack, all 6 required categories, in order: **Events** `when green flag clicked` → **Motion** `move 10 steps` → **Looks** `say Hello! for 2 seconds` → **Sound** `play sound Meow until done` → **Control** `wait 1 seconds` → **Variables** `set my variable to 0` |
| Script (Abby) | `when green flag clicked` → `move 10 steps` |
| Expected behaviour | On green flag click: Player moves, shows a speech bubble, plays a sound, waits, then sets a variable; Abby moves. Both run concurrently. |

**Note on the Variables block:** the connected script's `set` block targets the pre-existing
default variable **`my variable`**, not the newly created **`score`**. An automated attempt to
switch the block's dropdown to `score` self-reported success but did not visually take effect
(confirmed by screenshot) — it most likely clicked the `score` visibility checkbox in the palette
sidebar rather than a genuine dropdown menu item. This does not affect the pass/fail result below:
a variable was created (`score`, confirmed present in `project.json` and visible on stage via its
monitor) and a variable is set through a fully connected, working script (`my variable`), matching
the letter of the Task 1.2 requirement. Noted here for transparency rather than left unstated.

## Export result

- File: `C:\Users\User\Documents\scratch-workspace-test-files\phase1-core-editor-test.sb3`
- Exists: yes
- Size: **426,560 bytes** (non-zero)
- Triggered via the editor's own File → "Save to your computer"
- Repository: unaffected — the file was saved entirely outside `C:\Users\User\Documents\scratch-work-space-for-kidscode`

## Reopen result

A fresh editor session (full page reload, new in-memory state) loaded the exported file via File →
"Load from your computer". Confirmed preserved, matching the pre-export state exactly:

- Project title: `phase1-core-editor-test` (from the filename, shown in the title bar)
- Both sprites present: **Player**, **Abby** (exact same names)
- Player's full 6-block script intact, in the same order, same field values (`10` steps, `Hello!`
  for `2` seconds, `Meow` until done, `1` seconds, `my variable` to `0`)
- Abby's script intact
- Both costumes/backdrops/sounds present (backdrop count shown as 2 in the sprite panel, matching
  pre-export)
- The `score` variable monitor still visible on stage after reopen
- Clicking the green flag on the reopened project ran successfully — Player's sprite `x` position
  reflects real physics engine execution (moved from repeated green-flag clicks across the test),
  confirming genuine VM execution, not just a static visual re-render

## Data-integrity checklist

The `.sb3` (a ZIP archive) was inspected directly, outside the repository, without modifying the
original file:

- [x] `project.json` present (5,421 bytes)
- [x] Sprite and stage data present and correct, parsed from `project.json`:
  - Stage: variables `my variable`, `score`; costumes `backdrop1`, `Arctic`; sound `pop`
  - Player: **7 blocks** (the connected script, including input shadow blocks); costumes
    `costume1`, `costume2`; sound `Meow`
  - Abby: **2 blocks** (her script); costumes `Abby-a/b/c/d/a2` (5); sounds `Pop`, `A Bass`
- [x] Costume assets present (7 SVG files)
- [x] Backdrop assets present (1 PNG, 228 KB — the added Arctic backdrop)
- [x] Sound assets present (3 WAV files)
- [x] No personal or student data present (this is a synthetic test project — sprite/variable
  names, library assets, and default text only)

13 files total, 634,275 bytes uncompressed.

## Browser-console findings

- **Page errors (uncaught JS exceptions): zero**, across the entire session — sprite/costume/
  backdrop/sound additions, variable creation, 8 real block drags, two green-flag runs, one
  export, one full page reload, one reopen, and a second green-flag run on the reopened project.
- Console warnings: standard React development-mode noise only (PropTypes mismatches on a few
  internal components, `defaultProps` and `findDOMNode` deprecation notices, a missing list-key
  warning, an unrecognized DOM prop). None are functional errors; all are consistent with what a
  React 18-era codebase running in dev mode normally logs, unrelated to this import.

## Warnings or limitations

- The Variables-category script block targets `my variable` rather than `score` (see note above)
  — cosmetic, does not affect the pass/fail determination.
- This test did not exercise every possible block type or every extension — it exercised at least
  one block from each of the six requested categories in a real, connected, running script, per
  the task's stated scope.

## Final result

**PASS.** The exported project was reopened without losing blocks, sprites, sounds, backdrops,
costumes, variables, or expected project behaviour. No uncaught JavaScript errors occurred at any
point. The untouched Scratch Editor's create → run → export → reopen cycle is verified working
end-to-end.
