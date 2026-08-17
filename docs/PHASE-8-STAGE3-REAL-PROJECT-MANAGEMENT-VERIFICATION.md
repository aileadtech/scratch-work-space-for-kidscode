# Phase 8 — Stage 3 Real Project Management Integration Verification

## Scope and branch

- Branch: `phase8/stage3-real-project-management`
- Base: clean `main` at `a4151a6` (merged Phase 8 Stage 2 real persistence)
- Scope: connect the Workspace's existing Phase 5 Rename/Duplicate/Delete project-management system to the real
  Laravel Stage 3 endpoints. Stage 2 Save/Load/Autosave (Phase 4) and Submit/Review (Phase 6) were not touched.

## API base configuration

Reuses the single `KIDSCODE_WORKSPACE_API_BASE_URL` build-time setting introduced in Phase 8A
(`getKidscodeWorkspaceApiBase`, `kidscode-production-launch-resolver.js`); no new configuration surface was added.

## Adapter selection

`createKidscodeWorkspaceProjectManagementAdapter` (`kidscode-production-project-management-adapter.js`) routes each
`renameProject`/`duplicateProject`/`deleteDraftProject` call by the session's own `workspace_access_token`,
mirroring how the Stage 2 persistence adapter already routes rather than by build mode:

- A token with the `DEVELOPMENT_WORKSPACE_TOKEN_` prefix (every development launch fixture) uses the existing
  development IndexedDB adapter, unchanged from Phase 5.
- Any other token — including a real TEST-server session opened from a local development build — uses the real
  Laravel adapter.
- A production build (`NODE_ENV === 'production'`) never constructs the development adapter at all; it always
  uses the real adapter, or the existing unavailable/rejecting adapter if `KIDSCODE_WORKSPACE_API_BASE_URL` is
  unset. There is no Laravel-failure-to-IndexedDB fallback in either build mode.

## Endpoint mapping

- `PATCH /scratch/workspace/projects/{project_ref}` — `Authorization: Bearer {workspace_access_token}`,
  `credentials: 'omit'`, JSON body `{"title": "<new title>"}`. Success returns the `RenameResult` JSON shape
  unchanged; the Workspace only updates the visible/confirmed title after this call resolves (existing Phase 5
  behaviour, untouched). Any non-2xx status rejects with the Laravel `{success:false, error:{code, message}}`
  envelope, and `use-kidscode-project-management-controller.js` leaves the previously confirmed title in place.
- `POST /scratch/workspace/projects/{project_ref}/duplicate` — same auth; **no request body**. This differs from the
  Phase 5 contract's original assumption (client-uploaded current `.sb3` bytes): the real Stage 3 endpoint
  duplicates the project's latest persisted server-side file instead, so unsaved editor content is not included
  unless the student has saved first. The adapter still receives `sb3`/`title` from the shared controller (same
  call shape as the development adapter) but does not forward them — nothing about the controller or the Rename/
  Duplicate/Delete dialogs needed to change. Success returns the `DuplicateResult` JSON shape unchanged and is
  returned to the UI for confirmation only. The duplicate receives no Workspace session automatically, the source
  token gains no authority over it, and the current Workspace remains on the source project.
- `DELETE /scratch/workspace/projects/{project_ref}` — same auth, no body. A successful (non-error) HTTP response is
  treated as `deleted: true` whether or not the backend returns a JSON body, so an empty `204` and a `DeleteResult`
  JSON body are both handled without guessing extra fields. Deletion is only ever applied to Workspace state
  (`kidscodeProjectDeleted` → the existing Draft Deleted blocking state) after this call resolves.

No local Laravel Stage 3 controller/tests exist in this repository to inspect directly (the backend lives in a
separate repository); endpoint paths were given directly by the task, and response envelopes follow the same
`{success, data}` / `{success: false, error: {code, message}}` convention already confirmed live for Stage 1/2 and
documented as the proposed Phase 5 shape in `docs/SHARED-API-CONTRACT.md`. No backend code was modified.

## Security

- All three requests send `Authorization: Bearer {workspace_access_token}` and `credentials: 'omit'`; no cookie or
  Sanctum token is sent.
- `workspace_access_token` is read from the existing runtime-only session context and is never logged, stored, or
  passed to `console.log`/`console.info`/`console.error`.
- Development fixtures and the IndexedDB store remain reachable only through a `DEVELOPMENT_WORKSPACE_TOKEN_`
  session, and the development adapter factory still throws if constructed with `environment: 'production'`
  (unchanged from Phase 5).
- Failure handling is unchanged from Phase 5's existing controller: a rejected `renameProject` leaves the
  confirmed title in place, a rejected `duplicateProject` leaves the original project untouched, and a rejected
  `deleteDraftProject` leaves `kidscodeProjectDeleted` false — none of the three adapter methods mutate local
  Workspace state before the backend call resolves successfully.

