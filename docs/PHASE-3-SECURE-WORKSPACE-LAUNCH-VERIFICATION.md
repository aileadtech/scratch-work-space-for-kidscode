# Workspace Phase 3: Secure Workspace Launch Verification

## Result

**PASS** — the Workspace resolves development launch tokens into one validated in-memory session, displays the
resolved project/student context in the existing Phase 2 UI, removes successful temporary tokens from the visible
URL, and blocks normal access for unresolved, expired, invalid, or denied launches.

Phase 4 was not started.

## Objective

Phase 3 makes the Scratch Workspace understand which student and project opened it, whether the project is a lesson
or independent project, whether launch resolution succeeded, and which loading or error state to display. The real
Laravel endpoint is not yet connected.

## Architecture

```text
Browser ?launch= token
        |
        v
Launch token reader
        |
        v
Injected launch resolver
        |
        v
Shared response validation
        |
        v
KidscodeWorkspaceSessionProvider (runtime memory)
        |
        v
Existing Scratch title reducer + Phase 2 Kidscode UI
```

The resolver and response validation are isolated in `kidscode-workspace-launch.js`. The launch HOC owns the async
transition from loading to either a validated session or a blocking state. UI components do not read tokens, call
network code, or contain fixture conditions.

## Development mock resolver

The Phase 3 playground injects `createDevelopmentMockLaunchResolver()` only when `NODE_ENV` is not `production`.
The factory throws if asked to run in production. The production playground uses an unavailable resolver that fails
closed as Connection Lost; there is no “real API failed, use mock” path.

Deterministic fixtures:

| Token | Result |
| --- | --- |
| `demo-lesson` | Adewale / Make the Cat Walk / `existing_lesson` |
| `demo-independent` | Adewale / My Space Animation / `existing_independent` |
| `demo-new-lesson` | Adewale / Animate Your Name / `new_lesson` |
| `demo-new-independent` | Adewale / Untitled Scratch Project / `new_independent` |
| `demo-expired` | `LAUNCH_SESSION_EXPIRED` |
| `demo-invalid` | `INVALID_LAUNCH_SESSION` |
| `demo-denied` | `WORKSPACE_ACCESS_DENIED` |
| `demo-offline` | Resolver/transport rejection |

The shared API request/response shape is documented in `docs/SHARED-API-CONTRACT.md`.

## Central Workspace session

`KidscodeWorkspaceSessionProvider` exposes exactly one validated session object containing:

- `session_ref`
- `expires_at`
- `workspace_access_token`
- `student`
- `project`
- `assignment`
- `course`
- `lesson`
- `launch_type`
- `return_to`

Independent sessions preserve `null` assignment, course, and lesson values. The existing Scratch project-title state
receives the validated project title, and the existing Kidscode student indicator receives the validated display
name. No duplicate project-title input was added.

## Visible behaviour

- Resolving: full blocking Scratch loader with **Loading Project**.
- Successful lesson: **Make the Cat Walk** and **Adewale**, then the normal editor.
- Successful independent project: **My Space Animation** and **Adewale**, then the normal editor.
- Expired: blocking **Session Expired** dialog.
- Resolver/network failure: blocking **Connection Lost** dialog with **Try again**.
- Invalid, denied, missing token, unsupported type, or malformed response: non-dismissible **Workspace Access Blocked**
  dialog.

The error states do not expose a validated session. The modal overlay prevents normal editor access while an initial
launch is invalid.

## Token security

- Only `launch` is read as launch authority from the query string.
- Student, project, course, lesson, assignment, and role query values are ignored.
- The former development `workspaceState` query override was removed.
- Successful launch uses `history.replaceState` to remove only `launch`, preserving unrelated query values and the
  fragment without reloading.
- Temporary launch tokens are not logged or persisted.
- `workspace_access_token` exists only in the resolver fixture and in-memory validated session.
- Failure does not remove the launch token, allowing a connection retry without persistence.

## Testing performed

### Automated focused tests

Command:

```text
npx jest --runInBand --runTestsByPath \
  test/unit/components/menu-bar.test.jsx \
  test/unit/components/kidscode-project-controls.test.jsx \
  test/unit/components/kidscode-workspace-state.test.jsx \
  test/unit/util/kidscode-workspace-launch.test.js \
  test/unit/util/kidscode-workspace-launch-hoc.test.jsx
```

Result: **5 suites passed, 47 tests passed**.

Coverage includes lesson/independent success, null independent context, new launch types, expired/invalid/denied
errors, offline failure, unsupported launch types, missing tokens, URL cleanup, loading-to-ready transition, central
context exposure, and the production mock guard.

