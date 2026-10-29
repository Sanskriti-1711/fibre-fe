# Fiber Frontend — Agent Knowledge Base

## Scope

- `fiber-fe/` is its own git repo (root repo ignores subprojects). Working on branch `feature/fiber-fe`, created from `main`.
- Static HTML/CSS/JS (vanilla, no build step). Admin + Engineer portals, HLD, LLD, permits pages.

## Tech & tooling

- package.json scripts: `lint` (eslint . --ext .js && stylelint **/_.css && prettier --check \**/_.{html,js,css,json,md}), `ci:check` = lint. No test framework configured (gap: no unit-test runner for new JS code).
- MapLibre GL JS (vendor/maplibre/), shared renderer `js/ftth-map.js`.

## API clients (own and maintain)

- `fiber-api.js` — auth (JWT login/refresh, localStorage `fiber_auth`), projects, layers, features, assignments, engineer activity/stats, field measurements, submit/approve/reject, survey changes, completion/weights.
- `js/ftth-api.js` — HLD pipeline proxy (/api/ftth/hld/*): run, status/results, layers, downloads, BOQ, trench design, area-driven runs, surface AI review, getProjectPermits.
- `js/ftth-lld-api.js` — LLD review/runs/versions (+ permits + AI copilot endpoints /api/ftth/permits/*).
- All three share JWT auth + 401 token-renewal patterns; `window.FiberApi`, `window.FtthApi`, `window.FtthLldApi` globals.

## Contracts to honor (backend agent owns them)

- `/api/ftth/hld/` — FastAPI engine proxied via Django (:8080 engine, :8000 Django).
- `/api/ftth/lld/` — review, changes/action, approved-version, runs/versions.
- `/api/ftth/permits/` — permits/matrix/analyze/package + AI copilot.
- Auth: POST /api/users/login/, POST /api/users/token/refresh/.

## Doc references read

- docs/ARCHITECTURE.md (system map, data flow, frontend section)
- docs/DATA_DICTIONARY.md (models/layers ownership)
- docs/GLOBAL_TODO.md (operational issues, held/resolved items)
- docs/MULTI_AGENT_SYSTEM_PLAN.md (agent roles, sync protocol, board usage)
- docs/subprojects/fiber-frontend/CURRENT_STATE.md, TODO.md, apis.md, ARCHITECTURE.md

## Gaps found

1. No unit-test runner in fiber-fe (package.json has no test script; `npm test` fails). New JS code needs tests added per agent responsibilities.
2. `fiber-api.js` duplicates fetch/auth/retry logic with `ftth-api.js` and `ftth-lld-api.js` (listed as technical debt in TODO.md).
3. Dashboard KPIs still hardcoded; reports export non-functional (TODO.md Critical).
4. Permit AI copilot clients live in `ftth-lld-api.js` though they are /api/ftth/permits/ — could be split but is the current home.
