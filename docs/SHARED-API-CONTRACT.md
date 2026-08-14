# Shared API Contract

This document is the repository source of truth for the API boundary shared by the Kidscode Scratch Workspace and
the Kidscode Laravel application. Phase 3 defines the secure Workspace launch contract. Phase 4 adds the Workspace
persistence (save/load/autosave) contract. Phase 5 adds the Workspace project-management (rename/duplicate/delete)
contract. None of the three define submission or review APIs.

## Resolve Workspace launch

`POST /api/scratch/workspace/launch/resolve`

The Workspace sends only the temporary opaque launch token received in the browser URL:

```json
{
  "launch_token": "TEMPORARY_OPAQUE_TOKEN"
}
```

Student, project, assignment, course, lesson, role, and access information must never be accepted from browser
query parameters. Laravel resolves those values from the launch token.

### Successful response

```json
{
  "success": true,
  "data": {
    "session_ref": "SCR-SESSION-X78KM",
    "expires_at": "2026-08-10T15:00:00Z",
    "workspace_access_token": "SHORT_LIVED_WORKSPACE_TOKEN",
    "student": {
      "display_name": "Adewale"
    },
    "project": {
      "project_ref": "SCR-PROJ-X82AB",
      "title": "Make the Cat Walk",
      "project_type": "lesson",
      "status": "draft"
    },
    "assignment": {
      "assignment_ref": "SCR-ASG-A1B2C3",
      "title": "Make the Cat Walk",
      "instructions": "Use Motion and Control blocks to make the sprite walk."
    },
    "course": {
      "course_ref": "COURSE-001",
      "title": "Introduction to Scratch"
    },
    "lesson": {
      "lesson_ref": "LESSON-004",
      "title": "Motion"
    },
    "launch_type": "existing_lesson",
    "return_to": {
      "type": "lesson",
      "url": "https://aileadkidscode.com/..."
    }
  }
}
```

Supported `launch_type` values are:

- `new_independent`
- `existing_independent`
- `new_lesson`
- `existing_lesson`

Independent project responses may set `assignment`, `course`, and `lesson` to `null`. The `project_type` must be
`lesson` for lesson launch types and `independent` for independent launch types.

### Error response

```json
{
  "success": false,
  "error": {
    "code": "LAUNCH_SESSION_EXPIRED",
    "message": "This workspace session has expired. Return to Kidscode and open the project again."
  }
}
```

Phase 3 recognises these resolver error codes:

- `LAUNCH_SESSION_EXPIRED`
- `INVALID_LAUNCH_SESSION`
- `WORKSPACE_ACCESS_DENIED`

Network failures are transport failures, not successful error payloads. The Workspace displays Connection Lost and
does not create a validated session.

## Token handling requirements

- The temporary launch token is read from `?launch=TOKEN` only.
- The launch token is not logged or written to local or session storage.
- After successful resolution, the Workspace removes the launch parameter with `history.replaceState` and does not
  reload the editor.
- `workspace_access_token` remains in controlled runtime memory only.
- A real resolver failure must never fall back to development fixtures.

## Current implementation boundary (Phase 3 launch)

The Workspace keeps the Phase 3 session and UI architecture unchanged. Exact named development fixtures still use
the development-only resolver; other development tokens use the local Laravel API base. Production always uses the
Laravel resolver and fails closed when `KIDSCODE_WORKSPACE_API_BASE_URL` is missing. The Stage 1 Laravel response is
mapped at this boundary to the existing session shape: the student-only response receives `role: "student"`, and
Laravel's `project_details` return type maps to the existing `projects` destination while preserving its URL.

## Workspace Persistence (Phase 4)

Phase 4 defines the contract between the Workspace and a project persistence adapter. It does not redefine or
change the Phase 3 launch contract above. The adapter is the only thing that differs between development (an
IndexedDB-backed mock) and production (Laravel); the Workspace UI and save/load/autosave logic call the same
adapter interface either way.

### Adapter interface

```text
loadProject({projectRef, workspaceAccessToken, launchType}) -> Promise<LoadResult>
saveProject({projectRef, workspaceAccessToken, sb3, baseVersionRef, reason}) -> Promise<SaveResult>
```

