# UI reference — fiber-fe

A single map of the web platform's interface: shell, design system, JavaScript
modules, every screen, the map, the flows those screens implement, the API
surface behind them, and the known gaps worth fixing.

Written 19 Nov 2026 after reading the code in `fiber-fe/` (not just the docs)
and the knowledge-graph report in `graphify-out/GRAPH_REPORT.md`. Where a claim
comes from a dated review rather than from the current source, the source is
named.

---

## 1. Quick facts

| Item            | Value                                                                                                         |
| --------------- | ------------------------------------------------------------------------------------------------------------- |
| Stack           | Static HTML + CSS + vanilla JS. No framework, no bundler, no build step.                                      |     | Screens | 47 HTML files: 37 planner/admin + 10 engineer portal |
| Shared shell    | `partials/sidebar.html` injected by `partials/sidebar-loader.js`                                              |
| Design tokens   | `css/tokens.css` (single `:root`, plus legacy aliases)                                                        |
| Component layer | `css/components.css`, `css/main.css`, `css/ftth.css`                                                          |
| Maps            | MapLibre GL JS, vendored at `vendor/maplibre/`, wrapped by `js/ftth-map.js`                                   |
| Auth            | JWT in `localStorage` under `fiber_auth`; `FiberAuth` in `fiber-api.js`                                       |
| API base        | `js/ftth-config.js`: localhost → `http://localhost:8000`, otherwise `https://fibre-backend-wml3.onrender.com` |
| Lint/format     | ESLint + Stylelint + Prettier (`npm run lint`); CI in `.gitlab-ci.yml`                                        |
| Brand           | Tech Mahindra red `#E31837` on a dark navy rail (`#161B25` → `#0F141D`)                                       |

Two portals share one repo and one API:

- **Planner/admin portal** — root-level pages (`dashboard.html`, `projects.html`,
  `ftth-*.html`, `project-*.html`), `SUBADMIN` role.
- **Engineer portal** — `engineer/` subfolder with its own CSS, JS API client and
  login (`engineer/index.html`), `ENGINEER` role.

Page size is uneven by design: `ftth-permits.html` is 3,854 lines,
`project-assign.html` 3,595, `dashboard.html` 2,476, while `ftth-permit-copilot.html`
is a 19-line redirect stub.

---

## 2. Repository layout

```
fiber-fe/
├── *.html                    37 planner/admin screens
├── index.html                admin login
├── pages.html                in-app index of every screen (carries ?project_id)
├── css/
│   ├── tokens.css            design tokens (150 lines) + legacy --tm-* aliases
│   ├── components.css        shared component layer (1,922 lines)
│   ├── main.css              legacy app styles + .ds-* completion/progress (3,409)
│   ├── ftth.css              design-workspace styles, map furniture (1,888)
│   └── notifications.css     bell + slide-over inbox (546)
├── js/
│   ├── ftth-config.js        API base-URL resolution (24)
│   ├── ftth-ui.js            UI primitives, errors, polling helpers (1,026)
│   ├── ftth-components.js    dropzone, log viewer, badges, wizard (645)
│   ├── ftth-state.js         project id + pipeline polling (165)
│   ├── ftth-api.js           HLD / area / trench / BOQ client (853)
│   ├── ftth-lld-api.js       LLD, permits, users, lineage client (1,026)
│   ├── ftth-map.js           MapLibre wrapper, palette, legend (2,164)
│   ├── notifications.js      planner inbox (619)
│   ├── components/           progress-bar.js, completion-card.js
│   └── per-page modules      dashboard.js, project-details.js, span-inspection.js, …
├── partials/
│   ├── sidebar.html          nav rail + notification panel
│   ├── sidebar-loader.js     injects shell, project stage nav, inbox assets
│   └── weight-manager-modal.js
├── engineer/                 10 engineer screens + css/ + js/
├── vendor/maplibre/          MapLibre GL JS + CSS
├── _preview/                 design-run preview pages (not part of the app nav)
└── docs/                     admin/engineer flow docs, API notes, this file
```

Root `fiber-api.js` is the platform REST/auth client (`FiberApi`, `FiberAuth`).
The engineer portal has its own copies at `engineer/js/fiber-api.js` and
`engineer/js/api.js`. See §13 for the duplication cost.

---

## 3. App shell and navigation

### 3.1 What the shell injects

Every planner page contains `<div id="sidebarContainer"></div>` and loads
`partials/sidebar-loader.js`. The loader:

1. fetches `partials/sidebar.html` into that container,
2. reads the open project from `project_id`, `proj_id`, `project`, or
   `body[data-project-id]`,
3. fills the "Project workspace" card's links with that id and the project name
   (fetched from `/api/projects/{id}/`),
4. marks the active module (`data-page`) and active stage (`data-stage`),
5. wires the mobile drawer through `FtthUI.Drawer`,
6. injects `css/notifications.css` + `js/notifications.js` so all planner pages
   get the bell without per-page edits.

Pages name the project inconsistently (`project_id` vs `project` vs `proj_id`),
so every generated in-project link writes both `project_id` and `project`.

### 3.2 Navigation model

`partials/sidebar.html` has five fixed modules plus a conditional project card
and a System group:

