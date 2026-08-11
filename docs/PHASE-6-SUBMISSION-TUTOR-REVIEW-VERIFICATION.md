# Phase 6 — Submission + Tutor Review Verification

## Objective and repository boundary

Implement the Workspace side of immutable student submission, exact-version tutor review, approval, requested
changes with feedback, and resubmission without waiting for Laravel. Work is on
`phase6/submission-tutor-review`, based on verified main
`6f494856f8b1c199e683cc51a190f062dec58be1`. It is uncommitted and unmerged. Nothing was deployed, and Phase 7
was not started.

## Final checklist

- [x] 6.1 Verify main and create Phase 6 branch
- [x] 6.2 Fast-start context read
- [x] 6.3 Inspect Submit and relevant status seams
- [x] 6.4 Design submission/review adapter
- [x] 6.5 Extend development store for immutable submissions
- [x] 6.6 Implement student Submit
- [x] 6.7 Capture exact current `.sb3` on Submit
- [x] 6.8 Implement Submitted state
- [x] 6.9 Prevent inappropriate edits/actions after submission
- [x] 6.10 Implement tutor review launch/context
- [x] 6.11 Load exact submitted `.sb3` for tutor
- [x] 6.12 Enforce tutor read-only persistence behaviour
- [x] 6.13 Implement Approve
- [x] 6.14 Implement Request Changes + feedback
- [x] 6.15 Implement student Changes Requested state
- [x] 6.16 Allow correction/editing after Changes Requested
- [x] 6.17 Implement Resubmit
- [x] 6.18 Verify resubmit creates new immutable version
- [x] 6.19 Add development fixtures/failure paths
- [x] 6.20 Focused tests
- [x] 6.21 Phase 3–5 targeted regression
- [x] 6.22 Browser verification
- [x] 6.23 Responsive/accessibility check where UI changed
- [x] 6.24 Security/diff review
- [x] 6.25 Update Shared API Contract
- [x] 6.26 Update `WORKSPACE-CURRENT-STATE.md`
- [x] 6.27 Create Phase 6 verification document

Completion: **27/27 (100%)**.

## Fast-start investigation

Read in the required order: `AGENTS.md`, `docs/AGENT-START-HERE.md`,
`docs/WORKSPACE-CURRENT-STATE.md`, `docs/SHARED-API-CONTRACT.md`, and
`docs/PHASE-5-PROJECT-MANAGEMENT-VERIFICATION.md`. Investigation then stayed within the existing Submit controls,
Workspace session/status and blocking states, Phase 4 VM/persistence/version seams, Phase 5 status restrictions,
launch validation/fixtures, HOC composition, and existing adapter patterns.

The key composition seam is now:

```text
Launch → AppState → Hash → ProjectManagement → SubmissionReview → Persistence → GUI
```

Submission Review can serialize the VM's current state, receive the latest working version from Persistence, and
make review mode bypass working-project load/save. Project Management remains outside it so review mode blocks all
metadata mutations.

## Implementation and files

New submission/review boundary:

- `src/lib/kidscode-workspace-submission-review/kidscode-workspace-submission-review-contract.js`
- `src/lib/kidscode-workspace-submission-review/kidscode-development-submission-review-adapter.js`
- `src/lib/kidscode-workspace-submission-review/kidscode-workspace-submission-review-hoc.jsx`

Updated launch/session/composition:

- `src/lib/kidscode-workspace-launch.js`
- `src/contexts/kidscode-workspace-session-context.jsx`
- `src/playground/render-gui.jsx`

Updated persistence/shared development store:

- `src/lib/kidscode-workspace-persistence/kidscode-development-project-store.js`
- `src/lib/kidscode-workspace-persistence/kidscode-development-persistence-adapter.js`
- `src/lib/kidscode-workspace-persistence/kidscode-workspace-persistence-hoc.jsx`

Updated UI/status/project-management seams:

