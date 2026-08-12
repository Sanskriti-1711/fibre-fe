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
 * Usage: node ci/link-check.js
 * Exit code 0 = all good, 1 = problems found.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const failures = [];
const warnings = [];

function allHtmlFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'ci') continue;
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
    if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'ci') continue;
      out.push(...allJsFiles(full));
    } else if (entry.name.endsWith('.js')) {
      out.push(full);
    }
  }
  return out;
}

// ── 1) JS syntax ───────────────────────────────────────────────────────
console.log('── JS syntax check ──────────────────────────────────────────');
const jsFiles = allJsFiles(ROOT);
let jsOk = 0;
for (const file of jsFiles) {
  try {
    execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
    jsOk++;
  } catch (e) {
    const msg = String(e.stderr || e.message || '').split('\n').slice(0, 4).join('\n');
    failures.push(`JS syntax error in ${path.relative(ROOT, file)}:\n${msg}`);
  }
}
console.log(`  checked ${jsFiles.length} .js files — ${jsOk} OK`);

// Inline <script> blocks in HTML (non-src) — parse each one
let inlineCount = 0;
let inlineOk = 0;
for (const html of allHtmlFiles(ROOT)) {
  const src = fs.readFileSync(html, 'utf8');
  const blocks = [...src.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)];
  for (let i = 0; i < blocks.length; i++) {
    const code = blocks[i][1];
    if (!code.trim()) continue;
    inlineCount++;
    const tmp = path.join(ROOT, '.ci-tmp-inline.js');
    try {
      fs.writeFileSync(tmp, code);
      execFileSync(process.execPath, ['--check', tmp], { stdio: 'pipe' });
      inlineOk++;
    } catch (e) {
      const msg = String(e.stderr || e.message || '').split('\n').slice(0, 4).join('\n');
      failures.push(`Inline <script> #${i + 1} in ${path.relative(ROOT, html)}:\n${msg}`);
    } finally {
      if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
    }
  }
}
console.log(`  checked ${inlineCount} inline script blocks — ${inlineOk} OK`);

// ── 2) Internal link check ─────────────────────────────────────────────
console.log('── Internal link check ──────────────────────────────────────');
// Index ALL files (html/css/js/partials/engineer/...) so asset links resolve
const allFiles = [];
(function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === 'ci' || entry.name === '.git') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else allFiles.push(full);
  }
})(ROOT);
const existing = new Set(allFiles.map((p) => path.relative(ROOT, p).replace(/\\/g, '/')));


function resolveTarget(pageRel, href) {
  // strip query/hash
  const clean = href.split('#')[0].split('?')[0];
  if (!clean || /^https?:\/\//.test(clean) || clean.startsWith('//') || clean.startsWith('mailto:') || clean.startsWith('tel:') || clean.startsWith('javascript:')) {
    return null; // external or fragment-only — skip
  }
  const pageDir = path.dirname(path.join(ROOT, pageRel));
  const abs = path.resolve(pageDir, clean);
  return path.relative(ROOT, abs).replace(/\\/g, '/');
}

let linkCount = 0;
const htmlPages = allHtmlFiles(ROOT);
for (const html of htmlPages) {
  const rel = path.relative(ROOT, html).replace(/\\/g, '/');
  // The shared sidebar partial is injected into root-level pages, so its
  // links are relative to ROOT — handled separately in the Sidebar check.
  if (rel === 'partials/sidebar.html') continue;
  const src = fs.readFileSync(html, 'utf8');
  const hrefs = [...src.matchAll(/href=["']([^"'#]+)(?:#[^"']*)?["']/g)].map((m) => m[1]);
  for (const href of hrefs) {
    const target = resolveTarget(rel, href);
    if (!target) continue;
    linkCount++;
    if (!existing.has(target)) {
      failures.push(`Broken link: ${rel} → ${href} (${target} does not exist)`);
    }
  }
}
console.log(`  checked ${linkCount} internal links across ${htmlPages.length} pages`);

// ── 3) Sidebar pages exist ─────────────────────────────────────────────
console.log('── Sidebar check ────────────────────────────────────────────');
const sidebarPath = path.join(ROOT, 'partials/sidebar.html');
if (fs.existsSync(sidebarPath)) {
  const sb = fs.readFileSync(sidebarPath, 'utf8');
  const sbLinks = [...sb.matchAll(/href=["']([^"'#]+)["']/g)].map((m) => m[1]);
  let sbCount = 0;
  for (const href of sbLinks) {
    if (/^https?:/.test(href) || href === '#') continue;
    // The sidebar is injected into ROOT-level pages, so its links resolve
    // relative to the project root (not partials/).
    const clean = href.split('#')[0].split('?')[0];
    const abs = path.resolve(ROOT, clean);
    const target = path.relative(ROOT, abs).replace(/\\/g, '/');
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
console.log(`✅ All checks passed (${jsFiles.length} js files, ${inlineCount} inline blocks, ${linkCount} links).`);
if (warnings.length) {
  for (const w of warnings) console.warn('⚠ ' + w);
}
process.exit(0);
