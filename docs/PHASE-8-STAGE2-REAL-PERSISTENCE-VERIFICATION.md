# Phase 8 — Stage 2 Real Persistence Integration Verification

## Scope and branch

- Branch: `phase8/stage2-real-persistence`
- Base: clean `main` at `a075bcaaab9afd97d61e920f339555bc8831959f`
- Scope: connect the Workspace's existing Phase 4 Save/Load/Autosave system to the real Laravel Stage 2
  persistence endpoints. Stage 3/4 backend endpoints exist but were not integrated. Rename/Duplicate/Delete
  (Phase 5) and Submit/Review (Phase 6) were not touched.

## API base configuration

Reuses the single `KIDSCODE_WORKSPACE_API_BASE_URL` build-time setting introduced in Phase 8A
(`getKidscodeWorkspaceApiBase`, `kidscode-production-launch-resolver.js`); no new configuration surface was added.

## Adapter selection

`createKidscodeWorkspacePersistenceAdapter` (`kidscode-production-persistence-adapter.js`) routes each
`loadProject`/`saveProject` call by the session's own `workspace_access_token`, mirroring how the Stage 1 launch
resolver already routes by launch token rather than by build mode:

- A token with the `DEVELOPMENT_WORKSPACE_TOKEN_` prefix (every development launch fixture) uses the existing
  development IndexedDB adapter.
- Any other token — including a real TEST-server session opened from a local development build, the same
  workflow Phase 8A's smoke test used — uses the real Laravel adapter.
- A production build (`NODE_ENV === 'production'`) never constructs the development adapter at all; it always
  uses the real adapter, or the existing unavailable/rejecting adapter if `KIDSCODE_WORKSPACE_API_BASE_URL` is
  unset. There is no Laravel-failure-to-IndexedDB fallback in either build mode.

## Endpoint mapping

- `GET /scratch/workspace/projects/{project_ref}/file` — `Authorization: Bearer {workspace_access_token}`,
  `credentials: 'omit'`. Success (200): raw `.sb3` bytes as the body; `version_ref`/`saved_at` read from the
  `X-Scratch-Version-Ref`/`X-Scratch-Saved-At` response headers (confirmed with the backend team; the endpoint
  does not wrap the file response in JSON). No file yet (404): mapped to the same starter/blank `LoadResult` the
  development adapter already returns for an unrecorded `project_ref` — not treated as an error. Any other
  non-2xx status rejects with the Laravel `{success:false, error:{code, message}}` envelope.
- `POST /scratch/workspace/projects/{project_ref}/save` — same auth; `multipart/form-data` with `project_file`
  (the exact `ArrayBuffer` from `vm.saveProjectSb3()`), `base_version_ref` (omitted entirely, not sent empty, on
  a first save with no prior version), `save_reason` (`manual`/`autosave`). Success returns the `SaveResult` JSON
  shape unchanged. `409 PROJECT_VERSION_CONFLICT` rejects with that code/message attached to the thrown `Error`;
  the existing `KidscodeWorkspacePersistenceHOC` handles any `saveProject` rejection identically (Save Failed,
  retryable by the student, no local `version_ref` mutated) — this required no HOC change to handle safely.

## Security

- Both requests send `Authorization: Bearer {workspace_access_token}` and `credentials: 'omit'`; no cookie or
  Sanctum token is sent.
- `workspace_access_token` is read from the existing runtime-only session context and never logged, stored, or
  passed to `console.log`/`console.info`. The one diagnostic log path (a 200 response unexpectedly missing the
  version headers — a backend contract violation, not an expected outcome) uses the existing `tslog`-based
  `log.error`, not a raw `console` call, and logs only the `project_ref`, never the token or file bytes.
- Development fixtures and the IndexedDB store remain reachable only through a `DEVELOPMENT_WORKSPACE_TOKEN_`
  session, and the development adapter factory still throws if constructed with `environment: 'production'`
  (unchanged from Phase 4).

## Live backend probing (unauthenticated, precedes the real-session test below)

Before a live session was available, the endpoints were probed directly against
`https://testing.aileadkidscode.com/api` without authentication to confirm routing and the error envelope:

- `GET .../projects/PROBE-REF/file` and `POST .../projects/PROBE-REF/save` both return `401` with
  `{"success":false,"error":{"code":"WORKSPACE_TOKEN_INVALID","message":"..."}}` — confirms both routes exist and
  share the same error envelope as every other endpoint on this API (matches `docs/SHARED-API-CONTRACT.md`).