- `src/components/gui/gui.jsx`
- `src/components/menu-bar/menu-bar.jsx`
- `src/components/kidscode-menu-bar/kidscode-project-controls.jsx`
- `src/components/kidscode-menu-bar/kidscode-project-controls.css`
- `src/components/kidscode-menu-bar/kidscode-workspace-state.jsx`
- `src/lib/kidscode-workspace-state.js`
- `src/lib/kidscode-workspace-project-management/kidscode-workspace-project-management-hoc.jsx`
- `src/lib/kidscode-workspace-project-management/use-kidscode-project-management-controller.js`

New focused tests:

- `test/unit/util/kidscode-workspace-submission-review-contract.test.js`
- `test/unit/util/kidscode-development-submission-review-adapter.test.js`
- `test/unit/util/kidscode-workspace-submission-review-hoc.test.jsx`

Existing Phase 3–5 component/adapter/HOC tests were extended for the new launch/status/read-only contracts. The
Shared API Contract and living current-state document were updated with this verification document.

## Student submission behaviour

Submit and Resubmit guard against concurrent clicks, call `vm.saveProjectSb3()` immediately, convert the returned
Blob to an ArrayBuffer, and pass those current bytes plus the latest working `baseVersionRef` to the adapter. A
manual Save immediately beforehand is not required. Success atomically writes two logically separate copies: a new
immutable submission and the mutable working project advanced to the same bytes under a new working `version_ref`.
It then updates visible status to Submitted and disables manual Save; Persistence also blocks manual/autosave at
the controller and development-adapter boundaries for `submitted` and `approved`.

`changes_requested` exposes persisted tutor feedback, restores working-project Save/autosave, labels the action
Resubmit, and creates a new submitted record. `approved` is complete/read-only for submission persistence.

## Immutable submission storage

IndexedDB database version 2 adds a separate `submissions` store keyed by `submissionRef`. One transaction spans
the project and submission stores: submission creation uses `add`, while the working record receives copied bytes
and its next version. An existing submission key cannot be replaced. Every submit gets deterministic new
development identities and copied bytes:

```text
SCR-DEV-SUB-{project_ref}-{n}
SCR-DEV-SUB-VER-{project_ref}-{n}
```

The project record tracks the latest submission, working content/version, and current lifecycle status. Narrow review updates preserve the
original project/submission/version/timestamp/`.sb3` fields while changing only review state and appending history.
Returned binary data is copied again on load. The critical persisted X → unsaved/submit A → reopen working A →
edit/resubmit C scenario is covered by the focused adapter tests: working reopen returns A rather than X, immutable
A remains byte-for-byte unchanged and present after C is created, and the new immutable submission contains C.
Atomic version/status checks also make a pending autosave and Submit serialize safely: whichever advances first
causes the stale operation to reject without partial records or stale overwrites.

## Tutor review mode

Successful `launch_type: review` requires `role: tutor` plus exact `submission_ref`, `submitted_version_ref`, and
`submitted_at`. The HOC loads only that submitted file, verifies returned project/submission/version identities,
then loads the bytes through the normal Scratch VM. Missing, denied, mismatched, or corrupted review content blocks
the Workspace; it never falls back to a working project.

The tutor can inspect Code/Costumes/Sounds and run/stop the normal Scratch stage. Manual Save, autosave, student
Submit/Resubmit, Rename, Duplicate, and Delete are unavailable. Approve and Request Changes both send the exact
version being reviewed; stale/non-latest or already-reviewed submissions reject.

Request Changes requires non-whitespace feedback. Development storage persists the feedback, review timestamp, and
history and surfaces the latest feedback on the next student launch. Approve sets both submission/project status to
Approved. Success removes further review actions from that session; failures remain visible and retryable.

## Development fixtures and production boundary

Deterministic fixtures cover student submitted/changes-requested/approved states, submission failure, exact/latest
tutor review, unavailable/corrupted submitted files, review access denial, approve failure, and request-changes
failure. Token-name checks and mocked binaries remain inside development launch/submission adapters.

The development adapter factory throws for `environment: production`. `render-gui.jsx` selects the always-rejecting
unavailable submission/review adapter in production. There is no fallback from a failed future Laravel operation to
IndexedDB.

## Automated verification

Focused Phase 6/directly affected Phase 4–5 tests:

```text
Test Suites: 8 passed, 8 total
Tests:       99 passed, 99 total
```