## Focused tests

Command (run from `packages/scratch-gui`):

```text
npx jest test/unit/util/kidscode-production-project-management-adapter.test.js \
  test/unit/util/kidscode-development-project-management-adapter.test.js \
  test/unit/util/kidscode-workspace-project-management-hoc.test.jsx \
  test/unit/util/kidscode-workspace-project-management-contract.test.js \
  --runInBand
```

Result: 4 suites passed, 45 tests passed.

New coverage added in `kidscode-production-project-management-adapter.test.js`:

- `renameProject` PATCHes the real endpoint with a `Bearer` header, no browser credentials, and the new title as a
  JSON body.
- `renameProject` propagates a rejected/locked-status Laravel error envelope without resolving.
- `duplicateProject` POSTs the real duplicate endpoint with only a `Bearer` header and no request body.
- `duplicateProject`'s response `project_ref` is independent of the original session's `project_ref`.
- `duplicateProject` propagates a rejected Laravel error envelope.
- `deleteDraftProject` DELETEs the real endpoint with only a `Bearer` header.
- `deleteDraftProject` treats a successful empty-body response (e.g. `204`) as `deleted: true`.
- `deleteDraftProject` propagates a rejected/locked-status Laravel error envelope rather than silently succeeding.
- `createKidscodeWorkspaceProjectManagementAdapter` routes a development-fixture token to the development adapter,
  a real token to the real adapter regardless of build mode, and never selects the development adapter in
  production even for a fixture-shaped token.

Targeted ESLint over the three changed/added JavaScript files exited with 0 errors (only the repository's existing
`arrow-parens`/`jsdoc`/`max-len` style warnings, unchanged in kind from Phase 8 Stage 2).

## Real browser smoke test

Performed against a real TEST-server Workspace session (`https://testing.aileadkidscode.com/api`), project "Make
the cat walk" (`project_ref: SCR-PROJ-IY0INT`), running the Workspace from `http://localhost:8601`.

**First pass — auth-contract blocker.** Rename's real `PATCH` request reached the endpoints originally given for
this stage (`/api/student/scratch/projects/{project_ref}`, the normal student-facing API namespace) and returned
`401 Unauthorized` (`{"message":"Access denied. Authentication token required.","status":"error"}`). Root cause:
those routes are guarded by the normal student/Sanctum session auth, which the Workspace never holds by design —
it only ever carries the short-lived, single-project-scoped `workspace_access_token` (Phase 3 secure-launch
boundary). Duplicate/Delete were not attempted against those routes. Backend then deployed Workspace-token-
authenticated equivalents under `/api/scratch/workspace/projects/...` (matching the Stage 1/2 namespace and auth
model), and the adapter's `projectPath`/`projectDuplicatePath` were updated to point there — no other adapter
behaviour changed.

**Second pass — full result, against the corrected `/scratch/workspace/projects/...` routes:**

- **Rename**: `PATCH /api/scratch/workspace/projects/SCR-PROJ-IY0INT` → `200`. Renamed to
  `Make the cat walk (Stage3 Smoke Test)`; the student dashboard reflected the new title after refresh, and a
  fresh independent Workspace launch (new one-time token, same project) still showed the renamed title. PASS.
- **Duplicate**: `POST /api/scratch/workspace/projects/SCR-PROJ-IY0INT/duplicate` → `201 Created`. New
  `project_ref: SCR-PROJ-WRAPP2`, `project_type: independent`, `status: draft`, no
  `assignment_ref`/`course_ref`/`lesson_ref`. The Workspace session stayed on the source project throughout (no
  automatic navigation or session hand-off to the duplicate), and the student dashboard subsequently showed both
  projects independently. PASS. **Unsaved-changes contract, as documented above**: the duplicate reflects the
  project's latest *saved* server-side file, not any unsaved editor content — confirmed by the endpoint sending no
  request body. The current Workspace UX does not show a warning that unsaved changes are excluded from a
  duplicate; this was not changed as part of Stage 3 (out of scope — no UI/UX behaviour change was requested), but
  is noted here as an accurate description of current behaviour rather than an assumption.
- **Delete**: opened the duplicate (`SCR-PROJ-WRAPP2`) specifically, confirmed (before deleting) that the loaded
  `project_ref` was the duplicate and not the source, then deleted it. `DELETE
  /api/scratch/workspace/projects/SCR-PROJ-WRAPP2` succeeded; the Workspace showed the Draft Deleted blocking
  state. After reopening the student dashboard, only the original lesson project remained — the duplicate was
  confirmed gone from the backend/student project list, and the original source project was untouched throughout.
  PASS.
