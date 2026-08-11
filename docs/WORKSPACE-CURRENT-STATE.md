# Kidscode Scratch Workspace — Current State

This is the **living handoff document**. Update it after every merged Workspace phase — see "Update rule" at the
bottom. It is not a historical changelog; keep it describing only the current state.

## Repository state

- Verified main HEAD before Phase 6 branch: `6f494856f8b1c199e683cc51a190f062dec58be1`
- Active feature branch: `phase6/submission-tutor-review`
- Current completed phases on main: 1–5
- Phase 6 state: implemented and verified on the feature branch; uncommitted, unmerged, awaiting human review

## Phase status

| Phase | Name | Status |
| --- | --- | --- |
| 1 | Workspace Foundation | COMPLETE |
| 2 | Kidscode Workspace Interface | COMPLETE |
| 3 | Secure Launch / Project Context | COMPLETE |
| 4 | Save / Load / Continue / Autosave | COMPLETE |
| 5 | Project Management | COMPLETE |
| 6 | Submission + Tutor Review | READY FOR HUMAN REVIEW (FEATURE BRANCH) |
| 7 | Navigation / Recovery | NOT STARTED |
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

**Phase 6 feature branch** — Submit/Resubmit captures the current editor `.sb3`, including unsaved changes, into
new immutable submitted-version records and atomically advances the separate working copy to the same bytes/new
working version so changes-requested reopen cannot lose the submitted edit; visible `submitted`,
`changes_requested`, and `approved` states; persisted
tutor feedback/history; tutor `review` launch loads only the exact submitted version and allows Scratch
inspection/run/stop while blocking Save/autosave, student Submit, and all project-management mutations; review
actions require the exact latest submitted-version identity. Submitted/approved student saves are blocked;
changes-requested working projects can Save/autosave and Resubmit. Development fixtures cover success and required
failure paths; production fails closed.

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
- **Phase 6**: Laravel submit, exact submitted-file load, approve, and request-changes adapter/endpoints, including
  immutable version storage, authorization, concurrency, and review-history enforcement.

None of these endpoints exists yet. The full proposed request/response shapes are in
`docs/SHARED-API-CONTRACT.md`.

## Next Workspace action

Human review and closure of Phase 6 on `phase6/submission-tutor-review`. Phase 7 has not started and must not begin
as part of this feature branch.

## Update rule

After every merged Workspace phase, update this file:

- main HEAD
- phase status table
- "What works now"
- "Current architecture" (only if it changed)
- "Backend integration still missing"
- "Next Workspace action"

Keep this file a snapshot of *now*, not a log of how it got here. After Phase 6 is eventually committed and merged,
replace the pre-branch main HEAD and feature-branch wording with the resulting main HEAD and merged status.
