# Shared API Contract

This document is the repository source of truth for the API boundary shared by the Kidscode Scratch Workspace and
the Kidscode Laravel application. Phase 3 defines only the secure Workspace launch contract. It does not define
save, load, rename, duplicate, delete, submission, or review APIs.

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

## Current implementation boundary

Phase 3 uses a development-only resolver with the same request/result boundary. The Laravel integration will replace
the resolver implementation, not the Workspace session or UI architecture. The production playground currently
returns a connection failure until the Laravel resolver is configured.
