# Form fields — planner-added engineer fields

The planner can extend the field engineer's form without touching the design
data. Open this page from **All jobs → Manage form fields**, or from **Form
fields** on a job's Measurements card (`form-fields.html`).

## What it does

1. Pick a **layer type** — Trench, Duct, Cable, Chamber, Pole, Premise, Other.
2. Pick **where it applies** — All projects, or one project.
3. Add extra fields: label + input type (Number + unit, Text/QC, Location, Notes).
4. Save. The fields are appended to that layer type's schema everywhere the
   clients read it.

Span and feature jobs need no separate configuration: a job determines _which_
features an engineer may edit, while the form is a property of their layer. A
field scoped to the trench layer therefore appears on a trench span job.

## What the engineer sees

The engineer clients already render `field_schema` dynamically
(`engineer/engineer-feature-detail.html`, the mobile survey app's
`DynamicForm`/`MeasurementEntrySheet`). Appending a field to that schema is the
whole delivery path; no client change is required.

`job-detail.html` lists every configured field, including one that has no
planned value and no measurement yet (both columns show `—`), so a saved field
is visible immediately after the planner adds it.

## Adding from a job

A planner viewing **Job details** can use **Add field** on the Measurements
card. It saves to the same layer-type form, for this project by default or for
all projects, and refreshes the table immediately so the new field is visible
before anyone measures it. The separate **Form fields** page remains the place
to see every scope and to remove a saved template.

## Scope and precedence

| Layer has…                                               | Result                                                                                                          |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| A per-layer config (Layer Details → Field Configuration) | That schema is the base; template fields are appended.                                                          |
| No per-layer config                                      | The feature's stored schema, or the one derived from its attributes, is the base; template fields are appended. |
| A project template for the layer kind                    | Used first, then the all-projects template.                                                                     |
| Only an all-projects template                            | Applied to every project's layers of that kind.                                                                 |

Templates only **add** fields. A template key that already exists on the layer
is skipped, so a global template can never silently change what an existing
measurement means. Changing an existing field — including making a design
attribute editable or read-only — remains in Layer Details → Field
Configuration.

Layer kinds are matched on the app's normalised layer id, so
`Final_Trenches`, `final_trenches` and `imp-final-trenches` are one kind
(`projects/layer_rules.py::layer_kind`).

## API

| Method | Path                                                   | Purpose                                                    |
| ------ | ------------------------------------------------------ | ---------------------------------------------------------- |
| GET    | `/api/field-templates/?project=<id>`                   | All-projects templates + that project's own                |
| PUT    | `/api/field-templates/`                                | Create/replace one `{scope, project?, layer_kind, fields}` |
| DELETE | `/api/field-templates/<id>/`                           | Remove a saved template                                    |
| GET    | `/api/field-templates/preview/?layer_kind=…&project=…` | Base fields + effective form from a real sample feature    |

Writes require `SUBADMIN`. The layer and feature APIs resolve through
`projects/api/field_templates.py::SchemaResolver`, so the admin preview, the
layer list and the single-feature endpoint always agree.

## Files

- `projects/models/field_template.py` — model and scope constraints
- `projects/api/field_templates.py` — resolver, API, preview
- `projects/api/field_spec.py` — field spec + append-only merge
- `projects/api/layer_field_config.py` — existing per-layer editor (shared cleaner)
- `fiber-fe/form-fields.html`, `fiber-fe/js/form-fields.js` — this page
- `projects/tests_field_templates.py` — scope, resolution and permission tests