| Group                                         | Entries                                                                                                       |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Projects                                      | Dashboard, All projects, Project progress                                                                     |
| Project workspace (only with an open project) | Overview, Planning & design, Permits, Jobs, Review, Progress                                                  |
| Planning                                      | Create project (`ftth-hld.html`), HLD outputs, LLD outputs, Map review, Survey changes, Supervision approvals |
| Jobs                                          | Assign jobs, All jobs                                                                                         |
| Reports & permits                             | Permits, Permit copilot, Reports & exports                                                                    |
| Engineer management                           | People, Invite engineer, Engineer activity                                                                    |
| System                                        | All pages, Logout                                                                                             |

The project card is the app's only "one project, one flow" device.
`sidebar-loader.js` defines six stages and the pages that belong to each:

| Stage    | Landing page               | Pages in the stage                                                                                                                                                                                               |
| -------- | -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| overview | `project-details.html`     | project-details, ftth-project-overview, layer-details                                                                                                                                                            |
| planning | `ftth-lld-versions.html`   | ftth-hld, ftth-hld-status, ftth-hld-results, ftth-trench-design, ftth-lld-review, ftth-lld-results, ftth-lld-versions, ftth-lld-outputs, ftth-approved-survey, ftth-feature-lineage, gpkg-upload, project-create |
| permits  | `ftth-permits.html`        | ftth-permits, ftth-permit-copilot                                                                                                                                                                                |
| jobs     | `project-assign.html`      | project-assign, job-detail                                                                                                                                                                                       |
| review   | `ftth-survey-changes.html` | project-approval-que, audit-detail, ftth-survey-changes, ftth-survey-approval, ftth-lld-feature-review                                                                                                           |
| progress | `projects-completion.html` | projects-completion, reports                                                                                                                                                                                     |

Known navigation defects (from `docs/PLATFORM_REVIEW_2026-10.md` §3.2 and still
visible in the current sidebar):