`sb3` is an `ArrayBuffer` — the same shape `vm.loadProject()` accepts and what the Workspace converts
`vm.saveProjectSb3()`'s `Blob` result into before calling `saveProject`. Adapters never inspect, parse, or
reconstruct it; it passes through as an opaque blob of bytes (encoded as `multipart/form-data` for the future HTTP
adapter, described below).

`reason` is:

- `manual` — the student pressed Save.
- `autosave` — the debounced autosave timer fired.

### LoadResult

```json
{
  "project_ref": "SCR-PROJ-X82AB",
  "source": "saved",
  "version_ref": "SCR-VER-001",
  "saved_at": "2026-08-10T18:30:00Z",
  "sb3": "<binary>"
}
```

`source` is one of:

- `saved` — a previously saved project exists; `sb3` is that project and must be loaded before the editor is
  exposed.
- `starter` — no saved project exists, but a lesson starter project applies (`new_lesson` launches); `sb3` is the
  starter project.
- `blank` — no saved project and no starter applies; `sb3` is `null` and the Workspace keeps its own default blank
  project already in the VM.

`version_ref` and `saved_at` are `null` when `source` is `starter` or `blank`.

### SaveResult

```json
{
  "success": true,
  "data": {
    "project_ref": "SCR-PROJ-X82AB",
    "version_ref": "SCR-VER-002",
    "saved_at": "2026-08-10T18:30:00Z",
    "status": "draft"
  }
}
```

The Workspace retains `version_ref` in runtime state and sends it back as `baseVersionRef` on the next save. A
rejected `saveProject` call (network failure, validation failure, or the future `409 PROJECT_VERSION_CONFLICT`) maps
to the Save failed Workspace state; the Workspace does not retry automatically, only on explicit user action.

### Laravel HTTP endpoints (Stage 2, real)

Implemented and deployed at `https://testing.aileadkidscode.com/api` (TEST). The Workspace's Stage 2 adapter
(`createKidscodeProductionPersistenceAdapter`,
`packages/scratch-gui/src/lib/kidscode-workspace-persistence/kidscode-production-persistence-adapter.js`) calls
these directly; nothing about the Workspace-side adapter contract above changed to accommodate them.

**`GET /api/scratch/workspace/projects/{project_ref}/file`**

- Purpose: load the latest authorised project `.sb3`.
- Authentication: `Authorization: Bearer {workspace_access_token}` (the Phase 3 credential seam; a `project_ref`
  alone is never treated as authorisation).
- Successful response (HTTP 200): the raw `.sb3` bytes as the response body (not a JSON envelope). `version_ref`
  and `saved_at` travel as response headers, `X-Scratch-Version-Ref` and `X-Scratch-Saved-At`.
- No saved file yet (HTTP 404): the Workspace treats this the same as the development adapter's unrecorded
  `project_ref` — starter project for a `new_lesson` launch, blank otherwise. This is not an error response.
- Error responses use the same `{success: false, error: {code, message}}` envelope as every other endpoint on this
  API (confirmed live, e.g. `WORKSPACE_TOKEN_INVALID` for a missing/invalid token).

**`POST /api/scratch/workspace/projects/{project_ref}/save`**

- Purpose: persist a new project version.
- Authentication: `Authorization: Bearer {workspace_access_token}`.
- Request format: `multipart/form-data` with fields `project_file`, `base_version_ref` (omitted entirely, not sent
  empty, on a first save with no prior version), `save_reason` (`manual`/`autosave`).
- Successful response: the `SaveResult` JSON shape above.
- Conflict response:

```json
{
  "success": false,
  "error": {
    "code": "PROJECT_VERSION_CONFLICT",
    "message": "A newer version of this project already exists."
  }
}
```

returned as HTTP 409 when `base_version_ref` no longer matches the latest stored version.

### Current implementation boundary (Phase 8 Stage 2 persistence)

Like the Phase 3 launch resolver, the persistence adapter is selected per-session rather than by build mode: the
Workspace routes by the session's own `workspace_access_token`
(`createKidscodeWorkspacePersistenceAdapter`, same file as above). Exact development fixtures (whose token always
has the `DEVELOPMENT_WORKSPACE_TOKEN_` prefix) keep using the isolated local IndexedDB store; any other session —
including a real TEST-server launch opened from a local development build — reaches the real Stage 2 endpoints
above. A production build never constructs the development adapter at all, and a missing
`KIDSCODE_WORKSPACE_API_BASE_URL` fails closed to the unavailable adapter rather than falling back to IndexedDB.

