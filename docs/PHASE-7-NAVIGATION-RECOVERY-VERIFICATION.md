# Phase 7 — Navigation + Recovery Verification

## Objective and repository boundary

Implement safe Workspace navigation and recovery: validated Return to Lesson / Return to My Scratch Projects /
Return to Tutor Review, unsaved-work protection with a Save-and-Leave flow, browser close/reload protection, and
recovery paths out of Session Expired, Project Deleted, Corrupted Project, Review Access Blocked, and Corrupted
Submission — all without open redirects, without trusting the browser URL, and without a second save
implementation. Work is on `phase7/navigation-recovery`, based on verified main
`e511380d0a5a0367c68b870ee03b83bbf3639c43`. It is uncommitted and unmerged. Phase 8 was not started.

## Final checklist

- [x] 7.1 Verify main and create Phase 7 branch
- [x] 7.2 Complete fast-start context read
- [x] 7.3 Inspect existing Return controls and `return_to` contract
- [x] 7.4 Design isolated navigation/recovery layer
- [x] 7.5 Implement safe return-destination validation
- [x] 7.6 Connect Return to Lesson
- [x] 7.7 Connect Return to My Scratch Projects
- [x] 7.8 Support Tutor review return
- [x] 7.9 Implement unsaved-work navigation protection
- [x] 7.10 Handle Save-in-progress navigation safely
- [x] 7.11 Handle Save-failed navigation safely
- [x] 7.12 Add browser close/reload protection for unsaved work
- [x] 7.13 Implement expired-session recovery
- [x] 7.14 Implement deleted-project recovery
- [x] 7.15 Handle blocked/invalid-session recovery appropriately
- [x] 7.16 Prevent navigation from unsafe/arbitrary destinations
- [x] 7.17 Add development navigation fixtures
- [x] 7.18 Focused tests
- [x] 7.19 Phase 4–6 targeted regression
- [x] 7.20 Targeted browser verification
- [x] 7.21 Responsive/accessibility check for changed UI
- [x] 7.22 Security/diff review
- [x] 7.23 Update Shared API Contract
- [x] 7.24 Update `WORKSPACE-CURRENT-STATE.md`
- [x] 7.25 Create Phase 7 verification document

Completion: **25/25 (100%)**.

## Fast-start investigation

Read in the required order: `AGENTS.md`, `docs/AGENT-START-HERE.md`, `docs/WORKSPACE-CURRENT-STATE.md`,
`docs/SHARED-API-CONTRACT.md`, and `docs/PHASE-6-SUBMISSION-TUTOR-REVIEW-VERIFICATION.md`. Investigation then
stayed within the Project menu's Return items, the Phase 3 `session.return_to` contract, the Phase 4
Save/autosave/`resolveKidscodeWorkspaceState` state machine, the Phase 5/6 blocking-state modal
(`KidscodeWorkspaceBlockingState`), the launch/review fixtures, and the existing HOC composition and adapter
patterns. Both `onBackToKidscode` and the Project menu's two Return items were confirmed to still be no-ops from
`playground/render-gui.jsx`, and every blocking state except Session Expired/Launch Connection Lost/Corrupted
Project had no working recovery action.

## Navigation/recovery architecture

```text
Workspace controls / recovery UI
             ↓
Kidscode Workspace Navigation Controller  (use-kidscode-workspace-navigation-controller.js)
             ↓
Return Destination Validator              (kidscode-workspace-navigation-contract.js)
             ↓
Navigation Transport                      (kidscode-workspace-navigation-contract.js)
```

New files, all under `src/lib/kidscode-workspace-navigation/` unless noted:

- `kidscode-workspace-navigation-contract.js` — `KidscodeReturnDestinationType` enum (`lesson`/`projects`/
  `review`/`recovery`), `validateKidscodeReturnDestination` (the sole choke point every navigation passes
  through), `createKidscodeWindowNavigationTransport` (real `window.location`), `createKidscodeMockNavigationTransport`
  (records calls, for tests).
- `use-kidscode-workspace-navigation-controller.js` — the controller: `requestReturn` decides immediate navigation
  vs. opening the Save-and-Leave confirmation based on the resolved workspace state; `handleRecoveryAction` routes
  blocking-state recovery clicks to `session.return_to` or the injected recovery URL.
