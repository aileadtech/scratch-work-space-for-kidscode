# Kidscode Scratch Workspace — Current State

This is the **living handoff document**. Update it after every merged Workspace phase — see "Update rule" at the
bottom. It is not a historical changelog; keep it describing only the current state.

## Repository state

- Current main HEAD: `9ade0e701924d4c5fe3ae862b32609832b44ddf4`
- Current completed phases on main: 1–7
- Next Workspace phase: Phase 8 — Production / Compliance

## Phase status

| Phase | Name | Status |
| --- | --- | --- |
| 1 | Workspace Foundation | COMPLETE |
| 2 | Kidscode Workspace Interface | COMPLETE |
| 3 | Secure Launch / Project Context | COMPLETE |
| 4 | Save / Load / Continue / Autosave | COMPLETE |
| 5 | Project Management | COMPLETE |
| 6 | Submission + Tutor Review | COMPLETE |
| 7 | Navigation + Recovery | COMPLETE |
| 8 | Production / Compliance | NOT STARTED / NEXT |
| 9 | Final Verification | NOT STARTED |

## What works now

**Phase 1** — Scratch editor foundation; supported-viewport guard (sub-1024 width restricted).

**Phase 2** — Kidscode branding; Project menu controls; Save/Submit surfaces; project title and student display;
Share / See Project Page / Backpack removed from the Kidscode UI.

**Phase 3** — one-time `?launch=` token; injected launch-resolver abstraction; runtime-only Workspace session;
resolved role/student/project context; loading and fail-closed error states; development fixtures; production has no
mock fallback.

**Phase 4** — real `.sb3` serialization/load through the official VM exporter/importer; manual Save; debounced
autosave with concurrency/stale-edit protection; development-only IndexedDB persistence; close/reopen restore;
optimistic `version_ref`; starter/blank/corrupted-project handling; production fails closed.

**Phase 5** — adapter-confirmed Rename; Duplicate of current editor state as an independent draft; Delete Draft
with permanent session blocking; shared development store and development-only title hydration; production fails
closed.

**Phase 6** — Submit captures the current Scratch editor state, including unsaved changes, into an immutable
submission snapshot and safely advances the separate working project to the submitted state; visible Submitted,
Changes Requested, and Approved states; Tutor Review Mode loads the exact submitted `.sb3` while blocking
Save/autosave and student-project mutations; Approve and Request Changes with feedback; correction and Resubmit
create a new immutable submission while previous versions remain unchanged; submission/review history is retained;
autosave/Submit concurrency is protected.

**Phase 7** — Kidscode Workspace Navigation Controller validates every Return/recovery destination (an isolated
Return Destination Validator + injected Navigation Transport, `src/lib/kidscode-workspace-navigation/`) before
navigating; the Project menu shows exactly one Return item matching the session's own `return_to.type`
(`lesson`/`projects`/`review`, the last new in Phase 7 for tutor review launches); Return to Lesson, Return to My
Scratch Projects, Return to Tutor Review, and the existing Back to Kidscode button all resolve to that one
validated destination. Unsaved/Saving/Save-failed content opens a Save-and-Leave confirmation (reusing the Phase 4
manual-save mechanism, never a second save path) instead of navigating immediately; a real browser
`beforeunload` warning is enabled only for those same three states and never in Tutor Review Mode. Session Expired,
Project Deleted, Corrupted Project, Review Access Blocked, and Corrupted Submission blocking states now have a
working "Return to Kidscode"/"Return to My Scratch Projects" recovery action; Session Expired uses a separately
injected/configured recovery URL (no session exists yet at that point) while the other four use the current
session's own `return_to`. Invalid/denied launches remain blocked with no action, by design (no trusted
destination exists). All of this runs through the same destination validator, which accepts only same-origin
relative paths or explicitly allowlisted absolute origins and rejects `javascript:`/`data:`/protocol-relative
URLs; the browser URL's own query parameters are never read for a destination.

## Current architecture

```text
KidscodeWorkspaceLaunchHOC
  └─ compose(
       AppStateHOC,
       HashParserHOC,
       KidscodeWorkspaceProjectManagementHOC,
       KidscodeWorkspaceSubmissionReviewHOC,
       KidscodeWorkspacePersistenceHOC,
       KidscodeWorkspaceNavigationHOC
     )(GUI)
```

