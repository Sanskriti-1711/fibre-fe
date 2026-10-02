/**
 * FTTH LLD — Versions Page Logic
 *
 * Shows the design version chain (HLD → Approved Survey → LLD) and the LLD
 * run history with full provenance metadata, so any LLD output can be
 * reproduced from its exact inputs.
 *
 * Also renders a live progress bar while a run is in flight, and exposes
 * per-run "View Output" (MapLibre) and "Download ZIP" actions.
 *
 * Requires: ftth-lld-api.js
 */
(function () {
  'use strict';

  const params = new URLSearchParams(window.location.search);
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

  // Progress card elements
  const progressCard = $('progressCard');
  const progressVersion = $('progressVersion');
  const progressPct = $('progressPct');
  const progressFill = $('progressFill');
  const progressStage = $('progressStage');

  // Cross-run diff elements (Tier-1 A24)
  const diffFromEl = $('diffFrom');
  const diffToEl = $('diffTo');
  const diffBtn = $('diffBtn');
  const diffSummaryEl = $('diffSummary');
  const diffAiEl = $('diffAi');
  const diffTableWrap = $('diffTableWrap');
  const diffBody = $('diffBody');
  const diffEmpty = $('diffEmpty');
  let diffLoaded = false;

  let data = null;
  let pollTimer = null;

  async function boot() {
    if (typeof window.FiberAuth !== 'undefined' &&
        typeof window.FiberAuth.requireLogin === 'function') {
      window.FiberAuth.requireLogin();
    }

    // No explicit project? Resolve the latest completed HLD run from the
    // real backend so the page opens with real data.
    if (!projectId && typeof window.FtthLldApi.resolveDefaultProject === 'function') {
      try {
        const resolved = await window.FtthLldApi.resolveDefaultProject();
        if (resolved && resolved.project_id) projectId = resolved.project_id;
      } catch (_) { /* fall through */ }
    }
    if (!projectId) {
      projectIdEl.textContent = '—';
      $('pageError').style.display = 'block';
      $('pageError').textContent = 'No project selected. Open this page from a project\'s LLD Versions link.';
      return;
    }

    projectIdEl.textContent = projectId;

    await refresh();
    pollTimer = setInterval(refresh, 2000); // picks up "running" LLD runs finishing
  }

  async function refresh() {
    try {
      data = await window.FtthLldApi.listVersions(projectId);
    } catch (err) {
      $('pageError').style.display = 'block';
      $('pageError').textContent = 'Failed to load versions: ' + (FtthUI.humanize(err));
      return;
    }
    render();
  }

  function render() {
    const project = data.project || {};
    const chain = data.version_chain || {};

    projectNameEl.textContent = project.name || projectId;
    hldVersionEl.textContent = (chain.hld && chain.hld.id) || project.hld_version || '—';

    // ---- Version chain ----
    const hld = chain.hld || { id: '—', date: '—', by: '—' };
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
        + '<td>' + modeBadge(r.mode) + '</td>'
        + '<td class="mono">' + esc(r.approved_survey_version || '—') + '</td>'
        + '<td class="mono">' + esc(r.hld_version || '—') + '</td>'
        + '<td>' + esc(r.run_date || '—') + '</td>'
        + '<td>' + esc(r.run_by || '—') + '</td>'
        + '<td>' + runBadge(r.status) + '</td>'
        + '<td>' + (r.outputs != null ? r.outputs + ' layers' : '—') + '</td>'
        + '<td>' + actionsHtml(r) + '</td>';
      runsBody.appendChild(tr);
    });

    // ---- Progress card ----
    renderProgress(runs);

    // ---- Cross-run diff card ----
    renderDiffControls(runs);

    // If the latest run is still running, keep polling; otherwise we can idle.
    const anyRunning = runs.some((r) => r.status === 'running');
    if (!anyRunning && pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  // ------------------------------------------------------------------
  // Cross-run diff (Tier-1 A24)
  // ------------------------------------------------------------------
  function renderDiffControls(runs) {
    const completed = runs.filter((r) => r.status === 'completed');
    if (completed.length < 2) {
      if (diffEmpty) diffEmpty.style.display = 'block';
      if (diffBtn) diffBtn.disabled = true;
      if (diffFromEl) diffFromEl.innerHTML = '';
      if (diffToEl) diffToEl.innerHTML = '';
      return;
    }
    if (diffEmpty) diffEmpty.style.display = 'none';
    if (diffBtn) diffBtn.disabled = false;

    const prevFrom = diffFromEl.value;
    const prevTo = diffToEl.value;
    const opts = completed
      .map((r) => '<option value="' + esc(r.lld_version) + '">' + esc(r.lld_version) + '</option>')
      .join('');
    diffFromEl.innerHTML = opts;
    diffToEl.innerHTML = opts;
    // Defaults: second-newest → newest (the diff reviewers want on open).
    diffFromEl.value = (completed.some((r) => r.lld_version === prevFrom))
      ? prevFrom : (completed[1] ? completed[1].lld_version : completed[0].lld_version);
    diffToEl.value = (completed.some((r) => r.lld_version === prevTo))
      ? prevTo : completed[0].lld_version;

    // Auto-compare the default pair the first time runs are available.
    if (!diffLoaded) {
      diffLoaded = true;
      loadDiff();
    }
  }

  async function loadDiff() {
    if (!diffBtn || !diffFromEl.value || !diffToEl.value) return;
    if (diffFromEl.value === diffToEl.value) {
      diffSummaryEl.style.display = 'block';
      diffSummaryEl.textContent = 'Pick two different runs to compare.';
      diffTableWrap.style.display = 'none';
      diffAiEl.style.display = 'none';
      return;
    }
    diffBtn.disabled = true;
    diffBtn.textContent = 'Comparing…';
    try {
      const d = await window.FtthLldApi.diffVersions(projectId, diffFromEl.value, diffToEl.value);
      renderDiff(d);
    } catch (err) {
      diffSummaryEl.style.display = 'block';
      diffSummaryEl.textContent = 'Diff failed: ' + (FtthUI.humanize(err));
      diffTableWrap.style.display = 'none';
      diffAiEl.style.display = 'none';
    } finally {
      diffBtn.disabled = false;
      diffBtn.textContent = 'Compare';
    }
  }

  function renderDiff(d) {
    const totals = d.totals || {};
    diffSummaryEl.style.display = 'block';
    diffSummaryEl.innerHTML = '<strong>' + esc(d.summary || '') + '</strong>'
      + '<div style="margin-top:6px;font-size:12px;color:#4338CA;">'
      + esc(d.from.lld_version) + ' → ' + esc(d.to.lld_version)
      + ': ' + Number(totals.from_features || 0).toLocaleString() + ' → '
      + Number(totals.to_features || 0).toLocaleString() + ' features · '
      + Number(totals.from_length_m || 0).toLocaleString() + ' m → '
      + Number(totals.to_length_m || 0).toLocaleString() + ' m'
      + '</div>';

    if (d.ai_summary) {
      diffAiEl.style.display = 'block';
      diffAiEl.innerHTML = '🤖 ' + esc(d.ai_summary)
        + '<div style="margin-top:4px;font-size:11px;color:#7C3AED;">'
        + esc(d.ai_disclaimer || 'AI-generated description — verify against the table.') + '</div>';
    } else {
      diffAiEl.style.display = 'none';
    }

    const layers = d.layers || [];
    const changed = layers.filter((l) => l.status !== 'unchanged');
    const rows = (changed.length ? changed : layers);
    const statusColors = {
      added: { bg: '#ECFDF5', fg: '#047857', label: 'Added' },
      removed: { bg: '#FEF2F2', fg: '#991B1B', label: 'Removed' },
      changed: { bg: '#FFFBEB', fg: '#92400E', label: 'Changed' },
      unchanged: { bg: '#F3F4F6', fg: '#616A75', label: 'Unchanged' },
    };
    diffBody.innerHTML = '';
    rows.forEach((l) => {
      const c = statusColors[l.status] || statusColors.unchanged;
      const tr = document.createElement('tr');
      tr.innerHTML = ''
        + '<td class="mono">' + esc(l.name) + '</td>'
        + '<td>' + Number(l.from_count).toLocaleString() + ' → ' + Number(l.to_count).toLocaleString() + '</td>'
        + '<td style="font-weight:700;color:' + (l.delta_count > 0 ? '#047857' : (l.delta_count < 0 ? '#991B1B' : '#616A75')) + ';">'
        + (l.delta_count > 0 ? '+' : '') + Number(l.delta_count).toLocaleString() + '</td>'
        + '<td>' + Number(l.from_length_m).toLocaleString(undefined, { maximumFractionDigits: 1 }) + ' → '
        + Number(l.to_length_m).toLocaleString(undefined, { maximumFractionDigits: 1 }) + '</td>'
        + '<td style="font-weight:700;color:' + (l.delta_length_m > 0 ? '#047857' : (l.delta_length_m < 0 ? '#991B1B' : '#616A75')) + ';">'
        + (l.delta_length_m > 0 ? '+' : '') + Number(l.delta_length_m).toLocaleString(undefined, { maximumFractionDigits: 1 }) + '</td>'
        + '<td><span class="lld-badge" style="background:' + c.bg + ';color:' + c.fg + ';border:1px solid ' + c.bg + ';">' + c.label + '</span></td>';
      diffBody.appendChild(tr);
    });
    diffTableWrap.style.display = 'block';
  }

  if (diffBtn) diffBtn.addEventListener('click', loadDiff);

  function renderProgress(runs) {
    const running = runs.filter((r) => r.status === 'running').slice(-1)[0];
    if (!running) {
      progressCard.classList.remove('show');
      return;
    }
    // A running LLD run is never 100% — cap at 99 so the bar only fills
    // completely once the run flips to completed and leaves this branch.
    const pct = Math.min(99, Math.max(0, Number(running.progress) || 0));
    progressCard.classList.add('show');
    progressVersion.textContent = running.lld_version;
    progressPct.textContent = pct;
    progressFill.style.width = pct + '%';
    progressStage.textContent = stageText(pct);
  }

  function stageText(pct) {
    const running = (data && data.runs || []).filter((r) => r.status === 'running').slice(-1)[0];
    if (running && (running.mode || '').toLowerCase() === 'replan') {
      if (pct < 5) return 'Submitting the approved survey dataset as brownfield to the design pipeline…';
      if (pct < 20) return 'Feeding approved segments into the routing graph and re-running the shortest-route algorithm…';
      if (pct < 60) return 'Re-deriving network / trench / duct / cable design from the survey constraints…';
      if (pct < 95) return 'Validating the fresh design and packaging the re-plan output…';
      return 'Finalizing re-plan run and persisting outputs…';
    }
    if (pct < 5) return 'Submitting the approved survey dataset to the LLD engine…';
    if (pct < 20) return 'Applying approved survey changes to the HLD output…';
    if (pct < 60) return 'Validating path continuity and attribute matching…';
    if (pct < 95) return 'Writing final LLD layers and packaging the design…';
    return 'Finalizing run and persisting outputs…';
  }

  function actionsHtml(r) {
    const completed = r.status === 'completed';
    const view = completed
      ? '<a class="lld-action-btn view" href="ftth-lld-results.html?project_id=' + encodeURIComponent(projectId) + '&lld_version=' + encodeURIComponent(r.lld_version) + '">&#x1F5FA;&#xFE0F; View Output</a>'
      : '<span class="lld-action-btn view" disabled>&#x1F5FA;&#xFE0F; View Output</span>';
    const dl = completed
      ? '<button class="lld-action-btn" type="button" data-download="' + esc(r.lld_version) + '">&#x1F4E5; Download</button>'
      : '<span class="lld-action-btn" disabled>&#x1F4E5; Download</span>';
    return view + dl;
  }

  // Delegate download clicks (buttons are created dynamically).
  document.addEventListener('click', function (e) {
    const btn = e.target && e.target.closest ? e.target.closest('button[data-download]') : null;
    if (!btn) return;
    const lldVersion = btn.getAttribute('data-download');
    if (window.FtthLldApi && typeof window.FtthLldApi.downloadRunZip === 'function') {
      window.FtthLldApi.downloadRunZip(projectId, lldVersion);
    }
  });

  function chainStep(key, icon, label, id, meta, immutable) {
    return '<div class="lld-chain-step">'
      + '<span class="connector"></span>'
      + '<div class="node ' + key + '">' + icon + '</div>'
      + '<div class="v-id">' + esc(id) + (immutable ? '<span class="lock-icon">&#x1F512;</span>' : '') + '</div>'
      + '<div class="v-label">' + esc(label) + (immutable ? ' (immutable)' : '') + '</div>'
      + '<div class="v-meta">' + meta + '</div>'
      + '</div>';
  }

  function modeBadge(mode) {
    const m = (mode || 'verify').toLowerCase();
    if (m === 'replan') {
      return '<span class="lld-badge" style="background:#EEF2FF;color:#4338CA;border:1px solid #C7D2FE;">Full re-plan</span>';
    }
    return '<span class="lld-badge" style="background:#ECFDF5;color:#047857;border:1px solid #A7F3D0;">Verify</span>';
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