- **"Create project" opens `ftth-hld.html`**, which is the HLD area/upload page.
  Project creation is `project-create.html` (labelled "Create supervision
  project" on `pages.html`).
- **The rail never reaches `ftth-lld-review.html`**, which is where a planner
  creates the approved survey version and runs LLD.
- **"Supervision approvals" (Planning) and "Review" (project card) both point at
  `project-approval-que.html`**, while survey-change decisions live at
  `ftth-survey-changes.html`.
- Planner pages do not role-guard: an ENGINEER session on a planner URL still
  renders the admin chrome (writes fail, the UI invites them anyway).

### 3.3 Page index

`pages.html` is the in-app sitemap: every screen grouped as Projects, Design &
planning, Survey & review, Jobs, Permits & reports, People. It forwards the open
project to every `data-keep-project` link, so it can be used as a debug entry
point.

---

## 4. Design system

### 4.1 Tokens (`css/tokens.css`)

One `:root` block is the source of truth; a second block maps legacy names
(`--tm-red`, `--border`, `--green`, `--radius-base`, …) to the new ones.

| Group           | Tokens                                                                                                 |
| --------------- | ------------------------------------------------------------------------------------------------------ |
| Brand           | `--brand #E31837`, `--brand-dark`, `--brand-soft`, `--brand-on-dark #FF6B81`, `--brand-glow`           |
| Ink             | `--ink #111827`, `--ink-soft`, `--muted #616A75`, `--muted-strong`                                     |
| Surfaces        | `--surface`, `--surface-sunken #F9FAFB`, `--bg #F4F5F7`, `--line #E5E7EB`, `--line-strong #8B929C`     |
| Sidebar         | `--sidebar-top #161B25`, `--sidebar-bottom #0F141D`, `--sidebar-ink`                                   |
| Status          | success `#047857`, warning `#B45309`, danger `#B91C1C`, info `#1D4ED8` (+ soft/deep/line variants)     |
| Pipeline stages | `--stage-hld #6366F1`, `--stage-survey #B45309`, `--stage-lld #6D28D9`, `--stage-permit #92400E`       |
| Type            | system UI stack + `--font-data` monospace; 11 / 12 / 13.5 / 15 / 18 / 22 / 26 / 34 px; weights 400–800 |
| Radii           | 6 / 12 / 16 / pill                                                                                     |
| Elevation       | `--shadow-sm/md/lg` (offset + blur, no chromatic halos)                                                |
| Focus           | `--focus #0369A1` (5.93:1), `--focus-on-dark #93C5FD`, `--focus-ring`                                  |
| Space           | 4, 8, 12, 16, 20, 24, 32, 40, 56 — every gap is a multiple of 4                                        |
| Motion          | `--transition 160ms cubic-bezier(.4,0,.2,1)`, `--ease-out`, `--duration-slow 280ms`                    |

The file documents _why_ several values changed: `--line-strong` exists because
`--line` is too weak for an input boundary; `--brand-on-dark` exists because
`#E31837` on `#1F2937` measures 3.11:1.

### 4.2 Load order — read this before changing CSS

Tokens header says `tokens.css → components.css → page styles`, but the pages
actually link **tokens → main → ftth → components** (verified in
`dashboard.html`, lines 1205–1208). So among linked sheets, `components.css`
wins ties. On top of that, most pages carry one inline `<style>` block, and in
about 20 of 28 styled pages that block sits _after_ the links. At equal
specificity, document order makes those inline rules outrank the component
layer. This is the structural reason page-level styles sometimes win over the
design system, and why a shared rule change can appear to have no effect
(`.impeccable/critique/2026-09-28T23-40-42Z__fiber-fe-dashboard-html.md`, P0-2).

`ftth.css` is loaded by 16 planner pages (the design/pipeline workspace):
dashboard, ftth-approved-survey, ftth-feature-lineage, ftth-hld,
ftth-hld-projects, ftth-hld-results, ftth-hld-status, ftth-lld-feature-review,
ftth-lld-outputs, ftth-lld-results, ftth-lld-review, ftth-lld-versions,
ftth-permits, ftth-project-overview, ftth-survey-changes, ftth-trench-design.
The rest use tokens + main + components only.

### 4.3 Component inventory

| Family              | Classes                                                                                                                    | Notes                                                               |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Buttons             | `.btn`, `.btn-primary`, `.btn-secondary`, `.btn-outline`, `.btn-ghost`, `.btn-danger`, `.btn-sm`, `.btn-lg`, `.create-btn` | 10×18px, 8px radius, red primary                                    |
| Cards               | `.card`, `.section`, `.table-card`, `.kpi-card`, `.table-card--inset`                                                      | one radius (12px), one shadow; inset variant for nested tables      |
| Tables              | `table`, `thead th`, `tbody td`                                                                                            | uppercase 12px headers, sunken header row, hover tint               |
| Badges              | `.badge`, `.status-badge`, `.pill`, `.layer-pill`, `.badge-green/amber/red/blue/gray`                                      | pill radius, soft/background pairs                                  |
| Forms               | inputs, `select`, `textarea`, `label`                                                                                      | 8px radius, `--line-strong` border, red focus + ring; labels 12.5px |
| Empty/loading/error | `.empty-state`, `.dash-empty`, `.panel-state`, `.panel-state--error`, `.panel-state--loading`, `.panel-spinner`            | styled error title/body/retry pattern                               |
| Alerts              | `.alert`, `.alert-info/success/warning/danger/error`                                                                       | inline banners                                                      |
| Dialogs             | `.ftth-dialog`, `.ftth-dialog--danger`, `.modal`                                                                           | native `<dialog>` via `FtthUI.dialog/confirm/prompt`                |
| Toasts              | `.ftth-toast-stack`, `.ftth-toast`, `--success/error/info`                                                                 | fixed bottom-right                                                  |
| Nav/shell           | `.layout`, `.sidebar`, `.nav`, `.nav-section`, `.nav-label`, `.nav-project`, `.nav-toggle-btn`, `.nav-scrim`, `.content`   | off-canvas ≤860px                                                   |
| Map furniture       | `.ftth-basemap-switcher`, `.ftth-map-legend`, `.ftth-map-loading`, `.ftth-identify-btn`, `.lld-view-mode`                  | z-index layering matters (see §13)                                  |
| Review              | `.si-*` (span inspection), `.lld-*`, `.pm-*` (permits), `.ds-completion-*`, `.ds-progress-*`                               | page/domain families                                                |

### 4.4 What the system deliberately encodes

- **One radius, one elevation per level.** Cards do not wear a border _and_ a
  shadow; nested panels switch to `.table-card--inset` instead of stacking
  shadows.
- **Contrast is asserted in comments**, not decoration: control borders, status
  pairs, focus ring, brand-on-dark all have a measured ratio recorded.
- **Motion is optional.** `prefers-reduced-motion` blocks exist in
  `components.css`, `notifications.css` and individual pages;
  `FtthUI.motionOk/onMotionChange` expose the same decision to JS.
- **Tap targets**: `@media (pointer: coarse)` raises controls to 44px.
- **No dark mode.** There is no `prefers-color-scheme` or `data-theme` rule
  anywhere in `css/` or `engineer/css/`. The dark surfaces are the sidebar and
  the engineer top bar, not a theme.

---

## 5. Shared JavaScript modules

### 5.1 `js/ftth-config.js`

Sets `window.FIBER_BASE_URL` and `window.FTTH_BASE_URL` once:

1. keep an existing explicit value,
2. localhost / 127.0.0.1 / 0.0.0.0 → `http://localhost:8000`,
3. otherwise → `https://fibre-backend-wml3.onrender.com`.

Load it before `fiber-api.js`, `ftth-api.js` or any inline config.

### 5.2 `js/ftth-ui.js` → `window.FtthUI`

The platform's shared behaviour layer, and the right place to start most UI
changes:

| Export                                                              | Purpose                                                                                       |
| ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `Panel`                                                             | Wires a container through loading / empty / error states with retry; used by `dashboard.html` |
| `Drawer`                                                            | Focus-trapping off-canvas nav: Escape, scrim, body scroll lock, focus return                  |
| `dialog`, `confirm`, `alert`, `prompt`                              | Promise-based native `<dialog>`; `confirm` has a danger variant that focuses Cancel           |
| `toast(message, kind)`                                              | Bottom-right toast stack                                                                      |
| `describeCanvas(canvas, text)`                                      | Adds an accessible description to a canvas chart                                              |
| `errorKind`, `errorMessage`, `humanize`, `fromResponse`, `markKind` | Classify auth vs network vs server errors and write user-facing copy                          |
| `withTimeout(promise, ms, label)`                                   | Abort a hung request instead of leaving a spinner                                             |
| `poll`, `pollWithBackoff`                                           | Visibility-aware polling with backoff                                                         |
| `debounce`, `esc`, `motionOk`, `onMotionChange`, `reduceMotion`     | Utilities                                                                                     |

House rule already encoded here: never render a raw `Failed to fetch`.

### 5.3 `js/ftth-components.js` → `window.FtthComponents`

DOM builders for pipeline screens: `createDropzone`, `createLogViewer`
(role=`log`, max lines), `createStatusBadge`, `createProgressBar` /
`updateProgressBar`, `createLayerToggle`, `createStepWizard`
(+ `getStepStatesFromPipeline`). The wizard's `PIPELINE_STEPS` is the UI mirror
of the engine cascade: Object → Polygon → Network → Trench → Duct → Cable.

Note: this file hard-codes hex colours and inline styles rather than reading
tokens, so it drifts from `tokens.css`.

### 5.4 `js/ftth-state.js` → `window.FtthState`

Keeps `projectId` in memory + `localStorage['ftth_hld_state']`, caches the last
result, and runs the pipeline poll loop (default 3,000 ms). Polling is
sequential (`setTimeout` after each response) to avoid overlapping requests and
stale responses.

### 5.5 API clients

| Global                  | File                               | Covers                                                                                                                                                                                                   |
| ----------------------- | ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `FiberApi`, `FiberAuth` | `fiber-api.js`                     | login/refresh, `requireLogin`, `nextAfterLogin`, `getUser`, projects, layers, features, assignments, engineer stats, completion                                                                          |
| `FtthApi`               | `js/ftth-api.js`                   | HLD: projects, run/run-from-area, status, layers, downloads, area resolve/preview/coverage, OSM status/places, trench design, BOQ, surface AI review/classification, package downloads                   |
| `FtthLldApi`            | `js/ftth-lld-api.js`               | LLD runs/status/layers, review payload, approved version, run LLD, versions/diff, feature lineage, permits (list/summary/expiry/submissions/sync/QA/AI drafts/classify), users/members, project overview |
| `FtthMap`               | `js/ftth-map.js`                   | MapLibre init, basemaps, GeoJSON layers, identify, legend, z-order                                                                                                                                       |
| planner inbox           | `js/notifications.js`              | bell, badge poll (45 s), filters, read/read-all                                                                                                                                                          |
| `CompletionCard`        | `js/components/completion-card.js` | standard vs weighted completion, layer breakdown                                                                                                                                                         |
| `ProgressBar`           | `js/components/progress-bar.js`    | `.ds-progress-*` renderer                                                                                                                                                                                |

`fiber-api.js` also carries `FiberAuth`'s localStorage contract:
`fiber_auth` = `{ access, refresh, user }`.

---

## 6. Screen inventory

### 6.1 Planner/admin screens (root)

| File                           | H1 / role                    | What it is                                                                                                                                                                            |
| ------------------------------ | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `index.html`                   | Admin Login                  | Email/password → `FiberApi.login`; rejects ENGINEER accounts and points them at `engineer/index.html`; honours `?next=` (permit email links)                                          |
| `dashboard.html`               | FTTH Pipeline Command Center | 5 KPIs (Supervision, Pending Reviews, LLD Runs, Total Projects, Permits), HLD pipeline donut, survey review donut, approval queue table, recent activity; guarded/health-aware panels |
| `projects.html`                | All Projects                 | Project list with status/layer counts/completion                                                                                                                                      |
| `projects-completion.html`     | Projects Completion          | Per-layer completion + weights behind it (`CompletionCard`, weight manager)                                                                                                           |
| `project-create.html`          | Create New Project           | Create the supervision project                                                                                                                                                        |
| `gpkg-upload.html`             | Import GeoPackage            | Upload → discover layers → import                                                                                                                                                     |
| `project-details.html`         | Project Overview             | Project features/layers landing (Overview stage)                                                                                                                                      |
| `ftth-project-overview.html`   | Project Overview             | Cards: Team, Business & Technical, Layers, Survey Approval Summary, Permits, Timeline; stage trail                                                                                    |
| `layer-details.html`           | Layer Details                | One layer's features/schema                                                                                                                                                           |
| `ftth-hld.html`                | Create project               | HLD workspace: resolve area, preview coverage/imagery, run pipeline                                                                                                                   |
| `ftth-hld-status.html`         | Pipeline Status              | Live step progress while HLD runs                                                                                                                                                     |
| `ftth-hld-projects.html`       | HLD Outputs                  | Every HLD run + produced layers                                                                                                                                                       |
| `ftth-hld-results.html`        | Design Results               | Finished run's layers, spans, surface review                                                                                                                                          |
| `ftth-trench-design.html`      | Trench Design                | Civil design: trenches, ducts, chambers, crossings                                                                                                                                    |
| `ftth-lld-outputs.html`        | LLD Outputs                  | LLD per layer, ready for field                                                                                                                                                        |
| `ftth-lld-results.html`        | LLD Output                   | Span-by-span output for a run                                                                                                                                                         |
| `ftth-lld-review.html`         | LLD Review                   | Map + decision rail: readiness counts, queue risk, AS chip, Create Approved Survey Version, Run LLD, Full re-plan, change drawer                                                      |
| `ftth-lld-versions.html`       | LLD Versions                 | Versions per run, diff/delete/download                                                                                                                                                |
| `ftth-lld-feature-review.html` | LLD Feature Review           | One feature's inputs vs computed LLD values                                                                                                                                           |
| `ftth-feature-lineage.html`    | Feature Lineage              | Where a feature came from, stage by stage                                                                                                                                             |
| `ftth-approved-survey.html`    | Approved Survey Version      | The ASV a design is based on                                                                                                                                                          |
| `ftth-survey-changes.html`     | Approval queue               | Engineer edits awaiting approve/reject/correction                                                                                                                                     |
| `ftth-survey-approval.html`    | Survey Approval              | Approve a survey or return it for rework                                                                                                                                              |
| `project-approval-que.html`    | Approval Queue               | Features waiting on a supervision decision                                                                                                                                            |
| `audit-detail.html`            | Audit review                 | One feature: design vs as-built                                                                                                                                                       |
| `project-map-review.html`      | Map review                   | Baseline vs as-built on one map                                                                                                                                                       |
| `project-assign.html`          | Assign jobs                  | Assign by project / layer / feature                                                                                                                                                   |
| `all-jobs.html`                | All Jobs                     | Every assignment: view, reassign, delete                                                                                                                                              |
| `form-fields.html`             | Form fields                  | Opened from **All jobs → Manage form fields**; add fields for a layer type, scoped to one project or all projects, and preview what the app renders                                   |
| `job-detail.html`              | Job details                  | Engineer, field progress, photos, measurements, decisions                                                                                                                             |
| `ftth-permits.html`            | Permits                      | Tabs: Overview, Permits, Submissions, Copilot; classification, QA, expiry, sync                                                                                                       |
| `ftth-permit-copilot.html`     | —                            | 19-line redirect to `ftth-permits.html?tab=copilot`                                                                                                                                   |
| `reports.html`                 | Reports & Exports            | Download numbers behind a project (CSV/PDF)                                                                                                                                           |
| `engineers-list.html`          | Field Engineers              | Engineer accounts + status                                                                                                                                                            |
| `engineers-invite.html`        | Invite Field Engineer        | Create an engineer account                                                                                                                                                            |
| `engineer-activity.html`       | Engineer Activity            | One engineer's work + stats                                                                                                                                                           |
| `pages.html`                   | All pages                    | In-app sitemap with project carry-over                                                                                                                                                |

### 6.2 Engineer portal (`engineer/`)

| File                             | H1 / role            | What it is                                                                            |
| -------------------------------- | -------------------- | ------------------------------------------------------------------------------------- |
| `index.html`                     | Engineer Login       | Separate login, stores the same `fiber_auth`                                          |
| `fe-accept-invite.html`          | Activate Account     | Invite acceptance / password set                                                      |
| `engineer-dashboard.html`        | My Dashboard         | Dark top bar, assignment cards, progress, bell                                        |
| `engineer-project-details.html`  | My Projects          | Assigned projects (documented as still using the old header, not the dark bar)        |
| `engineer-project-features.html` | Project Features     | Features inside one assigned project                                                  |
| `engineer-project-map.html`      | Project Map          | Standalone MapLibre init (OSM raster), status-coloured points, click → feature submit |
| `engineer-feature-detail.html`   | Feature Details      | Photos, measurements, metadata                                                        |
| `engineer-feature-submit.html`   | Capture In The Field | Measurement modes, GPS, camera/video, custom fields, notes, submit                    |
| `engineer-notifications.html`    | Notifications        | Real inbox (filters, unread, mark all, retry)                                         |
| `engineer-profile.html`          | My Profile           | Identity + password area                                                              |

Engineer assets are separate: `engineer/css/main.css` (141 lines, login/shell),
`engineer/notifications.css` (351), `engineer/js/{api,fiber-api,index,notifications}.js`.
The portal does not use `js/ftth-map.js`; `engineer-project-map.html` initialises
its own map with a single OSM raster source.

---

## 7. Map UI (`js/ftth-map.js`)

### 7.1 Basemaps and controls

Four raster basemaps: Streets (OSM), Light (CARTO), Satellite, Dark (CARTO).
`initMap(container, {basemap})` adds Navigation (top-left), Scale
(bottom-left) and compact Attribution. `setBaseStyle(map, name)` toggles
visibility rather than reloading the style, so overlays survive a basemap switch.

### 7.2 Visual language

Every component has a fixed shape (points) or stroke (lines), so the legend
alone can explain the network. Weight ladder: **trench > duct > cable**.

Points (`SYMBOL_SPEC`):

| Component          | Glyph               | Colour    |
| ------------------ | ------------------- | --------- |
| MFG                | hexagon             | `#047857` |
| PDP                | triangle            | `#06B6D4` |
| Chamber — Bore     | diamond             | `#B91C1C` |
| Chamber — Manhole  | square              | `#1E293B` |
| Chamber — Handhole | circle              | `#64748B` |
| Coupler            | diamond (small)     | `#14B8A6` |
| Pole               | cross               | `#B45309` |
| Premise / object   | dot (small)         | `#8B5CF6` |
| Existing infra     | dot by `ASSET_TYPE` | grey ramp |

Lines (`LINE_SPEC`, bucketed by attribute):

| Layer        | Field         | Buckets                                                                                              |
| ------------ | ------------- | ---------------------------------------------------------------------------------------------------- |
| Trenches     | `trench_type` | Open Cut blue solid 6px; HDD violet 10/4 dash 5.5px; Garden green solid 4px; Aerial amber dash 3.5px |
| Ducts        | `DUCT_TYPE`   | 4-Way feeder amber 3.6; 2-Way distribution violet 3; 1-Way drop pink 2.2                             |
| Cables       | `CABLE_TYPE`  | Feeder red 1.8; Distribution orange 1.3; Drop green 1.0; Aerial amber dashed 1.6                     |
| Aerial drops | `TRENCH_TYPE` | `Aerial` / `Aerial_Drop` both amber dashed                                                           |

Draw order (`Z_KEYWORDS`, bottom → top): polygons/buildings → objects/premises
→ brownfield → trenches → ducts → cables → couplers → chambers → poles → PDPs
→ MFG. `applyZOrder` enforces it so both HLD (`trenches`, `cables`) and LLD
(`distribution_cable`, `drop_ducts`) naming land in the same stack.

Other behaviours: per-feature sublayer colours for merged layers, icon caching,
click-to-identify popup (max 320px), cursor change in identify mode, feature
identity resolution across tiles, and `legendHTML` for the on-map legend.

---

## 8. Core flows the screens implement

### 8.1 HLD (design) → results

`ftth-hld.html` → resolve/preview area (`/api/ftth/hld` area endpoints, OSM
status, place suggestions) → run pipeline (`runFromArea` / `runPipeline`) →
`ftth-hld-status.html` polls `FtthState.startPolling` → `ftth-hld-results.html`
(layers, spans, surface review) → `ftth-trench-design.html` (civil design) →
BOQ/package downloads.

Pipeline steps surfaced by the wizard: Object → Polygon → Network → Trench →
Duct → Cable. Failures keep the step in `failed` with a Retry action; each step
only becomes runnable when its dependency is `completed`.

### 8.2 Survey → approval → Approved Survey Version

Field engineers edit features (mobile app / engineer portal). Planner opens
`ftth-survey-changes.html`, decides approve / reject / needs-correction per
change, or bulk-approves in `ftth-survey-approval.html`. Only `approved`,
`completed` and `rejected` are resolved; `pending_review`, `new`, `modified`,
`removed` and `needs_correction` block LLD. `ftth-approved-survey.html` shows
the resulting immutable snapshot (HLD + approved changes − approved removals).

### 8.3 LLD review → run → versions

`ftth-lld-review.html` is map-first with the decision rail on the right:

- readiness dot + count grid (approved / rejected / correction / pending),
- unresolved-queue risk score and bands,
- approved-survey chip,
- **Create Approved Survey Version** → **Run LLD** → **Full re-plan**,
- a slide-in drawer with the selected change's detail.

Then `ftth-lld-results.html`, `ftth-lld-outputs.html`,
`ftth-lld-versions.html` (diff, delete, zip), `ftth-lld-feature-review.html`
(inputs vs computed), `ftth-feature-lineage.html` (stage trail).

Documented follow-up: after creating the ASV the readiness block does not
re-render, so Run LLD stays disabled until reload
(`docs/PLATFORM_REVIEW_2026-10.md` §2.1).

### 8.4 Permits

`ftth-permits.html` tabs:

| Tab         | Content                                                                |
| ----------- | ---------------------------------------------------------------------- |
| Overview    | Summary, readiness/completeness, risk, timeline, expiries              |
| Permits     | Permit matrix rows per street/authority, status, QA                    |
| Submissions | Submission tracking, sync, CSV, transitions                            |
| Copilot     | AI drafting/advisory (never authoritative; deterministic rules decide) |

`/api/ftth/permits/` list is ~20 MB unpaginated (review §2.3) and `?tab=copilot`
is the redirect target for the legacy copilot page.

### 8.5 Jobs and supervision

Assign (`project-assign.html`: scope project/layer/feature, assignee, due date)
→ `all-jobs.html` (search/filter/status, reassign, delete) → `job-detail.html`
(field progress, photos, measurements, decisions). Supervision runs
`project-create.html` / `gpkg-upload.html` → `project-details.html` →
`project-approval-que.html` → `audit-detail.html` →
`projects-completion.html` / `reports.html`.

### 8.6 Notifications

One bell in the sidebar rail (planner) and one in the engineer top bar. Planner
panel: severity dot, project, kind chip, relative time, unread tint, category
filters with counts, mark-all, Esc + focus return, badge polling a two-count
endpoint every 45 s. Endpoints: `GET /api/notifications/`,
`GET /api/notifications/summary/`, `POST /api/notifications/{id}/read/`,
`POST /api/notifications/read-all/`.

### 8.7 Form fields (planner → engineer)

`form-fields.html` (from **All jobs → Manage form fields**) lets a planner add fields for a **layer type** and
choose the scope: **All projects** or **one project**. A planner can also add
one straight from **Job details** — the Measurements card has an **Add field**
control with the same scope choice, and the table refreshes as soon as it is
saved. The backend appends the field to the layer's `field_schema`, which the
app renders dynamically. Span and feature jobs inherit their layer's fields —
the job decides which rows are editable, not which form they render. Per-layer
overrides stay in Layer Details → Field Configuration.
See `docs/FORM_FIELDS.md`.

---

## 9. API surface behind the UI

### 9.1 Platform (`fiber-backend`)

| Area             | Endpoints                                                                                             |
| ---------------- | ----------------------------------------------------------------------------------------------------- |
| Auth             | `POST /api/users/login/`, `POST /api/users/token/refresh/`                                            |
| Users            | `GET/POST /api/users/`, `GET /api/users/engineers/`, `GET /api/users/all/`, `DELETE /api/users/{id}/` |
| Projects         | `GET/POST /api/projects/`, `latest/`, `{id}/`, `DELETE`, `{id}/completion/`, `{id}/map-data/`         |
| Layers           | `{id}/layers/`, `{id}/layers/{layer}/`, `{id}/layers/weights/` (GET/PUT)                              |
| Features         | `{id}/features/{fid}/`, `POST /api/features/submit                                                    | approve  | reject/`, `{id}/submit/`, `{id}/field-measurements/`, `{id}/upload-photo/` |
| Import           | `{id}/import/upload                                                                                   | discover | import                                                                     | status/` |
| Assignments      | `GET/POST /api/assignments/`, `summary/`, `jobs/`, `PATCH/DELETE /{id}/`                              |
| Engineer metrics | `GET /api/engineer/activity/`, `GET /api/engineer/stats/`                                             |
| Notifications    | `GET /api/notifications/`, `summary/`, `POST {id}/read/`, `read-all/`                                 |

### 9.2 Engine and design (`FtthApi`, prefix `/api/ftth/hld`)

Projects, run / run-from-area, status, layer, results, downloads (design
package, survey package, BOQ), area resolve/preview/coverage, OSM status,
place suggestions, trench design, surface AI review and classification.

### 9.3 LLD and permits (`FtthLldApi`, prefixes `/api/ftth/lld`,

`/api/ftth/permits`)