Targeted Phase 3–5 regression (launch HOC, persistence contract, development project-management adapter,
project-management contract, Workspace state UI):

```text
Test Suites: 5 passed, 5 total
Tests:       44 passed, 44 total
```

`npm run i18n:src` completed successfully. Targeted ESLint over every changed/new `.js` and `.jsx` file completed
with zero errors. A development webpack build completed successfully (`webpack 5.109.2`, 36.792 seconds).

Pre-existing output remains: the duplicate color-mode manual-mock notice, stale Browserslist data notice, legacy
React `defaultProps`/test `act` warnings, and Scratch VM dispatcher warnings. None is a Phase 6 test/build failure.

A subsequent targeted lifecycle-consistency check ran only the Phase 4/6 submission adapter, persistence adapter,
submission HOC, and persistence HOC suites after adding the atomic working-copy invariant:

```text
Test Suites: 4 passed, 4 total
Tests:       55 passed, 55 total
```

## Real-browser acceptance and responsive/accessibility checks

Verified against the local development build in a real Chrome browser:

1. Opened `demo-lesson`, changed the visible sprite name to `Phase6 State A` without saving, clicked Submit, and
   observed Submitted.
2. Opened `demo-review-latest`; the tutor saw exact `Phase6 State A`, Review mode, Code/Costumes/Sounds, and
   run/stop controls. Save/Submit counts were zero and both review actions were enabled.
3. Requested changes with `Please add a second step before resubmitting.` and observed Changes requested.
4. Reopened the student project; Changes requested, View feedback, Save, and Resubmit were present. The persisted
   feedback text was visible.
5. Changed the sprite name to `Phase6 State C` without requiring a prior Save and clicked Resubmit; observed
   Submitted and disabled Save.
6. Reopened latest tutor review; exact `Phase6 State C` was visible, Save/Submit remained absent, and Approve
   changed the state to Approved.

The browser proves exact A and latest C review behaviour; the focused immutable-store test additionally proves the
original A record still exists unchanged after C is created.

The targeted lifecycle-consistency follow-up used a fresh `127.0.0.1` origin/store: it manually persisted sprite
name `Lifecycle State X`, changed it to `Lifecycle State A`, and immediately submitted before the three-second
autosave debounce. Tutor review showed A and requested changes. Reopening the student working project then showed
`Lifecycle State A` (not X), after which unsaved `Lifecycle State C` was resubmitted and appeared in latest tutor
review. The paired adapter test proves the earlier immutable A record remains unchanged after C is created.

At 1440×900 and 1024×768, lifecycle controls/status, Code tab, and stage controls were visible and usable. At
800×600 the existing accessible `alert`/"Screen too small" restriction appeared, preserving the below-1024 rule.
New buttons/dialogs were discoverable by role and accessible name; required feedback starts with the confirmation
button disabled and enables after valid input.

## Security and diff review

- No launch, student Workspace, or tutor/review token is stored in project or submission records.
- No changed source references `localStorage` or `sessionStorage`.
- Every adapter operation requires a Workspace access token; refs alone are rejected as authorization.
- Review write actions require the exact submitted-version ref; review mode cannot call working-project
  Save/autosave or project-management mutations.
- Missing/corrupt review bytes fail closed with no working-project fallback.
- Production uses rejecting adapters and contains no development fallback.
- No added `console.log`, `console.info`, `debugger`, credential log, secret, or hardcoded production URL was found.
- `git diff --check` passes.
- No screenshots, generated `.sb3`, test output, development logs, temporary browser scripts, or webpack output are
  tracked/untracked.

## Laravel integration remaining

Implement the documented production adapters/endpoints for launch resolution, working-project persistence,
project management, submit, exact submitted-file loading, approve, and request changes. Laravel must enforce token
authorization, immutable submitted bytes, atomic project/submission status transitions, base-version concurrency,
latest/exact submitted-version review, feedback/history persistence, and the documented fail-closed errors.

## Closure assessment

Workspace Phase 6 is ready for human review and closure on the feature branch. It has not been committed, merged,
or deployed. Phase 7 remains untouched.