Targeted ESLint completed with zero errors. The repository currently reports conflicting legacy `arrow-parens`
warnings alongside the enforced stylistic rule; no new lint error remains.

### Build

The package `build:dev` npm script uses POSIX environment syntax and cannot run directly in Windows PowerShell.
Running its Windows-equivalent command (`BUILD_TYPE=dev` environment plus `npx webpack`) compiled successfully.

### Broader test-runner note

Appending Windows paths to the package `test:unit` script creates an invalid combined Jest regex, causing Jest to run
all test categories. That attempted broad run reached 53 passing suites but failed browser/integration suites because
ChromeDriver is not installed. This is an existing local test-infrastructure limitation; the focused unit suites and
in-app browser verification are authoritative for this phase.

## Phase 1/2 regression result

**PASS** through focused unit and browser checks:

- Kidscode branding, File, Edit, Project, Settings, Save, Submit, project title, and student indicator remain visible.
- Share, See Project Page, and Backpack remain absent.
- The existing Code and Costumes tabs remain interactive.
- Save and Submit callbacks still do not show fake Saved or Submitted success.
- The existing viewport guard remains active.

## Responsive and browser verification

The compiled app was served locally at `http://localhost:8601/` and checked in the in-app browser.

| Viewport | Result |
| --- | --- |
| 1440×900 | PASS — editor and all Kidscode launch context/controls visible; no horizontal overflow |
| 1366×768 | PASS — editor and all Kidscode launch context/controls visible; no horizontal overflow |
| 1280×800 | PASS — editor and all Kidscode launch context/controls visible; no horizontal overflow |
| 1024×768 | PASS — editor and all Kidscode launch context/controls visible; no horizontal overflow |
| 1023×768 | PASS — existing Screen too small restriction visible |

Browser checks confirmed the loading state before resolution, both dynamic successful project contexts, all requested
blocking states, editor availability after success, and launch-token removal from successful URLs.

## Final diff and security review

**PASS** — every changed file was inspected. `git diff --check` and a separate trailing-whitespace scan covering
untracked files completed cleanly. The review found:

- no launch-token logging;
- no `localStorage` or `sessionStorage` use;
- no workspace-token persistence;
- no `console.log`, `console.info`, or `debugger` statements;
- no real-resolver-to-mock fallback;
- no hardcoded Laravel server URL in runtime code;
- no package, dependency, license, trademark, VM, renderer, storage, blocks, or paint changes; and
- no generated build, declaration, test-result, screenshot, or server-log artifacts left in the worktree.

The URL occurrences are the pre-existing Scratch logo destination, the documented shared endpoint/example, local
test inputs, and meeting demo URLs.

## Meeting demo URLs

- `http://localhost:8601/?launch=demo-lesson`
- `http://localhost:8601/?launch=demo-independent`
- `http://localhost:8601/?launch=demo-expired`
- `http://localhost:8601/?launch=demo-offline`
- `http://localhost:8601/?launch=demo-invalid`

Additional fixtures:

- `http://localhost:8601/?launch=demo-new-lesson`
- `http://localhost:8601/?launch=demo-new-independent`
- `http://localhost:8601/?launch=demo-denied`

## Files changed

- `packages/scratch-gui/src/components/kidscode-menu-bar/kidscode-workspace-state.jsx`
- `packages/scratch-gui/src/contexts/kidscode-workspace-session-context.jsx`
- `packages/scratch-gui/src/lib/kidscode-workspace-launch-hoc.jsx`
- `packages/scratch-gui/src/lib/kidscode-workspace-launch.js`
- `packages/scratch-gui/src/lib/kidscode-workspace-state.js`
- `packages/scratch-gui/src/playground/render-gui.jsx`
- `packages/scratch-gui/test/unit/components/kidscode-workspace-state.test.jsx`
- `packages/scratch-gui/test/unit/util/kidscode-workspace-launch-hoc.test.jsx`
- `packages/scratch-gui/test/unit/util/kidscode-workspace-launch.test.js`
- `docs/SHARED-API-CONTRACT.md`
- `docs/PHASE-3-SECURE-WORKSPACE-LAUNCH-VERIFICATION.md`

No package/dependency files or protected Scratch VM, render, storage, blocks, or paint areas changed.

## Remaining Laravel integration

The Laravel application must implement `POST /api/scratch/workspace/launch/resolve` using the shared contract. The
development resolver injection must then be replaced by a real resolver implementation with environment/configured
endpoint handling and its own integration tests. A real transport failure must continue to fail closed and must not
invoke development fixtures.

No `.sb3` server save/load, autosave, version storage, rename/duplicate/delete API, submission, or tutor review work
was implemented. Phase 4 was not started.
