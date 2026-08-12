# vendor/ — Self-hosted third-party libraries

The frontend loads its map library **locally** instead of from a CDN. This
was done because the `unpkg.com` CDN was unreliable/blocked in some
environments, which broke map rendering on every page (`maplibregl is not
defined`).

MapLibre GL is the **only** map library in the codebase — Leaflet was
removed and every former Leaflet page now uses MapLibre GL.

## Contents

| Library | Version | Files | Source |
|---|---|---|---|
| MapLibre GL JS | 4.7.1 | `maplibre/maplibre-gl.js`, `maplibre/maplibre-gl.css` | https://unpkg.com/maplibre-gl@4.7.1/dist/ |

Files are byte-for-byte copies of the published dist artifacts (including
their license headers). `maplibre-gl.css` is fully self-contained (data URIs).

## How to update

1. Download the new dist files from unpkg (or the project's official release).
2. Replace the files under `vendor/maplibre/`, keeping the same filenames.
3. Update the version in this table.
4. Run `node ci/link-check.js` and `bash ci/run-local.sh` — the CI asserts
   these assets are present in the deploy bundle.

## Licensing

- MapLibre GL JS: BSD-3-Clause

See the license header inside the file for full text.