Runs/status/layers/review, approved version, run LLD, versions + diff, feature
lineage, permits (list, summary, projects, QA, expiries, submissions, sync +
CSV, AI drafts, classification + feedback + stats, notifications), users and
members, project overview.

---

## 10. Cross-cutting behaviour

- **Auth**: JWT in `localStorage['fiber_auth']`; `FiberAuth.requireLogin()` on
  protected pages; `FiberAuth.nextAfterLogin()` honours `?next=`;
  `refreshAccessToken()` on 401. Engineer and admin logins are separate but
  share the token contract.
- **Errors**: `FtthUI.errorKind` distinguishes session expiry from outage;
  `withTimeout` prevents permanent spinners; `Panel` renders
  loading/empty/error consistently. `FtthUI.humanize` is the only sanctioned
  way to show a transport error.
- **Polling**: `FtthState` (3 s, sequential) for HLD; `FtthUI.poll` /
  `pollWithBackoff` (visibility-aware) elsewhere; notifications badge 45 s.
- **Persistence**: `fiber_auth` (session) and `ftth_hld_state` (project id).
  Nothing else is persisted client-side; pages rebuild from the API.
- **Escaping**: `FtthUI.esc` and per-page `esc()` are used before injecting any
  API string into `innerHTML`; keep that pattern in new code.
