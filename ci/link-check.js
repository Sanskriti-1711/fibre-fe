#!/usr/bin/env node
/**
 * CI link-check + JS syntax validator for the fibre-fe static UI.
 *
 * Checks:
 *   1. Every inline <script> block and every .js file parses (node --check).
 *   2. Every internal href (pages + assets) in every .html file resolves
 *      to a real file (or a known-safe external URL).
 *   3. Every page referenced by the shared sidebar actually exists.
 *
 * Usage:
 *   node ci/link-check.js               → check the source tree
 *   node ci/link-check.js --bundle public → check the deploy bundle
 *        (verifies every source page — incl. the FTTH LLD pages — made it
 *         into the bundle and that its links resolve inside the bundle)
 *
 * Exit code 0 = all good, 1 = problems found.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');

// ── CLI: optional --bundle <dir> ───────────────────────────────────────
const bundleIdx = process.argv.indexOf('--bundle');
const BUNDLE = bundleIdx !== -1 && process.argv[bundleIdx + 1]
  ? path.resolve(ROOT, process.argv[bundleIdx + 1])
  : null;
const BASE = BUNDLE || ROOT;
const MODE = BUNDLE ? `bundle (${path.relative(ROOT, BUNDLE)})` : 'source tree';

const failures = [];
const warnings = [];

function isSkippedDir(name) {
  return name.startsWith('.') || name === 'node_modules' || name === 'ci' || name === '.git' || name === 'public';
}

function allHtmlFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (isSkippedDir(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...allHtmlFiles(full));
    } else if (entry.name.endsWith('.html')) {
      out.push(full);
    }
  }
  return out;
}

function allJsFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (isSkippedDir(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...allJsFiles(full));
    } else if (entry.name.endsWith('.js')) {
      out.push(full);
    }
  }
  return out;
}

function allFilesIn(dir) {
  const out = [];
  (function walk(d) {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      if (isSkippedDir(entry.name)) continue;
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) walk(full);
      else out.push(full);
    }
  })(dir);
  return out;
}

const rel = (p) => path.relative(ROOT, p).replace(/\\/g, '/');
const relBase = (p) => path.relative(BASE, p).replace(/\\/g, '/');

console.log(`\n═══ Checking ${MODE} ═══════════════════════════════════════════\n`);

// ── 0) Bundle completeness (--bundle only) ─────────────────────────────
if (BUNDLE) {
  console.log('── Bundle completeness ─────────────────────────────────────');
  if (!fs.existsSync(BUNDLE)) {
    failures.push(`Bundle directory not found: ${rel(BUNDLE)}`);
  } else {
    const bundled = new Set(allFilesIn(BUNDLE).map((p) => relBase(p)));

    // Every source page (root + engineer/ + partials/) must be deployed
    const srcPages = allHtmlFiles(ROOT);
    let missingPages = 0;
    for (const page of srcPages) {
      const r = rel(page);
      if (!bundled.has(r)) {
        failures.push(`Deploy bundle missing page: ${r}`);
        missingPages++;
      }
    }
    console.log(`  ${srcPages.length} source pages — ${srcPages.length - missingPages} deployed`);

    // Every source JS asset must be deployed (LLD JS included)
    const srcJs = allJsFiles(ROOT);
    let missingJs = 0;
    for (const file of srcJs) {
      const r = rel(file);
      if (!bundled.has(r)) {
        failures.push(`Deploy bundle missing JS asset: ${r}`);
        missingJs++;
      }
    }
    console.log(`  ${srcJs.length} source JS assets — ${srcJs.length - missingJs} deployed`);

    // Explicitly assert the FTTH LLD pages + their scripts are bundled
    const lldPages = ['ftth-lld-review.html', 'ftth-lld-versions.html'];
    const lldJs = ['js/ftth-lld-api.js', 'js/ftth-lld-review.js', 'js/ftth-lld-versions.js'];
    for (const f of [...lldPages, ...lldJs]) {
      if (bundled.has(f)) {
        console.log(`  ✅ LLD asset bundled: ${f}`);
      } else {
        failures.push(`Deploy bundle missing LLD asset: ${f}`);
      }
    }

    // Explicitly assert the self-hosted map library is bundled (the
    // frontend no longer loads maplibre from unpkg CDN, so maps depend on
    // these vendor assets being deployed)
    const vendorAssets = [
      'vendor/maplibre/maplibre-gl.js',
      'vendor/maplibre/maplibre-gl.css',
    ];
    for (const f of vendorAssets) {
      if (bundled.has(f)) {
        console.log(`  ✅ Vendor asset bundled: ${f}`);
      } else {
        failures.push(`Deploy bundle missing vendor asset: ${f}`);
      }
    }
  }
  console.log('');
}

// ── 1) JS syntax ───────────────────────────────────────────────────────
console.log('── JS syntax check ──────────────────────────────────────────');
const jsFiles = allJsFiles(BASE);
let jsOk = 0;
for (const file of jsFiles) {
  try {
    execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
    jsOk++;
  } catch (e) {
    const msg = String(e.stderr || e.message || '').split('\n').slice(0, 4).join('\n');
    failures.push(`JS syntax error in ${rel(file)}:\n${msg}`);
  }
}
console.log(`  checked ${jsFiles.length} .js files — ${jsOk} OK`);

// Inline <script> blocks in HTML (non-src) — parse each one
let inlineCount = 0;
let inlineOk = 0;
for (const html of allHtmlFiles(BASE)) {
  const src = fs.readFileSync(html, 'utf8');
  const blocks = [...src.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)];
  for (let i = 0; i < blocks.length; i++) {
    const code = blocks[i][1];
    if (!code.trim()) continue;
    inlineCount++;
    const tmp = path.join(BASE, '.ci-tmp-inline.js');
    try {
      fs.writeFileSync(tmp, code);
      execFileSync(process.execPath, ['--check', tmp], { stdio: 'pipe' });
      inlineOk++;
    } catch (e) {
      const msg = String(e.stderr || e.message || '').split('\n').slice(0, 4).join('\n');
      failures.push(`Inline <script> #${i + 1} in ${rel(html)}:\n${msg}`);
    } finally {
      if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
    }
  }
}
console.log(`  checked ${inlineCount} inline script blocks — ${inlineOk} OK`);

// ── 2) Internal link check ─────────────────────────────────────────────
console.log('── Internal link check ──────────────────────────────────────');
// Index ALL files (html/css/js/partials/engineer/...) so asset links resolve
const existing = new Set(allFilesIn(BASE).map((p) => relBase(p)));

function resolveTarget(pageRel, href) {
  // strip query/hash
  const clean = href.split('#')[0].split('?')[0];
  if (!clean || /^https?:\/\//.test(clean) || clean.startsWith('//') || clean.startsWith('mailto:') || clean.startsWith('tel:') || clean.startsWith('javascript:')) {
    return null; // external or fragment-only — skip
  }
  const pageDir = path.dirname(path.join(BASE, pageRel));
  const abs = path.resolve(pageDir, clean);
  return path.relative(BASE, abs).replace(/\\/g, '/');
}

let linkCount = 0;
const htmlPages = allHtmlFiles(BASE);
for (const html of htmlPages) {
  const pageRel = relBase(html);
  // The shared sidebar partial is injected into root-level pages, so its
  // links are relative to the root — handled separately in the Sidebar check.
  if (pageRel === 'partials/sidebar.html') continue;
  const src = fs.readFileSync(html, 'utf8');
  const hrefs = [...src.matchAll(/href=["']([^"'#]+)(?:#[^"']*)?["']/g)].map((m) => m[1]);
  for (const href of hrefs) {
    const target = resolveTarget(pageRel, href);
    if (!target) continue;
    linkCount++;
    if (!existing.has(target)) {
      failures.push(`Broken link: ${pageRel} → ${href} (${target} does not exist)`);
    }
  }
}
console.log(`  checked ${linkCount} internal links across ${htmlPages.length} pages`);

// ── 3) Sidebar pages exist ─────────────────────────────────────────────
console.log('── Sidebar check ────────────────────────────────────────────');
const sidebarPath = path.join(BASE, 'partials/sidebar.html');
if (fs.existsSync(sidebarPath)) {
  const sb = fs.readFileSync(sidebarPath, 'utf8');
  const sbLinks = [...sb.matchAll(/href=["']([^"'#]+)["']/g)].map((m) => m[1]);
  let sbCount = 0;
  for (const href of sbLinks) {
    if (/^https?:/.test(href) || href === '#') continue;
    // The sidebar is injected into root-level pages, so its links resolve
    // relative to the project root (not partials/).
    const clean = href.split('#')[0].split('?')[0];
    const abs = path.resolve(BASE, clean);
    const target = path.relative(BASE, abs).replace(/\\/g, '/');
    if (!target || target.startsWith('..')) continue;
    sbCount++;
    if (!existing.has(target)) {
      failures.push(`Sidebar broken link: ${href} does not exist`);
    }
  }
  console.log(`  checked ${sbCount} sidebar links`);
} else {
  failures.push('partials/sidebar.html missing');
}

// ── Summary ────────────────────────────────────────────────────────────
console.log('');
if (failures.length) {
  console.error(`❌ ${failures.length} problem(s) found:\n`);
  for (const f of failures) console.error('  - ' + f.split('\n').join('\n    '));
  process.exit(1);
}
console.log(`✅ ${MODE === 'source tree' ? 'Source tree' : 'Deploy bundle'} checks passed (${jsFiles.length} js files, ${inlineCount} inline blocks, ${linkCount} links).`);
if (warnings.length) {
  for (const w of warnings) console.warn('⚠ ' + w);
}
process.exit(0);
