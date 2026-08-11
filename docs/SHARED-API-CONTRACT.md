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

Phase 3 uses a development-only resolver with the same request/result boundary. The Laravel integration will replace
the resolver implementation, not the Workspace session or UI architecture. The production playground currently
returns a connection failure until the Laravel resolver is configured.

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

### Future Laravel HTTP endpoints

These are proposed, not yet implemented. The Workspace-side adapter contract above is written so a Laravel adapter
can implement it without any change to the Workspace itself.

**`GET /api/scratch/workspace/projects/{project_ref}/file`**

- Purpose: load the latest authorised project `.sb3`.
- Authentication: `workspace_access_token` (the Phase 3 credential seam; a `project_ref` alone is never treated as
  authorisation).
- Successful response: binary `.sb3` content plus `version_ref`/`saved_at` metadata (e.g. as response headers or a
  wrapping envelope — left to the Laravel implementation, since the Workspace only needs bytes plus those two
  fields).

**`POST /api/scratch/workspace/projects/{project_ref}/save`**

- Purpose: persist a new project version.
- Authentication: `workspace_access_token`.
- Request format: `multipart/form-data` with fields `project_file`, `base_version_ref`, `save_reason`
  (`manual`/`autosave`).
- Successful response: the `SaveResult` JSON shape above.
- Conflict response (future):

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