Launch owns the immutable session and review context. Project Management wraps Submission Review so review mode can
block every metadata mutation. Submission Review sits outside Persistence so it can capture the VM's current
`.sb3`, receive the latest working `version_ref`, set lifecycle/read-only state, and load an exact review snapshot
without allowing Persistence to load or write the working project. Navigation is innermost, wrapping GUI directly,
so it receives Persistence's fully resolved `kidscodeWorkspaceState` and additionally re-derives the same
`resolveKidscodeWorkspaceState` result menu-bar.jsx displays (Redux's `projectChanged`/`isUpdating`) — Persistence's
own state is never actually `unsaved`, so Navigation needs that same resolution to make correct Save-and-Leave
decisions. Navigation exposes its Save-and-Leave confirmation state/handlers as props rather than rendering the
dialog itself, since `<IntlProvider>` lives inside GUI's own render tree; `components/gui/gui.jsx` renders the
dialog the same way it already renders `KidscodeWorkspaceBlockingState`.

**Development adapters** (all environment-guarded and throwing if constructed for production):

- mock launch resolver (`createDevelopmentMockLaunchResolver`)
- IndexedDB persistence adapter (`createKidscodeDevelopmentPersistenceAdapter`)
- IndexedDB project-management adapter (`createKidscodeDevelopmentProjectManagementAdapter`)
- IndexedDB submission/review adapter (`createKidscodeDevelopmentSubmissionReviewAdapter`)

All development adapters share `kidscode-workspace-dev-store`. Working projects and submissions use separate object
stores; Submit updates them atomically while submissions remain immutable. Version-checked working saves prevent a
stale autosave from overwriting a successful Submit. Production selects rejecting unavailable adapters and never
falls back to development data.

## Current sources of truth

- **Launch/session data**: `KidscodeWorkspaceSessionProvider`, set once per resolved launch and kept in memory.
- **Visible current project title**: existing Scratch `state.scratchGui.projectTitle`, seeded from launch and updated
  only after Rename succeeds.
- **Working project content/version**: Phase 4 persistence adapter; development uses the `projects` IndexedDB store.
- **Submission identity/content/history**: Phase 6 submission adapter; development uses the separate `submissions`
  store plus `latestSubmissionRef` on project metadata.
- **Lifecycle status/latest feedback**: launch response on reopen, then Phase 6 controller state after an action.
- **Return/recovery destination**: `session.return_to` (validated launch response) for every Return control and
  four of the five recovery states; a separately injected/configured recovery URL for Session Expired only, since
  no session exists yet at that point. Both pass through the Phase 7 destination validator before use.
- **API shapes**: `docs/SHARED-API-CONTRACT.md`.

## Security invariants

- Launch tokens are temporary, single-use, and removed from the URL after successful resolution.
- Student and tutor Workspace access tokens live in runtime memory only.
- No token, auth credential, or student identity is written to IndexedDB, `localStorage`, or `sessionStorage`.
- `project_ref` and `submission_ref` are identifiers, never authorization; every adapter operation requires a token.
- Review actions require the exact `submitted_version_ref` currently being reviewed and reject stale/non-latest
  submissions.
- Tutor review cannot Save/autosave or mutate student project metadata, and missing/corrupted review content never
  falls back to a working project.
- Development adapter factories reject production construction; production uses only unavailable adapters.
- Navigation never reads a destination from the browser URL's query parameters, only from `session.return_to` or
  the injected recovery URL; both are validated (same-origin relative path, or an explicitly allowlisted absolute
  origin) before any navigation happens. Production has no configured recovery URL or allowed absolute origin yet,
  so it stays fail-closed rather than guessing one — Phase 8's responsibility.

## Backend integration still missing

- **Phase 3**: Laravel launch resolver, now including `role`, `review`, `review_feedback`, and a `return_to.type`
  restricted to `lesson`/`projects`/`review` where applicable.
- **Phase 4**: Laravel working-project file load/save adapter.
- **Phase 5**: Laravel rename/duplicate/delete adapter.
- **Phase 6**: Laravel Submit endpoint/adapter; exact submitted-file load for review; Tutor review
  authorization/session; Approve; Request Changes/feedback; immutable submission/version/history persistence.
- **Phase 7**: no new endpoint — navigation is client-side only, driven by the existing launch response. Phase 8
  must configure the real Kidscode recovery URL and allowed absolute-origin allowlist (both currently empty/`null`
  in production).

None of these endpoints exists yet. The full proposed request/response shapes are in
`docs/SHARED-API-CONTRACT.md`.

## Next Workspace phase

Phase 8 — Production / Compliance. Not started.

## Update rule

After every merged Workspace phase, update this file:

- main HEAD
- phase status table
- "What works now"
- "Current architecture" (only if it changed)
- "Backend integration still missing"
- "Next Workspace phase"

Keep this file a snapshot of *now*, not a log of how it got here.