### Development adapter

The development adapter (`createKidscodeDevelopmentPersistenceAdapter`) implements the same interface against a
browser-local, development-only IndexedDB store (`kidscode-workspace-dev-store`), so save/load/autosave and a
close-reopen round trip can be demonstrated before the Laravel API exists. It:

- requires a non-empty `workspaceAccessToken`, matching the future real adapter's requirement for a credential
  (rejecting on a missing token, same as a real unauthorised request would);
- stores only `{project_ref, version_ref, version_number, saved_at, sb3}` — no launch token, workspace access
  token, or student identity;
- models monotonically increasing versions as `SCR-DEV-VER-1`, `SCR-DEV-VER-2`, ...;
- recognises two reserved development `project_ref` fixtures (wired to the `demo-save-failure` and
  `demo-corrupted-project` launch tokens) that always fail a save, or always return unparsable `.sb3` bytes,
  respectively — used only to demonstrate the Save failed and Corrupted Project states, and inert for any other
  `project_ref`.

Like the Phase 3 development launch resolver, this factory throws if constructed with `environment: 'production'`,
and `render-gui.jsx` only ever constructs it when `process.env.NODE_ENV !== 'production'`. Production uses an
adapter that always rejects (`createUnavailableKidscodeWorkspacePersistenceAdapter`) until the Laravel adapter is
implemented — there is no "Laravel failed, fall back to IndexedDB" path.

## Workspace Project Management (Phase 5)

Phase 5 defines the contract between the Workspace and a project-management adapter, covering rename, duplicate,
and delete-draft. It does not redefine or change the Phase 3 launch or Phase 4 persistence contracts above. As with
persistence, the adapter is the only thing that differs between development (the same IndexedDB-backed mock store)
and production (Laravel); the Workspace UI and its controller call the same adapter interface either way.

### Adapter interface

```text
renameProject({projectRef, workspaceAccessToken, title}) -> Promise<RenameResult>
duplicateProject({projectRef, workspaceAccessToken, sb3, title}) -> Promise<DuplicateResult>
deleteDraftProject({projectRef, workspaceAccessToken}) -> Promise<DeleteResult>
```

`sb3` for `duplicateProject` is the same `ArrayBuffer` shape the Phase 4 contract passes to `saveProject` — the
Workspace calls `vm.saveProjectSb3()` immediately before duplicating, so the copy always reflects what is currently
visible in the editor, including unsaved changes, not just the last persisted version.

`title` for `duplicateProject` is the *current confirmed* project title (reflecting any rename already made earlier
in the same session), not the launch-time title. The adapter appends the established " Copy" suffix
(`buildDuplicateProjectTitle`); the Workspace does not attempt conflict-aware naming beyond that.

**`duplicateProject` always creates a new INDEPENDENT draft project, regardless of the original's `project_type`.**
There is no `projectType` request field — the caller cannot choose it, and the adapter does not accept one, so it
cannot be overridden by mistake. A duplicate of a lesson project has no `assignment_ref`/`course_ref`/`lesson_ref`
association, the same as any other independent project: a student must not end up with a second active lesson
project attached to the same assignment. Duplicating an independent project also produces an independent draft, so
this is not a special case — it is the only behaviour `duplicateProject` has.

### RenameResult

```json
{
  "success": true,
  "data": {
    "project_ref": "SCR-PROJ-X82AB",
    "title": "My Walking Cat",
    "updated_at": "2026-08-11T18:30:00Z"
  }
}
```

The title is trimmed of leading/trailing whitespace and rejected if empty or longer than 100 characters
(`KIDSCODE_PROJECT_TITLE_MAX_LENGTH`) — the same limit already enforced by the rename dialog's input. The Workspace
does not update the confirmed, visible title until this call resolves; a rejected `renameProject` call leaves the
previously confirmed title in place and the rename dialog open with a retry available.

### DuplicateResult

```json
{
  "success": true,
  "data": {
    "project_ref": "SCR-PROJ-NEW123",
    "title": "Make the Cat Walk Copy",
    "project_type": "independent",
    "status": "draft",
    "created_at": "2026-08-11T18:30:00Z"
  }
}
```