- **Confirmation**: destructive actions use `FtthUI.confirm` with a danger
  variant (Cancel focused), replacing native `confirm()`.

---

## 11. Responsive, accessibility, theming

| Concern         | State                                                                                                                                                                                                                     |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Breakpoints     | 480, 520, 600/601, 620, 639/640, 860, 900, 980, 1023/1024 px                                                                                                                                                              |
| Mobile shell    | ≤860px: off-canvas drawer, scrim, focus trap/return, body scroll lock                                                                                                                                                     |
| Tap targets     | `@media (pointer: coarse)` → 44px minimum                                                                                                                                                                                 |
| Motion          | `prefers-reduced-motion` respected in CSS and via `FtthUI`                                                                                                                                                                |
| Focus           | Visible ring token (`--focus`, `--focus-on-dark`), 5.93:1                                                                                                                                                                 |
| Charts          | Canvas-based donuts/sparklines; `describeCanvas` exists but some pages do not call it                                                                                                                                     |
| Theming         | Light only; dark surfaces are chrome, not a theme                                                                                                                                                                         |
| Known a11y gaps | 11px prose on some labels (permits, completion captions), skipped `h2` levels, unlabelled engineer select on `projects.html`, engineer brand-on-dark contrast (3.1:1) on 5 pages, hero clock inside an `aria-live` region |

