# Phase 8A — Real Stage 1 Integration Verification

## Scope and branch

- Branch: `phase8/real-stage1-integration`
- Base: clean `main` at `33ac2650093b859935db8c4445046987ea1897a7`
- Scope: Laravel Stage 1 launch resolution only. Stage 2+ adapters were not started.

## API base configuration

`KIDSCODE_WORKSPACE_API_BASE_URL` is the single build-time API-base setting. Development defaults to
`http://127.0.0.1:8000/api`. Production has no default and uses the existing unavailable resolver when the setting
is absent, so it fails closed rather than using localhost or a fixture.

In development, the existing named `demo-*` launch fixtures still resolve locally. Any other opaque launch token
uses the real Laravel resolver. Production always uses the real resolver and never selects a development fixture.

## Resolver mapping

The resolver posts to `/scratch/workspace/launch/resolve` with a JSON body containing only `launch_token`. It
returns Laravel error envelopes unchanged. On a Stage 1 success it maps the student-only Laravel response into the
existing Workspace session shape by adding `role: "student"` when Laravel omits `role`. Laravel API 10 can also
produce `return_to.type: "project_details"`; the resolver maps that type to the existing Workspace `projects`
destination while retaining Laravel's exact return URL.

The existing launch HOC still validates the mapped result, removes `?launch=` only after a successful resolution,
and maps expired, invalid, denied, and transport failures to the existing blocking states.

## Security

- The request uses `credentials: "omit"` and sends no Sanctum token, cookie, or Authorization header.
- Neither the one-time launch token nor `workspace_access_token` is logged or persisted.
- `workspace_access_token` remains only in the existing React session context at runtime.
- Production has no mock or localhost fallback.

## CORS result

PASS. The TEST server allows `Origin: http://localhost:8601`. The real browser request completed without a CORS or
Access-Control error. No browser security bypass and no Laravel change was made from this repository.

## Focused tests

Command:

```text
npx jest test/unit/util/kidscode-production-launch-resolver.test.js test/unit/util/kidscode-workspace-launch.test.js test/unit/util/kidscode-workspace-launch-hoc.test.jsx --runInBand
```

Result: 3 suites passed, 43 tests passed. Jest also reported the repository's existing duplicate manual-mock and
stale Browserslist-data warnings; neither affected the result.

Targeted ESLint over the six changed JavaScript files exited successfully with zero errors. It reported only the
repository's existing conflicting arrow-parens warnings. `git diff --check` passed.

## Real smoke-test result

The Workspace was run with
`KIDSCODE_WORKSPACE_API_BASE_URL=https://testing.aileadkidscode.com/api` and opened with a fresh real launch from
TEST API 10. The browser recorded a fetch to
`https://testing.aileadkidscode.com/api/scratch/workspace/launch/resolve`; the real project title and Student context
loaded, `?launch=` disappeared from the local URL, and no development fixture or blocking fallback appeared.

Result: PASS.

## Close status

The Workspace Stage 1 integration, focused tests, and TEST-server browser smoke test are complete. Phase 8A is ready
to close after review and commit.