This example duplicates a *lesson* project ("Make the Cat Walk", the `demo-lesson` fixture) — note `project_type`
is `"independent"` in the result, not `"lesson"`, per the always-independent rule above.

`duplicateProject` always returns a **new** `project_ref` with `project_type: "independent"` and `status: "draft"`,
regardless of the original project's type or status. The current Workspace session's `project_ref` and
`workspace_access_token` are never changed by a duplicate — the Workspace stays open on the original project. The
Phase 3 `workspace_access_token` authorises only the currently launched project; it is not assumed to authorise the
new duplicate. The duplicate becomes reachable through the normal secure-launch flow later (outside Phase 5's
scope), the same as any other project.

### DeleteResult

```json
{
  "success": true,
  "data": {
    "project_ref": "SCR-PROJ-X82AB",
    "deleted": true
  }
}
```

Delete only ever deletes the current *draft*; there is no bulk or cascading delete. Once a delete succeeds, the
Workspace treats the current session as permanently blocked for the rest of that page load: manual Save, autosave,
Rename, and Duplicate all stop, and a blocking "Draft Deleted" state replaces the editor (reusing the same
non-dismissable modal pattern as Session Expired / Corrupted Project). Phase 5 does not implement return navigation
out of that state — that is Phase 7 scope.

### Project status and the conservative Phase 5 restriction rule

`project.status` was defined by the Phase 3 launch response but never enforced anywhere before Phase 5; every
development fixture and adapter response hard-codes `"draft"`, and no other status value appears anywhere in this
repository. In the absence of an established product rule for the other three statuses (`submitted`,
`changes_requested`, `approved`), Phase 5 adopts the conservative rule below, enforced both in the Project menu (so
the controls are greyed out) and again in the development adapter (so a stale/manipulated client cannot bypass it):

| Status | Rename | Duplicate | Delete |
| --- | --- | --- | --- |
| `draft` | allowed | allowed | allowed |
| `submitted` | blocked | allowed | blocked |
| `changes_requested` | blocked | allowed | blocked |
| `approved` | blocked | allowed | blocked |

Duplicate is allowed regardless of status because it only ever creates a new, independent draft copy and never
mutates the original project or its authorisation — there is no security reason to gate it on the original's
status. If Kidscode's product rules turn out to differ (e.g. rename should remain available for
`changes_requested` projects so a student can retitle before resubmitting), that is a product decision for a future
phase to make explicitly, not one Phase 5 has invented.

### Future Laravel HTTP endpoints

These are proposed, not yet implemented, following the same conventions as the Phase 4 endpoints above.

**`PATCH /api/scratch/workspace/projects/{project_ref}`**

- Purpose: rename the current authorised project.
- Authentication: `workspace_access_token`.
- Request: `{"title": "My Walking Cat"}`.
- Successful response: the `RenameResult` JSON shape above.
- Backend must enforce ownership/access and `status === draft` (see the restriction rule above).

**`POST /api/scratch/workspace/projects/{project_ref}/duplicate`**

- Purpose: create a new **independent draft** project from the current project content, regardless of the
  original's `project_type`.
- Authentication: `workspace_access_token`.
- Request format: `multipart/form-data` with field `project_file` (the current `.sb3`), matching the Phase 4 save
  endpoint's encoding of project bytes. There is no `project_type` field — the backend always creates an
  independent draft.
- Successful response: the `DuplicateResult` JSON shape above. The backend allocates the new `project_ref` and must
  not associate it with the original's `assignment_ref`/`course_ref`/`lesson_ref`, if the original had one.

**`DELETE /api/scratch/workspace/projects/{project_ref}`**

- Purpose: delete an authorised **draft** project.
- Authentication: `workspace_access_token`.
- Backend must enforce ownership/access and `status === draft`; any other status returns an error rather than
  deleting.
- Successful response: the `DeleteResult` JSON shape above.

### Development adapter

The development adapter (`createKidscodeDevelopmentProjectManagementAdapter`) implements the same interface against
the **same** browser-local, development-only IndexedDB store the Phase 4 persistence adapter uses
(`kidscode-workspace-dev-store`), rather than a second unrelated store. Records now also carry `title`,
`projectType`, `status`, `createdAt`, `updatedAt`, and (once deleted) `deletedAt`; the store's `putProject` merges a
partial record onto whatever already exists for that `project_ref` so a save from one adapter can never erase
metadata written by the other (e.g. a rename landing while an autosave is in flight). It:

