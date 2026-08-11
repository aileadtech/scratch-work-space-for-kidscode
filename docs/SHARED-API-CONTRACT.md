# Shared API Contract

This document is the repository source of truth for the API boundary shared by the Kidscode Scratch Workspace and
the Kidscode Laravel application. Phase 3 defines the secure Workspace launch contract. Phase 4 adds the Workspace
persistence (save/load/autosave) contract. Neither defines rename, duplicate, delete, submission, or review APIs.

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