---

## 12. Where to change what

| Goal                                                 | Start here                                                                                            |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Change colours, type, spacing, radii                 | `css/tokens.css` — then check inline `<style>` blocks on the page                                     |
| Change a shared control (button, table, badge, form) | `css/components.css`                                                                                  |
| Change the nav rail or add a page entry              | `partials/sidebar.html` + stage map in `partials/sidebar-loader.js`                                   |
| Add a screen to the in-app index                     | `pages.html`                                                                                          |
| Change error/toast/dialog behaviour                  | `js/ftth-ui.js` (`Panel`, `toast`, `dialog`, `errorKind`)                                             |
| Change HLD requests                                  | `js/ftth-api.js`                                                                                      |
| Change LLD/permits requests                          | `js/ftth-lld-api.js`                                                                                  |
| Change map layers, colours, shapes, draw order       | `js/ftth-map.js` (`LAYER_COLORS`, `SYMBOL_SPEC`, `LINE_SPEC`, `Z_KEYWORDS`)                           |
| Change the notification inbox                        | `partials/sidebar.html` + `js/notifications.js` + `css/notifications.css`                             |
| Change dashboard panels/KPIs                         | `dashboard.html` + `js/dashboard.js`                                                                  |
| Add or scope engineer form fields                    | `form-fields.html` + `js/form-fields.js`; resolver in `fiber-backend/projects/api/field_templates.py` |
| Change the LLD decision rail                         | `ftth-lld-review.html` + `js/ftth-lld-review.js` + `css/ftth.css`                                     |
| Change engineer portal chrome                        | `engineer/css/main.css` + `engineer/js/{fiber-api,api,notifications}.js`                              |
| Change login/redirect behaviour                      | `index.html`, `engineer/index.html`, `FiberAuth` in `fiber-api.js`                                    |