- requires a non-empty `workspaceAccessToken`, exactly like the persistence adapter;
- enforces the status restriction rule above, defaulting an untouched project (no project-management record yet) to
  `draft`, matching every development launch fixture's initial status;
- rejects a second `deleteDraftProject` call against an already-deleted project;
- recognises three reserved development `project_ref` fixtures (wired to the `demo-rename-failure`,
  `demo-duplicate-failure`, and `demo-delete-failure` launch tokens) that always reject their respective action —
  used only to demonstrate the failure/retry UI, and inert for any other `project_ref`;
- never persists the workspace access token, launch token, or any other credential.

The Phase 4 development persistence adapter also checks the shared store's `deletedAt` field on every `loadProject`
and `saveProject` call and rejects if set, as defense in depth alongside the Workspace's own client-side block —
the store is the one place both adapters agree on a project's deletion state.

Like the Phase 3/4 development implementations, this factory throws if constructed with `environment: 'production'`,
and `render-gui.jsx` only ever constructs it when `process.env.NODE_ENV !== 'production'`. Production uses an
adapter that always rejects (`createUnavailableKidscodeWorkspaceProjectManagementAdapter`) until the Laravel adapter
is implemented — there is no "Laravel failed, fall back to IndexedDB" path.

**Development-only title hydration on reopen.** The Phase 3 development launch resolver
(`createDevelopmentMockLaunchResolver`) is a set of static fixtures, so a renamed project would otherwise appear to
"forget" its title every time it is relaunched, even though this store correctly persisted the rename. In
development only, the resolver now reads this same store for the fixture's `project_ref` and overlays the stored
`title` onto the fixture response, without touching or mutating the fixture object itself. This does not make
IndexedDB authoritative and does not change the Phase 3 request/response contract: a real Laravel launch response
remains the sole authority for project title once connected, since a real backend's project row is itself the
source of truth and there is no separate client-side store for it to disagree with. The resolver never runs in
production (`render-gui.jsx` always selects a rejecting resolver there), so this has no production code path at
all.

## Workspace Submission and Tutor Review (Phase 6)

Phase 6 adds a submission/review boundary without changing the Phase 3 launch, Phase 4 persistence, or Phase 5
project-management request shapes. A submission is an immutable `.sb3` snapshot with its own `submission_ref` and
`submitted_version_ref`; project status alone is never sufficient to identify what a tutor reviewed.

### Adapter interface

```text
submitProject({projectRef, workspaceAccessToken, sb3, baseVersionRef}) -> Promise<SubmitResult>
loadSubmission({submissionRef, workspaceAccessToken}) -> Promise<SubmissionFile>
approveSubmission({submissionRef, submittedVersionRef, workspaceAccessToken}) -> Promise<ReviewResult>
requestChanges({submissionRef, submittedVersionRef, workspaceAccessToken, feedback}) -> Promise<ReviewResult>
```

Every operation requires a short-lived Workspace access token. Neither `project_ref` nor `submission_ref` is
authorization by itself. Review actions also require the exact `submittedVersionRef` that was loaded, and the
backend must reject stale/non-latest submissions or submissions that are no longer `submitted`.

`submitProject` receives the bytes returned by `vm.saveProjectSb3()` at click time, including unsaved editor
changes. `baseVersionRef` is the latest Phase 4 working-project version known to the Workspace and provides the
same optimistic-concurrency protection as Save. A successful submit atomically creates a new immutable submission
and advances the separate working project to the same bytes under a new working `version_ref`; resubmit never
updates or replaces an older submission record. This guarantees that a later changes-requested reopen starts from
what the student actually submitted, even when the edit was unsaved before Submit.

### Status and mutation rules

The product statuses are `draft`, `submitted`, `changes_requested`, and `approved`.

| Context/status | Save/autosave | Submit | Rename | Duplicate | Delete |
| --- | --- | --- | --- | --- | --- |
| Student `draft` | allowed | Submit | allowed | allowed | allowed |
| Student `submitted` | blocked | blocked | blocked | allowed | blocked |
| Student `changes_requested` | allowed | Resubmit | blocked | allowed | blocked |
| Student `approved` | blocked | blocked | blocked | allowed | blocked |
| Tutor review mode | blocked | hidden | blocked | blocked | blocked |

