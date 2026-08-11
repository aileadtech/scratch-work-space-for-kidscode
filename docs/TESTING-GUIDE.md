# Kidscode Scratch Workspace — Testing Guide

Three levels, used at different points in a phase. Match the level to what you're actually doing — most of a
phase's development time should stay at Level 1.

## Level 1 — Fast development checks

Use **while implementing**, after each meaningful edit.

Run only:

- the Jest tests for the file(s)/feature you're currently changing (`npx jest path/to/thing.test.js`)
- targeted ESLint for the changed/relevant files (`npx eslint path/to/file.js`)
- a small browser smoke check where useful (e.g. does the page still load, does the control you're touching
  still render)

Goal: seconds to a few minutes per check.

**Do not run the full repository suite after every code edit.**

## Level 2 — Phase completion verification

Run once the current phase's implementation is functionally complete, before writing the phase verification
document.

Include:

- the current phase's focused tests, in full
- the critical regression tests for directly affected earlier phases (not the whole suite — the tests that
  exercise the exact seams the phase touched)
- targeted ESLint on changed/new files
- `npm run i18n:src`, only if translated strings changed
- a development webpack compile/build (`BUILD_TYPE=dev npx webpack` on Windows, since `build:dev` needs
  `cross-env` it doesn't have)
- a targeted real-browser flow through the phase's actual user-facing behaviour
- a responsive check, only if the UI changed
- `git diff --check`
- a security/transient-artifact review (no secrets/tokens/console logging; no stray temp scripts, screenshots,
  `.sb3` fixtures, or build output left in the tree)

Record the results in the phase verification document.

## Level 3 — Full regression

Run at major gates, **not continuously**.

Recommended gates:

- when a phase changes broad shared infrastructure (e.g. a HOC or store used by multiple phases)
- before a significant release/deployment
- after real backend/frontend integration lands
- Phase 9 final verification
- when specifically requested by a reviewer

A normal small phase should not automatically trigger the full repository suite several times over.

Full-suite command (scoped explicitly to `test/unit`, since the package's own `test:unit` npm script combines
paths into a regex that can misbehave on Windows shells and pull in `test/integration`/`test/playwright`, which
need a different runner):

```text
npx jest test/unit
```

## Test selection rule

Start with the tests for the layer you changed, then widen only if needed:

- Changed **Project Management**? Start with `kidscode-workspace-project-management*` and
  `kidscode-project-controls` tests.
- Changed **Persistence**? Start with `kidscode-*persistence*` tests.
- Changed **Launch**? Start with `kidscode-workspace-launch*` tests.

Only widen scope when:

- shared infrastructure changed (a HOC, contract, or store more than one phase depends on)
- a focused test result exposes an interaction risk with another layer
- regression evidence specifically requires it
- a final phase/release gate requires it

## Browser testing

Browser testing should prove high-value user flows end-to-end, not re-run every unit assertion by hand. Examples
worth driving live:

- Save → reopen
- Rename → reopen
- Duplicate capturing current unsaved state
- a deleted project staying blocked
- a launch/error state (expired, invalid, denied, offline)

Keep the dev server running across checks where practical — incremental compilation makes repeated checks much
faster than a cold `npm start` each time.

## Known environment/tooling limitations

- `npm run test:unit`'s combined-path regex can misbehave in a Windows shell and pull in `test/integration` and
  `test/playwright`, which are not Jest-compatible and fail to even load in that runner. Invoke
  `npx jest test/unit` directly instead.
- The package's own `build:dev` npm script uses POSIX `VAR=value command` syntax and fails under `cmd.exe`;
  invoke `BUILD_TYPE=dev npx webpack` directly, or run it through Git Bash.
- Playwright's own test runner (`test/playwright/`, `npm run test:playwright`) is separate from Jest and was not
  exercised as part of Workspace phase verification; live-browser checks instead used `playwright-core` directly
  in small one-off scripts (see phase verification docs), driving the actual compiled dev server.

Do not excuse a genuine application failure by mislabelling it as one of the above — these are specifically the
tooling quirks already confirmed harmless in prior phase verification.

## Reporting

A phase report should distinguish:

- **PASS** — verified, works as intended
- **FAIL** — a real defect
- **environment/tooling limitation** — a known, harmless local-tooling quirk (see above)
- **pre-existing warning** — present before this phase's changes, not introduced by them

Do not label the absence of a tool (e.g. no ChromeDriver, no ability to run a second test runner) as a code
defect.