---

## 13. Known gaps and risks (pre-existing)

Ordered by leverage, with the source that established them.

1. **Inline `<style>` blocks outrank `components.css`** on most pages (about
   1,037 rules across 20 pages). Any shared-component change can be silently
   overridden. Fix: move page blocks above the links (mechanical), then migrate
   to per-page stylesheets (durable). — Impeccable critique, P0-2.
2. **`ftth-lld-review.html` can hang with no error path**: no loading→error
   timeout, and `#mapLoading` shares `z-index: 10` with `#basemapSwitcher`, so
   the switcher is unclickable during load. — Impeccable critique, P0.
3. **Huge unpaginated payloads**: `ftth-lld-review.html` fetches ~12.7 MB for a
   handful of changes; `ftth-permits.html` ~20 MB with no pagination. —
   Platform review §2.3.
4. **No role guard on planner pages**: an ENGINEER session gets the admin
   chrome. — Platform review §3.1.
5. **Navigation does not match destinations** ("Create project" → HLD upload;
   LLD review unreachable; duplicate approval links). — Platform review §3.2.
6. **Three failure vocabularies**: dashboard `panel-state`, permits `.pm-empty`
   (sometimes raw "Failed to fetch"), projects/engineers-list bare text. —
   Impeccable critique, P1.