The student `submitted` rule is conservative: editor gestures may remain inspectable in the current page, but
manual Save, autosave, and another submit cannot persist or replace anything until a review result arrives.
`changes_requested` re-enables working-project Save/autosave and creates a new immutable version on Resubmit.
Phase 5's always-independent Duplicate rule remains available to students, but every project-management mutation is
blocked in tutor review mode.

### SubmitResult

```json
{
  "success": true,
  "data": {
    "project_ref": "SCR-PROJ-X82AB",
    "submission_ref": "SCR-SUB-ABC123",
    "submitted_version_ref": "SCR-SUB-VER-ABC123",
    "working_version_ref": "SCR-VER-DEF456",
    "submitted_at": "2026-08-11T18:30:00Z",
    "status": "submitted"
  }
}
```

### SubmissionFile

The file operation returns the exact submitted `.sb3` plus authoritative submission metadata to the adapter. The
Workspace verifies all three identifiers against its review launch context before loading the bytes into the VM:

```text
project_ref
submission_ref
submitted_version_ref
submitted_at
status
feedback
sb3
```

Missing, inaccessible, mismatched, or corrupted submitted content blocks review. The Workspace must never fall
back to the latest working-project file.

### ReviewResult

```json
{
  "success": true,
  "data": {
    "project_ref": "SCR-PROJ-X82AB",
    "submission_ref": "SCR-SUB-ABC123",
    "submitted_version_ref": "SCR-SUB-VER-ABC123",
    "status": "changes_requested",
    "feedback": "Please add a second step.",
    "reviewed_at": "2026-08-11T18:45:00Z"
  }
}
```

Approval uses the same shape with `status: "approved"` and `feedback: null`. Request Changes requires feedback
after whitespace trimming. Review history is append-only; the latest feedback is also exposed through the next
student launch response as `review_feedback`.

### Review launch contract

Phase 3's four student launch types remain unchanged. Phase 6 adds `launch_type: "review"`, requires
`role: "tutor"`, and requires this additional exact-version context in the successful launch response:

```json
{
  "review": {
    "submission_ref": "SCR-SUB-ABC123",
    "submitted_version_ref": "SCR-SUB-VER-ABC123",
    "submitted_at": "2026-08-11T18:30:00Z"
  }
}
```

Student launch responses include `role: "student"`. For `changes_requested`, `review_feedback` contains
`submission_ref`, `submitted_version_ref`, `feedback`, and `reviewed_at`. Tokens remain runtime-only and are never
part of a project or submission record.

### Future Laravel HTTP endpoints

**`POST /api/scratch/workspace/projects/{project_ref}/submit`**

- Authentication: `workspace_access_token`.
- Request: `multipart/form-data` fields `project_file` and `base_version_ref`.
- Successful response: `SubmitResult` above.
- Backend creates a new immutable submission/version, advances the mutable working copy and its version to the
  submitted bytes, and moves the project to `submitted` in one transaction.

**`GET /api/scratch/workspace/submissions/{submission_ref}/file`**

- Authentication: a short-lived tutor/review Workspace access token.
- Returns the exact authorized submitted `.sb3` and authoritative submission metadata.

**`POST /api/scratch/workspace/submissions/{submission_ref}/approve`**

- Authentication: a short-lived tutor/review Workspace access token.
- Request includes `submitted_version_ref` so the backend can reject a stale review.
- Successful result has `status: "approved"`.

**`POST /api/scratch/workspace/submissions/{submission_ref}/request-changes`**

- Authentication: a short-lived tutor/review Workspace access token.
- Request: `{"submitted_version_ref": "SCR-SUB-VER-ABC123", "feedback": "Please add a second step."}`.
- Successful result has `status: "changes_requested"` and persists both feedback and review history.

If Laravel conventions require different HTTP shapes, update this contract before changing the Workspace adapter.

### Development adapter and fixtures

