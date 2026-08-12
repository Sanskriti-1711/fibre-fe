# vendor/ — Self-hosted third-party libraries

The frontend loads its map libraries **locally** instead of from a CDN. This
was done because the `unpkg.com` CDN was unreliable/blocked in some
environments, which broke map rendering on every page (`maplibregl is not
defined` / `L is not defined`).

## Contents

| Library | Version | Files | Source |
|---|---|---|---|
| Leaflet | 1.9.4 | `leaflet/leaflet.js`, `leaflet/leaflet.css`, `leaflet/images/*` | https://unpkg.com/leaflet@1.9.4/dist/ |
| MapLibre GL JS | 4.7.1 | `maplibre/maplibre-gl.js`, `maplibre/maplibre-gl.css` | https://unpkg.com/maplibre-gl@4.7.1/dist/ |

Files are byte-for-byte copies of the published dist artifacts (including
their license headers). `maplibre-gl.css` is fully self-contained (data URIs);
`leaflet.css` references `images/` relative to the CSS, which is why the
images folder is vendored alongside it.

## How to update

1. Download the new dist files from unpkg (or the project's official release).
2. Replace the files under `vendor/<lib>/`, keeping the same filenames.
3. Update the version in this table.
4. Run `node ci/link-check.js` and `bash ci/run-local.sh` — the CI asserts
   these assets are present in the deploy bundle.

## Licensing

- Leaflet: BSD-2-Clause (© 2010–2024 Vladimir Agafonkin)
- MapLibre GL JS: BSD-3-Clause

See the license headers inside each file for full text.
