#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────
# Local CI runner — mirrors the exact commands from .gitlab-ci.yml so you
# can preview what GitLab will execute BEFORE pushing.
#
#   bash ci/run-local.sh
#
# Exit code 0 = every job would pass, 1 = a job would fail.
# ─────────────────────────────────────────────────────────────────────────
set -u
cd "$(dirname "$0")/.."

PASS=0
FAIL=0

step() { echo; echo "══════════════════════════════════════════════════════════"; echo "  $1"; echo "══════════════════════════════════════════════════════════"; }

# ── Job 1: validate ──────────────────────────────────────────────────────
step "JOB: validate (node ci/link-check.js)"
if node ci/link-check.js; then PASS=$((PASS+1)); else FAIL=$((FAIL+1)); fi

# ── Job 2: bundle-check ──────────────────────────────────────────────────
step "JOB: bundle-check (build public/ + node ci/link-check.js --bundle public)"
rm -rf public
mkdir -p public
cp -r *.html public/
cp *.js public/
cp -r css public/css
cp -r js public/js
cp -r partials public/partials
cp -r engineer public/engineer
cp -r docs public/docs
cp -r vendor public/vendor
if node ci/link-check.js --bundle public; then PASS=$((PASS+1)); else FAIL=$((FAIL+1)); fi

# ── Job 3: pages (deploy) — same build + both checks ─────────────────────
step "JOB: pages (build public/ + validate + bundle-check before publish)"
if node ci/link-check.js && node ci/link-check.js --bundle public; then
  PASS=$((PASS+1))
else
  FAIL=$((FAIL+1))
fi

# Clean up the local build artifact (GitLab keeps it as its own artifact)
rm -rf public

echo
echo "──────────────────────────────────────────────────────────────"
echo "  LOCAL CI RESULT: $PASS passed, $FAIL failed"
echo "──────────────────────────────────────────────────────────────"
[ "$FAIL" -eq 0 ]