`createKidscodeDevelopmentSubmissionReviewAdapter` implements the same four operations in the existing
development-only IndexedDB database. Submission creation uses one transaction spanning the separate `projects` and
`submissions` stores: `add` creates the immutable submission while the working record receives copied submitted
bytes and its next `SCR-DEV-VER-*` identity. An existing `submission_ref` cannot be overwritten, and a stale
Save/autosave version cannot overwrite a successful Submit. Stored binary buffers are copied on submit and load.
Project metadata retains `latestSubmissionRef`, the submission counter, current status, and latest review feedback;
each submission retains its identity, bytes, status, feedback, review timestamp, and append-only review history.

Development launch fixtures cover student submit failure, submitted/changes-requested/approved student states,
exact/latest tutor review, unavailable and corrupted submitted files, review access denial, approve failure, and
request-changes failure. Fixture selection stays inside the development launch/submission adapters.

The development factory throws in production. Production selects
`createUnavailableKidscodeWorkspaceSubmissionReviewAdapter`, whose four operations always reject. There is no
real-API-failure-to-IndexedDB fallback.

## Workspace Navigation and Recovery (Phase 7)

Phase 7 defines how the Workspace safely returns a Student or Tutor to Kidscode, and how it recovers from Session
Expired, Project Deleted, and other blocking states. It does not add any new backend endpoint: navigation is driven
entirely by the `return_to` the Phase 3 launch response already returns, validated client-side before use. It does
not change the Phase 3/4/5/6 request/response shapes above, with one narrow addition: `return_to.type` is now a
restricted enum instead of an arbitrary string.

### `return_to.type`

```text
lesson | projects | review
```

- `lesson` / `projects` — unchanged from Phase 3: a student launch's destination, chosen by `project.project_type`
  (`lesson` → `lesson`, `independent` → `projects`).
- `review` — new in Phase 7. Every `launch_type: "review"` (tutor) response now returns
  `return_to: {type: "review", url: "..."}` pointing at the tutor's own submissions/review queue, regardless of the
  underlying project's `project_type`. Before Phase 7, a review launch's `return_to` incorrectly reused the
  student-facing `lesson`/`projects` destination; Phase 7 corrects this because a tutor must never be offered a
  "Return to Lesson" or "Return to My Scratch Projects" control.
- The Workspace rejects a launch response whose `return_to.type` is anything else (`INVALID_LAUNCH_RESPONSE`) before
  a session is ever exposed to the editor. This is a client-side hardening beyond what Phase 3 originally validated;
  it does not require a backend change since Laravel is expected to only ever send one of these three values.

Backend must never send `type: "recovery"` — that value is Workspace-internal only (see below) and is rejected by
the same validation.

### Return destination validation

The Workspace never trusts a destination merely because some payload contained a string, and never reads a
destination from browser query parameters (`?return=`, `?lessonUrl=`, `?redirect=`, or similar are always ignored).
The only trusted sources are `session.return_to` (from the validated launch response above) and the injected
recovery URL described below. Every destination — whichever source it came from — passes through one client-side
validator (`validateKidscodeReturnDestination`, `packages/scratch-gui/src/lib/kidscode-workspace-navigation/`)
before any navigation happens:

- A same-origin, path-only URL (e.g. `/lessons`) is always safe and always allowed.
- An absolute `http(s)://` URL is allowed only if its origin is in an environment-configured allowlist; production
  has no configured origin yet (empty allowlist, so no absolute URL is currently accepted there), matching the rest
  of the Laravel integration still being outstanding. This allowlist is expected to be populated in Phase 8 once a
  real Kidscode frontend origin exists.
- `javascript:`, `data:`, protocol-relative (`//host/...`), and any other unrecognised shape are always rejected.

A destination that fails validation is silently not navigated to (fail closed) rather than falling back to any
guessed URL.

### Recovery destination (no session)

Session Expired (and any other state reached before a session is resolved) has no `session.return_to` to use. The
Workspace instead uses a separately injected/configured recovery URL (`kidscodeWorkspaceRecoveryUrl`, wired in
`playground/render-gui.jsx`) through the same validator above. Production defaults this to `null` until Phase 8
configures a real one, so Session Expired recovery remains a dead end (button present, fail-closed) rather than a
guess, exactly like the origin allowlist above. Development uses an explicit, clearly local-only value.

This recovery URL is a Workspace-side configuration value, not part of the launch response — it exists precisely
for the case where no launch response was ever successfully resolved.