7. **Mobile table clipping**: `ftth-permits.html` hides 5 columns behind an
   inline `overflow: hidden`; `engineers-list.html` clips its actions column. —
   Impeccable critique, P1.
8. **Dashboard mobile hero clips the status line** (`.dash-hero` 358px client
   width vs 644px scroll width, no page scrollbar). — Impeccable critique, P1.
9. **Readiness does not refresh after ASV creation**, so Run LLD stays disabled
   until reload. — Platform review §2.1 follow-up.
10. **Duplicated clients and shells**: `fiber-api.js` vs `js/ftth-api.js` vs
    `ftth-lld-api.js`; engineer has its own `fiber-api.js` and `api.js`; two
    notification modules. A change to auth/refresh must be made in more than
    one place.
11. **Token drift in JS-built UI**: `js/ftth-components.js` and
    `engineer-project-map.html` hard-code hex values instead of reading
    `tokens.css`.
12. **Docs are partly stale**: `docs/admin-platform-pending.md` and
    `docs/engineer-platform-pending.md` (both earlier than October) still say
    the dashboard KPIs are hardcoded, the map review page must be created, and
    feature submit never POSTs. Those pages now exist and call the API; treat
    the pending lists as historical, and verify against source before acting.

---

## 14. Suggested changes (in the order they pay off)

**First, make the system authoritative**

1. Move every page's inline `<style>` above the stylesheet links, then migrate
   the rules into per-page files loaded before `components.css`. This makes
   later design changes predictable and fixes several defects at once.
2. Route every empty/error branch through `FtthUI.Panel` (permits, projects,
   engineers-list, lld-review) and delete raw transport strings.

**Then, remove dead ends**

3. Role-guard the planner shell (`requireRole('SUBADMIN')` redirecting to the
   engineer dashboard) beside `FiberAuth.requireLogin()` or in the shell loader.
4. Fix the nav to match reality: a real "Create project" entry, an "LLD review"
   entry, one unambiguous approvals destination.
5. Refresh readiness after ASV creation (re-run the readiness/review fetch when
   `createAsBtn` resolves).
6. Add a timeout + dismiss path to the LLD review map, and give the basemap
   switcher a higher `z-index` than the loading overlay.

**Then, make large projects usable**

7. Paginate/field-select the review and permits payloads; refetch only the
   readiness block after a mutation. This is the single largest performance
   risk in the product.
8. Show per-project pipeline position on the dashboard (the current rail is
   aggregate-only) and make the permit stage visible in that rail.
9. Keyboard shortcuts for the review queue: `j`/`k` to move, `a`/`r` to decide,
   `/` to search. The queue is the highest-repetition workflow in the app.
10. Surface save/sync state in the engineer form (`sync_status` exists in the
    API but is invisible), so a field engineer knows work is safe.
