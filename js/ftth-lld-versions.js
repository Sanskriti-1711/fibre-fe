/**
 * FTTH LLD — Versions Page Logic
 *
 * Shows the design version chain (HLD → Approved Survey → LLD) and the LLD
 * run history with full provenance metadata, so any LLD output can be
 * reproduced from its exact inputs.
 *
 * Requires: ftth-lld-api.js
 */
(function () {
  'use strict';

  const params = new URLSearchParams(window.location.search);
  const isDemo = params.get('demo') === '1';
  const requestedProject = params.get('project_id');
  let projectId = requestedProject || '';   // resolved to a real project in boot()

  const $ = (id) => document.getElementById(id);

  const projectNameEl = $('projectName');
  const projectIdEl = $('projectId');
  const hldVersionEl = $('hldVersion');
  const chainEl = $('versionChain');
  const runsBody = $('runsBody');
  const runsCountEl = $('runsCount');
  const emptyState = $('runsEmpty');
  const goReviewBtn = $('goReviewBtn');

  let data = null;
  let pollTimer = null;

  async function boot() {
    if (!isDemo && typeof window.FiberAuth !== 'undefined' &&
        typeof window.FiberAuth.requireLogin === 'function') {
      window.FiberAuth.requireLogin();
    }

    // No explicit project? Resolve the latest completed HLD run from the
    // real backend so the page opens with real data instead of demo stubs.
    if (!projectId && !isDemo && typeof window.FtthLldApi.resolveDefaultProject === 'function') {
      try {
        const resolved = await window.FtthLldApi.resolveDefaultProject();
        if (resolved && resolved.project_id) projectId = resolved.project_id;
      } catch (_) { /* fall through to demo default */ }
    }
    if (!projectId) projectId = 'ftth-001';

    projectIdEl.textContent = projectId;
    if (goReviewBtn) {
      goReviewBtn.href = 'ftth-lld-review.html?project_id=' + encodeURIComponent(projectId);
    }

    await refresh();
    pollTimer = setInterval(refresh, 2000); // picks up "running" LLD runs finishing
  }

  async function refresh() {
    try {
      data = await window.FtthLldApi.listVersions(projectId);
    } catch (err) {
      $('pageError').style.display = 'block';
      $('pageError').textContent = 'Failed to load versions: ' + (err.message || err);
      return;
    }
    render();
  }

  function render() {
    const project = data.project || {};
    const chain = data.version_chain || {};

    projectNameEl.textContent = project.name || projectId;
    hldVersionEl.textContent = (chain.hld && chain.hld.id) || project.hld_version || '—';

    if (data.demo) $('demoBanner').style.display = 'block';

    // ---- Version chain ----
    const hld = chain.hld || { id: 'HLD-V12', date: '—', by: 'HLD Pipeline' };
    const as = chain.approved_survey || { id: null };
    const runs = data.runs || [];
    const latestRun = runs.filter((r) => r.status === 'completed').slice(-1)[0];

    let chainHtml = '';
    chainHtml += chainStep('hld', '🏗️', 'HLD', hld.id || '—',
      (hld.date || '—') + '<br />' + esc(hld.by || ''), false);

    chainHtml += chainStep('survey', '🗂️', 'Approved Survey',
      as.id || '—',
      (as.date || 'Not created yet') + '<br />' + esc(as.by || ''),
      true); // immutable

    const lldId = latestRun ? latestRun.lld_version : '—';
    const lldDate = latestRun ? latestRun.run_date : 'Not run yet';
    chainHtml += chainStep('lld', '📐', 'LLD Output', lldId, lldDate, false);

    chainEl.innerHTML = chainHtml;

    // ---- Runs table ----
    const resolvedRuns = runs.slice().reverse();
    runsCountEl.textContent = resolvedRuns.length;
    emptyState.style.display = resolvedRuns.length ? 'none' : 'block';

    runsBody.innerHTML = '';
    resolvedRuns.forEach((r) => {
      const tr = document.createElement('tr');
      tr.innerHTML = ''
        + '<td class="mono">' + esc(r.lld_version) + '</td>'
        + '<td class="mono">' + esc(r.approved_survey_version || '—') + '</td>'
        + '<td class="mono">' + esc(r.hld_version || '—') + '</td>'
        + '<td>' + esc(r.run_date || '—') + '</td>'
        + '<td>' + esc(r.run_by || '—') + '</td>'
        + '<td class="mono">' + esc(r.algorithm_version || '—') + '</td>'
        + '<td class="mono">' + esc(r.input_dataset_version || '—') + '</td>'
        + '<td>' + runBadge(r.status) + '</td>'
        + '<td>' + (r.outputs ? r.outputs + ' files' : '—') + '</td>';
      runsBody.appendChild(tr);
    });

    // If the latest run is still running, keep polling; otherwise we can idle.
    const anyRunning = runs.some((r) => r.status === 'running');
    if (!anyRunning && pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  function chainStep(key, icon, label, id, meta, immutable) {
    return '<div class="lld-chain-step">'
      + '<span class="connector"></span>'
      + '<div class="node ' + key + '">' + icon + '</div>'
      + '<div class="v-id">' + esc(id) + (immutable ? '<span class="lock-icon">&#x1F512;</span>' : '') + '</div>'
      + '<div class="v-label">' + esc(label) + (immutable ? ' (immutable)' : '') + '</div>'
      + '<div class="v-meta">' + meta + '</div>'
      + '</div>';
  }

  function runBadge(status) {
    const s = (status || '').toLowerCase();
    if (s === 'completed') {
      return '<span class="lld-badge lld-badge-approved"><span class="dot"></span>Completed</span>';
    }
    if (s === 'running') {
      return '<span class="lld-badge lld-badge-pending"><span class="dot" style="animation:ftth-pulse 1.2s ease-in-out infinite;"></span>Running…</span>';
    }
    if (s === 'failed') {
      return '<span class="lld-badge lld-badge-rejected"><span class="dot"></span>Failed</span>';
    }
    return '<span class="lld-badge lld-badge-pending"><span class="dot"></span>' + esc(s) + '</span>';
  }

  function esc(str) {
    return String(str === undefined || str === null ? '' : str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  }

  boot();
})();
