# Kidscode Scratch Workspace — Current State

This is the **living handoff document**. Update it after every merged Workspace phase — see "Update rule" at the
bottom. It is not a historical changelog; keep it describing only the current state.

## Repository state

- Current main HEAD: `ec8ddaca657aa53a0d76d53fba58c2ee2fb7a6b8`
- Current completed phases on main: 1–6
- Next Workspace phase: Phase 7 — Navigation + Recovery

## Phase status

| Phase | Name | Status |
| --- | --- | --- |
| 1 | Workspace Foundation | COMPLETE |
| 2 | Kidscode Workspace Interface | COMPLETE |
| 3 | Secure Launch / Project Context | COMPLETE |
| 4 | Save / Load / Continue / Autosave | COMPLETE |
| 5 | Project Management | COMPLETE |
| 6 | Submission + Tutor Review | COMPLETE |
| 7 | Navigation + Recovery | NOT STARTED / NEXT |
| 8 | Production / Compliance | NOT STARTED |
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

## Current architecture

```text
KidscodeWorkspaceLaunchHOC
  └─ compose(
       AppStateHOC,
       HashParserHOC,
       KidscodeWorkspaceProjectManagementHOC,
       KidscodeWorkspaceSubmissionReviewHOC,
       KidscodeWorkspacePersistenceHOC
     )(GUI)
```

Launch owns the immutable session and review context. Project Management wraps Submission Review so review mode can
block every metadata mutation. Submission Review sits outside Persistence so it can capture the VM's current
`.sb3`, receive the latest working `version_ref`, set lifecycle/read-only state, and load an exact review snapshot
without allowing Persistence to load or write the working project.

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

## Backend integration still missing

- **Phase 3**: Laravel launch resolver, now including `role`, `review`, and `review_feedback` where applicable.
- **Phase 4**: Laravel working-project file load/save adapter.
- **Phase 5**: Laravel rename/duplicate/delete adapter.
- **Phase 6**: Laravel Submit endpoint/adapter; exact submitted-file load for review; Tutor review
  authorization/session; Approve; Request Changes/feedback; immutable submission/version/history persistence.

None of these endpoints exists yet. The full proposed request/response shapes are in
`docs/SHARED-API-CONTRACT.md`.

## Next Workspace phase

Phase 7 — Navigation + Recovery. Not started.

## Update rule

After every merged Workspace phase, update this file:

- main HEAD
- phase status table
- "What works now"
- "Current architecture" (only if it changed)
- "Backend integration still missing"
- "Next Workspace phase"

Keep this file a snapshot of *now*, not a log of how it got here.