- **Failure safety**: the first-pass 401 on Rename did not mutate any local Workspace state — the title shown
  remained the pre-rename title, matching `use-kidscode-project-management-controller.js`'s existing behaviour of
  only confirming a title/duplicate/deletion after the adapter call resolves successfully.

## Post-delete navigation fix (Phase 7 regression found during Stage 3 real-session testing)

After the Delete pass above, "Return to Kidscode" from the Draft Deleted blocking state did not respond to
clicks, and the Workspace's normal always-visible Back/Return-to-Kidscode control was equally unresponsive.

**Root cause**: both controls route through the same Phase 7 destination validator
(`validateKidscodeReturnDestination`), which rejects any absolute-URL destination whose origin is not in an
explicitly configured allowlist and fails closed (no navigation, no error) rather than guessing. `render-gui.jsx`
hard-coded that allowlist to `['http://localhost:8601']` in every non-production build — the Workspace's own
origin, never the real Kidscode frontend's. A real session's `session.return_to.url` points at the real Kidscode
frontend's absolute origin, so every real-session Return action was silently rejected; this was a known, documented
gap (`docs/WORKSPACE-CURRENT-STATE.md` already flagged the allowlist as "expected to be populated in Phase 8") that
had not yet been exercised by a real-session browser test until now.

**Fix**: the allowlist is now build-time configurable via `KIDSCODE_WORKSPACE_ALLOWED_RETURN_ORIGINS`
(comma-separated absolute origins), the same "injected/configured seam" pattern as
`KIDSCODE_WORKSPACE_API_BASE_URL` — see `getKidscodeWorkspaceAllowedReturnOrigins`
(`kidscode-workspace-navigation-contract.js`) and its wiring into `webpack.config.js`'s `DefinePlugin` (required for
`process.env.KIDSCODE_WORKSPACE_ALLOWED_RETURN_ORIGINS` to reach the browser bundle at all) and `render-gui.jsx`.
Production still defaults to an empty allowlist (fails closed, unchanged); development still includes the
Workspace's own `http://localhost:8601` origin by default so purely local fixture-driven Return testing keeps
working with no configuration. The destination validator itself, its same-origin/relative-path rule, and its
rejection of `javascript:`/`data:`/protocol-relative URLs are all unchanged — only the allowlist's *source* changed,
from a hard-coded literal to configuration.

**Focused tests** (run from `packages/scratch-gui`):

```text
npx jest test/unit/util/kidscode-workspace-navigation-contract.test.js \
  test/unit/util/kidscode-workspace-navigation-hoc.test.jsx \
  --runInBand
```

Result: 2 suites passed, 34 tests passed. New coverage in `kidscode-workspace-navigation-contract.test.js`:
`getKidscodeWorkspaceAllowedReturnOrigins` fails closed with an empty allowlist in production by default; uses
exactly the configured origins once `KIDSCODE_WORKSPACE_ALLOWED_RETURN_ORIGINS` is set in production; includes the
Workspace dev-server origin in development even when nothing is configured; adds a configured real-session origin
alongside the dev-server origin in development; treats blank/whitespace-only configuration as unset. Targeted
ESLint over the four changed files (`kidscode-workspace-navigation-contract.js`, `render-gui.jsx`,
`kidscode-workspace-navigation-contract.test.js`, `webpack.config.js`) exited with 0 errors (only the repository's
existing `arrow-parens`/`jsdoc` style warnings).

**Verification**: dev server restarted with `KIDSCODE_WORKSPACE_ALLOWED_RETURN_ORIGINS=https://test.aileadkidscode.com`
(the real Kidscode TEST frontend's origin). A fresh real launch, followed by clicking Return, now actually
navigates — the browser was sent to `https://test.aileadkidscode.com/student-home/scratch/projects/SCR-PROJ-IY0INT`,
exactly the session's own `return_to.url`. **Return to Kidscode navigation is fixed on the Workspace side.**

**Separate, out-of-scope finding**: that destination itself returns an HTTP 404 ("Page not found") on the real
Kidscode TEST frontend. The Workspace correctly validated and navigated to the exact trusted `return_to.url` it was
given; the 404 means that URL doesn't resolve to a real page on the Kidscode frontend (or the backend's
`return_to.url` value itself needs correcting). Per this stage's explicit scope, no backend or Kidscode frontend
change was made — this is reported as a finding for whichever team owns that route, not fixed here.

## Close status

Rename, Duplicate, and Delete are all verified PASS against the real Laravel Stage 3 endpoints
(`/api/scratch/workspace/projects/...`), including safe deletion of only the intended (duplicate) project. The
post-delete/general Return-to-Kidscode navigation regression found during this pass is fixed on the Workspace side
and verified with a real click test. One out-of-scope finding remains open: the real Kidscode frontend 404s on the
specific `return_to.url` this project's real launch session carries — needs the Kidscode frontend/backend team,
not a Workspace change. Ready for review; not yet committed.