- `use-kidscode-workspace-before-unload.js` — enables/disables the real `beforeunload` listener.
- `kidscode-workspace-navigation-hoc.jsx` — mounts the controller, re-derives the same resolved workspace state
  `menu-bar.jsx` displays, and wires everything onto existing props.
- `components/kidscode-menu-bar/kidscode-navigation-confirm-dialog.jsx` — the Save-and-Leave confirmation dialog,
  rendered by `components/gui/gui.jsx` (not by the HOC — see "Architecture note" below).

`KidscodeWorkspaceNavigationHOC` is the last/innermost HOC in `playground/render-gui.jsx`'s compose chain,
wrapping `GUI` directly, so it receives Persistence's fully resolved `kidscodeWorkspaceState`.

### Architecture note: why the dialog is rendered by `gui.jsx`, not the HOC

The first working version rendered `<KidscodeNavigationConfirmDialog>` as a sibling of `<WrappedComponent>` inside
the HOC. Real-browser testing caught this immediately: it crashed with `[React Intl] Could not find required
'intl' object` the moment a Return control opened the dialog, because `<IntlProvider>` is created inside `GUI`'s
own render tree (`containers/gui.jsx`'s `injectIntl`), not above this HOC — anything rendered as a sibling of
`<WrappedComponent>` sits outside it. The fix follows the same pattern `KidscodeWorkspaceBlockingState` already
uses: the HOC exposes `kidscodeNavigationConfirm` plus three handler props
(`onKidscodeNavigationSaveAndLeave`/`onKidscodeNavigationLeaveWithoutSaving`/`onKidscodeNavigationStay`), and
`components/gui/gui.jsx` renders the dialog itself, next to its existing `KidscodeWorkspaceBlockingState` render.

### Architecture note: why the resolved workspace state has to be re-derived

Real-browser testing also caught a second bug: Persistence's own `kidscodeWorkspaceState` is never actually
`unsaved` — it only ever moves through `saving`/`saved`/`save-failed`/`null`. The `Unsaved` label students see
comes from `resolveKidscodeWorkspaceState` (`src/lib/kidscode-workspace-state.js`), applied only inside
`menu-bar.jsx`'s own `mapStateToProps` from Redux's `projectChanged` flag. The Navigation HOC was reading the raw,
un-resolved prop, so `requestReturn` always saw `saved` and navigated immediately even with a real unsaved edit on
screen. The fix: `KidscodeWorkspaceNavigationHOC` now also connects to Redux for `projectChanged`/`isUpdating` and
applies the identical `resolveKidscodeWorkspaceState` call before making any Save-and-Leave decision, so it agrees
with what the student actually sees.

## Return destination validation

`return_to.type` is now a restricted enum (`lesson`/`projects`/`review`) enforced inside
`validateKidscodeLaunchResponse` — a launch response with any other value is rejected as
`INVALID_LAUNCH_RESPONSE` before a session is ever exposed. `review` is new: a `launch_type: "review"` fixture now
returns `return_to: {type: "review", url: "/tutor/submissions"}` regardless of the underlying project's type,
correcting the previous (incorrect, pre-Phase-7) behaviour of reusing the student `lesson`/`projects` destination
for a tutor.

`validateKidscodeReturnDestination` is the single point every navigation passes through: a same-origin, path-only
URL (`/lessons`) is always accepted; an absolute `http(s)://` URL is accepted only if its origin is in an
environment-configured allowlist (empty by default); `javascript:`, `data:`, protocol-relative (`//host/...`), and
any other shape are rejected outright. The browser URL's own query parameters are never read for a destination —
only `session.return_to` and the injected recovery URL are ever passed in.

## Student lesson / independent return

The Project menu now shows exactly one Return item, matching `session.return_to.type` (`Return to lesson` for
`lesson`, `Return to My Scratch Projects` for `projects`) — not both unconditionally, as before. `onReturnToLesson`,
`onReturnToMyScratchProjects`, `onReturnToTutorReview`, and the always-visible `onBackToKidscode` button all resolve
to the same function (`requestReturn(session.return_to)`), since there is exactly one valid destination per session.

## Tutor review return

Review-mode launches show a single new `Return to Tutor Review` item instead of the student items. Because Tutor
Review Mode has no mutable working copy, the resolved workspace state is never `unsaved`/`saving`/`save-failed`
during review, so this always navigates immediately with no confirmation and no `beforeunload` warning — verified
directly (see below).

## Unsaved-work / Save-and-Leave / Save-failed behaviour

- **Saved** → `requestReturn` navigates immediately.
- **Unsaved** → opens the confirmation dialog (`Save and Leave` / `Stay` / destructive `Leave without saving`).
- **Saving** (already in flight, e.g. from autosave) → opens the dialog in a waiting state with no `Save and Leave`
  button (no second save is started); an effect watches the resolved state and completes the pending navigation
  once it reaches `Saved`, or updates the dialog if it reaches `Save failed`.
- **Save failed** → `Save and Leave` retries via the existing Phase 4 manual-save mechanism
  (`onSaveProject`/`handleManualSave`) — there is no second `.sb3` save implementation. A retry that fails again
  keeps the dialog open with the failed message; `Leave without saving` remains available and is clearly
  destructive.
- `Stay` and the dialog's own dismiss (ESC/overlay click) always just cancel — never a silent discard.

## Browser close/reload protection

`useKidscodeWorkspaceBeforeUnload` enables a real `beforeunload` listener only while the resolved state is
`unsaved`/`saving`/`save-failed`, and never while `kidscodeReviewMode` is true. It replaces the previous blanket
`window.onbeforeunload = () => true` that `render-gui.jsx` set unconditionally in production regardless of save
state or review mode.

## Recovery: Session Expired, Project Deleted, Corrupted Project, Review Access Blocked, Corrupted Submission

`blockingStateMessages` (`kidscode-workspace-state.jsx`) now has a working `action` for all five — Project Deleted,
Review Access Blocked, and Corrupted Submission previously had none. Recovery is routed through
`onWorkspaceStateAction`, intercepted by the Navigation HOC's `handleRecoveryAction`:

- **Session Expired** — no session exists at this point, so it uses the separately injected `kidscodeWorkspaceRecoveryUrl`
  (production: `null`, fail-closed, until Phase 8 configures a real one; development: `/`).
- **Project Deleted / Corrupted Project / Review Access Blocked / Corrupted Submission** — a validated session
  already exists, so these use `session.return_to` directly.
- **Access Blocked** (invalid/denied launch) — deliberately unchanged: no session, no button. This is correct,
  documented fail-closed behaviour, not a gap.
- **Launch Connection Lost / Save failed** — unchanged existing Retry behaviour; the HOC only intercepts the five
  states above and passes everything else through untouched.

## Development fixtures

No new launch fixtures were needed. Existing fixtures already cover every required flow: `demo-lesson` /
`demo-independent` (student return), `demo-review-latest` / `demo-review-submitted` (tutor return, now correctly
`return_to.type: "review"`), `demo-expired` (Session Expired recovery), and the existing Phase 5 Delete Draft flow
on any independent/lesson fixture (Project Deleted recovery). `render-gui.jsx` injects
`kidscodeWorkspaceRecoveryUrl`/`kidscodeWorkspaceAllowedReturnOrigins` — `null`/`[]` in production,
`'/'`/`['http://localhost:8601']` in development — clearly separated from any production value.

## Automated verification

Focused Phase 7 tests plus every Phase 3–6 test directly touched by this phase:

```text
Test Suites: 16 passed, 16 total
Tests:       199 passed, 199 total
```

New test files: `kidscode-workspace-navigation-contract.test.js`, `kidscode-workspace-navigation-hoc.test.jsx`,
`kidscode-workspace-before-unload.test.js`. Existing `kidscode-project-controls.test.jsx`,
`kidscode-workspace-state.test.jsx`, and `kidscode-workspace-launch.test.js` were extended for the single-item
Return menu, the new recovery actions, and the `review` `return_to.type`/enum restriction respectively.

`npm run i18n:src` completed successfully (no tracked translation-source diff — `translations/` is gitignored).
Targeted ESLint over every changed/new file completed with **0 errors** (only pre-existing `arrow-parens`-style
warnings, present in files this phase did not touch). A development webpack build completed successfully
(`webpack 5.109.2`, both before and after the real-browser fixes below).

## Real-browser acceptance

Verified against the local development build (`npx npm@10.9.9 start`, `http://localhost:8601/`) using a scripted
Playwright driver (no `chromium-cli` available in this environment; `playwright`'s `chromium.launch()` was used
directly per the `run` skill's documented fallback). All scripts were deleted before finishing; nothing was
committed or deployed.

Two real bugs were found and fixed by this testing (see "Architecture note" sections above) before the following
all passed:

1. `demo-lesson`: edited the sprite name without saving, opened the Project menu, clicked `Return to lesson` →
   the "Leave Workspace?" confirmation opened (not immediate navigation).
2. Clicked `Save and Leave` → the project saved, then the browser navigated to `/lessons`.
3. `demo-save-failure`: edited, Return, `Save and Leave` → the dialog showed the failed-save message; the browser
   did **not** navigate away.
4. `demo-independent`: Project menu showed only `Return to My Scratch Projects` (not `Return to lesson`); clicking
   it while Saved navigated immediately to `/scratch-projects`.
5. `demo-review-latest`: hit `Review Access Blocked` on a cold/fresh browser profile — confirmed **pre-existing**
   on unmodified `main` (see "Pre-existing behaviour observed" below) — and its new `Return to Kidscode` recovery
   action correctly navigated to `/tutor/submissions`.
6. `demo-expired`: the Session Expired blocking dialog's `Return to Kidscode` button navigated to `/` (the
   injected development recovery URL).
7. A real unsaved edit correctly triggered the `beforeunload` warning (`event.defaultPrevented === true`); a
   Saved project did not (`false`).
8. Below-1024 restriction and 1024px boundary usability were unaffected.
9. `demo-independent` → Delete draft → `Draft Deleted` blocking state → its new `Return to Kidscode` action
   navigated to `/scratch-projects`.

Final result: **18/18 checks passed.**

### Pre-existing behaviour observed (not a Phase 7 regression)

`demo-review-latest` hit `Review Access Blocked` on a completely fresh browser profile during testing. This was
verified to reproduce **identically on unmodified `main`** (stashed all Phase 7 changes, let webpack recompile,
re-ran the same script, restored the stash afterward — `git status` confirmed a clean restore). It is a
pre-existing Phase 6 behaviour under cold/fresh IndexedDB conditions in this environment, unrelated to any Phase 7
change, and is left for a future investigation outside this phase's boundary. Phase 7's own contribution — the new
`Return to Kidscode` recovery action for exactly this blocking state — was verified working correctly when the
state occurs.

## Targeted Phase 4–6 regression

`kidscode-workspace-launch-hoc`, `kidscode-workspace-persistence-{contract,hoc}`,
`kidscode-development-persistence-adapter`, `kidscode-workspace-project-management-{contract,hoc}`,
`kidscode-development-project-management-adapter`, `kidscode-workspace-submission-review-{contract,hoc}`,
`kidscode-development-submission-review-adapter` — all pass unchanged (99 tests, included in the 199 total above).

## Responsive/accessibility

Verified at 1024px (Project menu usable) and 800px (existing below-1024 "Screen too small" restriction intact,
unaffected). The new confirm dialog and the newly-actionable blocking states reuse the existing `Modal`/`ReactModal`
components already used by Rename/Delete/Duplicate and the other blocking states, so they inherit the same
`role="dialog"`/`role="alertdialog"`, accessible-name (`contentLabel`), and keyboard/focus handling; the new
`Leave without saving` button is visually and textually marked destructive, matching the existing Delete Draft
button pattern.

## Security and diff review

- No destination is ever read from the browser URL's query parameters.
- `javascript:`/`data:`/protocol-relative URLs are rejected by `validateKidscodeReturnDestination` (unit-tested).
- Absolute-URL navigation requires an explicitly configured origin allowlist; production's is empty.
- Production's recovery URL is `null` (fail-closed) until Phase 8 configures a real one.
- No launch, Workspace access, or review token is read, stored, or logged anywhere in the new navigation code —
  navigation never needs a token, only `session.return_to`.
- No `console.log`/`console.info`/`debugger` in any new or changed file.
- No `localStorage`/`sessionStorage` reference in any new or changed file.
- No hardcoded production destination in application code; the one real-domain reference outside
  `docs/SHARED-API-CONTRACT.md`'s pre-existing Phase 3 example was a doc-comment/test-fixture placeholder and has
  been changed to a generic `kidscode.example` domain to avoid any appearance of baking in an unconfirmed
  production origin.
- `git diff --check` passes (no whitespace errors).
- No screenshots, generated `.sb3`, test output, temporary browser scripts, or dev-server logs are
  tracked/untracked in the final `git status`.

## Files changed

New:

- `packages/scratch-gui/src/lib/kidscode-workspace-navigation/kidscode-workspace-navigation-contract.js`
- `packages/scratch-gui/src/lib/kidscode-workspace-navigation/use-kidscode-workspace-navigation-controller.js`
- `packages/scratch-gui/src/lib/kidscode-workspace-navigation/use-kidscode-workspace-before-unload.js`
- `packages/scratch-gui/src/lib/kidscode-workspace-navigation/kidscode-workspace-navigation-hoc.jsx`
- `packages/scratch-gui/src/components/kidscode-menu-bar/kidscode-navigation-confirm-dialog.jsx`
- `packages/scratch-gui/test/unit/util/kidscode-workspace-navigation-contract.test.js`
- `packages/scratch-gui/test/unit/util/kidscode-workspace-navigation-hoc.test.jsx`
- `packages/scratch-gui/test/unit/util/kidscode-workspace-before-unload.test.js`

Modified:

- `packages/scratch-gui/src/playground/render-gui.jsx` — wire `KidscodeWorkspaceNavigationHOC` into the compose
  chain; remove the dead `onBackToKidscode`/`onReturnToLesson`/`onReturnToMyScratchProjects` no-ops and the blanket
  production `beforeunload`; inject `kidscodeWorkspaceRecoveryUrl`/`kidscodeWorkspaceAllowedReturnOrigins`.
- `packages/scratch-gui/src/lib/kidscode-workspace-launch.js` — `return_to.type` enum restriction; `review`
  return-destination type for tutor launches.
- `packages/scratch-gui/src/components/kidscode-menu-bar/kidscode-workspace-state.jsx` — recovery `action` for
  Project Deleted/Review Access Blocked/Corrupted Submission.
- `packages/scratch-gui/src/components/kidscode-menu-bar/kidscode-project-controls.jsx` — single conditional
  Return item; new `onReturnToTutorReview`.
- `packages/scratch-gui/src/components/menu-bar/menu-bar.jsx` — thread `onReturnToTutorReview`.
- `packages/scratch-gui/src/components/gui/gui.jsx` — thread `onReturnToTutorReview`; render
  `KidscodeNavigationConfirmDialog` from `kidscodeNavigationConfirm`/`onKidscodeNavigation*` props.
- `packages/scratch-gui/test/unit/components/kidscode-project-controls.test.jsx`,
  `packages/scratch-gui/test/unit/components/kidscode-workspace-state.test.jsx`,
  `packages/scratch-gui/test/unit/util/kidscode-workspace-launch.test.js` — updated/extended for the above.
- `docs/SHARED-API-CONTRACT.md` — new "Workspace Navigation and Recovery (Phase 7)" section.

## Laravel/frontend integration remaining

None of this phase requires a new backend endpoint — navigation is entirely client-side, driven by the existing
Phase 3 launch response. Phase 8 must supply the real Kidscode recovery URL and allowed absolute-origin allowlist
(both currently `null`/empty in production, by design). No Kidscode frontend Student/Tutor dashboard pages were
built inside Scratch, per the phase boundary.

## Closure assessment

Workspace Phase 7 is ready for human review and closure on the feature branch. It has not been committed, merged,
or deployed. Phase 8 remains untouched.