## Real-session browser smoke test result

Performed with a real student launch against `https://testing.aileadkidscode.com/api` (project "Make the cat
walk", `project_ref: SCR-PROJ-IY0INT`), running the Workspace from `http://localhost:8601` with
`KIDSCODE_WORKSPACE_API_BASE_URL` pointed at the TEST server — the same adapter code path a production build uses,
since adapter selection routes by the session's own `workspace_access_token`, not by build mode. CORS from
`http://localhost:8601` passed for both endpoints, consistent with Phase 8A's CORS result.

- **Initial load**: `GET .../file` returned `200` with the real saved project (not a `demo-*` fixture); title and
  content matched the actual Laravel-stored project.
- **First manual save**: `POST .../save` sent `base_version_ref` (the `version_ref` from the load's
  `X-Scratch-Version-Ref` header) and `save_reason=manual`; returned `200` with a new `version_ref`/`saved_at`.
  PASS.
- **Save → reload the exact project**: a second, independent launch (fresh one-time token, same project) issued
  its own `GET .../file`; it returned `200` with `X-Scratch-Version-Ref` matching the version just saved,
  `X-Scratch-Saved-At` present, and the exact edited content visible in the editor. PASS.
- **Autosave**: after an edit with no manual Save click, `POST .../save` fired on its own ~3s later (the
  `KIDSCODE_AUTOSAVE_DEBOUNCE_MS` debounce) with `save_reason=autosave` and the correct `base_version_ref`;
  returned `200` with a new `version_ref`. PASS at the network/data level. The visual "Saving…" → "Saved" menu-bar
  transition was not independently observed in this pass — a UI-polish confirmation gap, not a data-correctness
  one.
- **Manufactured stale-version conflict**: with two tabs open on the same project (Tab A and Tab B, each its own
  launch/session), Tab A saved and advanced the version; Tab B then saved using its now-stale `base_version_ref`
  and received `409` with `{"success":false,"error":{"code":"PROJECT_VERSION_CONFLICT","message":"A newer version
  of this project already exists."}}`, exactly as documented. The Workspace did not crash or silently overwrite;
  Tab B showed the Save Failed state and its local version state was not corrupted. PASS.

## Focused tests

Command (run from `packages/scratch-gui`):

```text
npx jest test/unit/util/kidscode-production-persistence-adapter.test.js \
  test/unit/util/kidscode-development-persistence-adapter.test.js \
  test/unit/util/kidscode-workspace-persistence-hoc.test.jsx \
  test/unit/util/kidscode-workspace-persistence-contract.test.js \
  test/unit/util/kidscode-production-launch-resolver.test.js \
  test/unit/util/kidscode-workspace-launch.test.js \
  --runInBand
```

Result: 6 suites passed, 81 tests passed. The pre-existing `act(...)` console warnings in
`kidscode-workspace-persistence-hoc.test.jsx` are unchanged from before this branch and unrelated to this change.

New coverage added in `kidscode-production-persistence-adapter.test.js`:

- `loadProject` sends only a `Bearer` header with no browser credentials.
- `loadProject` reads `version_ref`/`saved_at` from response headers and the body as `sb3` bytes on success.
- `loadProject` rejects a 200 response that is missing the version headers, instead of silently accepting it.
- `loadProject` on 404 falls back to the starter project for a `new_lesson` launch and to blank otherwise.
- `loadProject` propagates a non-404 Laravel error envelope (e.g. `401 WORKSPACE_TOKEN_INVALID`).
- `saveProject` sends `multipart/form-data` with `project_file`/`save_reason` and a `Bearer` header, omitting
  `base_version_ref` on a first save.
- `saveProject` sends the latest `base_version_ref` on a subsequent save.
- `saveProject` rejects a `409 PROJECT_VERSION_CONFLICT` response with that code attached, without crashing.
- `createKidscodeWorkspacePersistenceAdapter` routes a development-fixture token to the development adapter, a
  real token to the real adapter regardless of build mode, and never selects the development adapter in
  production even for a fixture-shaped token.

Targeted ESLint over the five changed/added JavaScript files exited with 0 errors (only the repository's existing
`arrow-parens`/`jsdoc` style warnings, unchanged from Phase 8A). `git diff --check` passed.

## Close status

Implementation, focused unit tests, and the real-session browser smoke test (first save, save → reload, autosave,
manufactured stale-version conflict) are complete and passing. Ready for review and commit.
