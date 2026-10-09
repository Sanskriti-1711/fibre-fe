(function () {
  'use strict';

  if (window.FiberAuth && window.FiberAuth.requireLogin) {
    window.FiberAuth.requireLogin();
  }

  /* ── tiny helpers ─────────────────────────────────────────────── */
  function $(id) {
    return document.getElementById(id);
  }
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
  function fmtDate(iso) {
    if (!iso) return '—';
    try {
      var d = new Date(iso);
      if (isNaN(d.getTime())) return '—';
      return d.toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch (_) {
      return '—';
    }
  }
  function daysAgo(iso) {
    if (!iso) return -1;
    var t = new Date(iso).getTime();
    if (isNaN(t)) return -1;
    return Math.max(0, Math.floor((Date.now() - t) / 86400000));
  }
  function asArray(x) {
    return Array.isArray(x) ? x : x && Array.isArray(x.results) ? x.results : [];
  }

  /* ── live clock ───────────────────────────────────────────────── */
  function tickClock() {
    var now = new Date();
    var t = $('heroTime');
    if (t) t.textContent = now.toLocaleTimeString(undefined, { hour12: false });
    var d = $('heroDate');
    if (d)
      d.textContent = now.toLocaleDateString(undefined, {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      });
  }
  setInterval(tickClock, 1000);
  tickClock();

  (function greet() {
    var h = new Date().getHours();
    var msg =
      h < 5
        ? 'Night shift running'
        : h < 12
          ? 'Good morning'
          : h < 17
            ? 'Good afternoon'
            : 'Good evening';
    var el = $('heroHello');
    if (el) el.textContent = msg + ' · FTTH Network Ops';
  })();

  /* ── canvas helpers ───────────────────────────────────────────── */
  function prepCanvas(cv, cssW, cssH) {
    var dpr = window.devicePixelRatio || 1;
    cv.style.width = cssW + 'px';
    cv.style.height = cssH + 'px';
    cv.width = Math.round(cssW * dpr);
    cv.height = Math.round(cssH * dpr);
    var ctx = cv.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return ctx;
  }

  function drawDonut(cv, segments, center, sub) {
    var w = 220,
      h = 170;
    var ctx = prepCanvas(cv, w, h);
    ctx.clearRect(0, 0, w, h);
    var cx = w / 2,
      cy = h / 2 - 4,
      r = 56,
      lw = 15;
    var total = segments.reduce(function (s, x) {
      return s + (x.value || 0);
    }, 0);
    // soft backdrop ring
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.strokeStyle = '#F1F3F5';
    ctx.lineWidth = lw;
    ctx.stroke();
    if (total > 0) {
      var start = -Math.PI / 2;
      segments.forEach(function (seg) {
        if (!seg.value) return;
        var ang = (seg.value / total) * Math.PI * 2;
        ctx.beginPath();
        ctx.arc(cx, cy, r, start, start + ang - 0.015);
        ctx.strokeStyle = seg.color;
        ctx.lineWidth = lw;
        ctx.lineCap = 'round';
        ctx.stroke();
        start += ang;
      });
    }
    ctx.fillStyle = '#111827';
    ctx.font = '800 26px system-ui';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(center), cx, cy - 5);
    ctx.fillStyle = '#616A75';
    ctx.font = '600 11px system-ui';
    ctx.fillText(sub || '', cx, cy + 17);
  }

  function drawSpark(cv, values, color) {
    var w = 110,
      h = 38;
    var ctx = prepCanvas(cv, w, h);
    ctx.clearRect(0, 0, w, h);
    values = (values || []).filter(function (v) {
      return v != null;
    });
    if (values.length < 2) {
      // flat baseline
      values = values.length === 1 ? [0, values[0]] : [0, 0];
    }
    var max = Math.max.apply(null, values.concat([1]));
    var step = w / (values.length - 1);
    ctx.beginPath();
    values.forEach(function (v, i) {
      var x = i * step,
        y = h - 3 - ((v || 0) / max) * (h - 8);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.8;
    ctx.lineJoin = 'round';
    ctx.stroke();
    ctx.lineTo(w, h);
    ctx.lineTo(0, h);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.1;
    ctx.fill();
    ctx.globalAlpha = 1;
    // end dot
    var lx = (values.length - 1) * step,
      ly = h - 3 - ((values[values.length - 1] || 0) / max) * (h - 8);
    ctx.beginPath();
    ctx.arc(lx, ly, 2.6, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.globalAlpha = 1;
    ctx.fill();
  }

  function dailySeries(items, getTime) {
    var out = [];
    var now = Date.now();
    for (var d = 13; d >= 0; d--) {
      var dayStart = new Date(now - d * 86400000);
      dayStart.setHours(0, 0, 0, 0);
      var dayEnd = dayStart.getTime() + 86400000;
      var n = 0;
      items.forEach(function (it) {
        var t = new Date(getTime(it)).getTime();
        if (!isNaN(t) && t >= dayStart.getTime() && t < dayEnd) n++;
      });
      out.push(n);
    }
    return out;
  }

  /* ── state ────────────────────────────────────────────────────── */
  var state = { hld: null, queue: null, total: null, permits: null, allProjects: null };
  var health = { hld: 'idle', queue: 'idle', permits: 'idle', total: 'idle' };
  var loading = false;

  function countUp(el, target, suffix) {
    if (!el) return;
    if (!FtthUI.motionOk()) {
      el.textContent = String(target) + (suffix || '');
      return;
    }
    suffix = suffix || '';
    var start = 0,
      dur = 600,
      t0 = null;
    function step(ts) {
      if (!t0) t0 = ts;
      var p = Math.min(1, (ts - t0) / dur);
      var eased = 1 - Math.pow(1 - p, 3);
      el.textContent = Math.round(start + (target - start) * eased) + suffix;
      if (p < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  /* ── loaders ────────────────────────────────────────────────────
     Each loader reports pass or fail. A failure is recorded, never
     silently replaced with an empty array, so the renderer can show
     "we could not reach this" instead of "there is nothing here".

     The error itself is kept on health.<key>Err. Discarding it was what
     made every failure read as a generic outage: the renderer had nothing
     to classify, so a dead session and a dead server produced the same
     "check that the API is running" advice. */
  async function loadHld() {
    health.hld = 'loading';
    health.hldErr = null;
    try {
      state.hld = asArray(
        await FtthUI.withTimeout(window.FtthApi.listProjects(200), 12000, 'HLD projects')
      );
      health.hld = 'ok';
    } catch (e) {
      health.hld = 'fail';
      health.hldErr = e;
      state.hld = null;
    }
  }

  async function loadQueue() {
    health.queue = 'loading';
    health.queueErr = null;
    try {
      var lp = await FtthUI.withTimeout(
        window.FtthLldApi.listProjects(),
        12000,
        'Survey approval queue'
      );
      state.queue = (lp && lp.projects) || [];
      health.queue = 'ok';
    } catch (e) {
      health.queue = 'fail';
      health.queueErr = e;
      state.queue = null;
    }
  }

  async function loadTotal() {
    health.total = 'loading';
    health.totalErr = null;
    try {
      var data = asArray(
        await FtthUI.withTimeout(window.FiberApi.listProjects(), 12000, 'Projects')
      );
      state.total = data.length;
      state.allProjects = data;
      health.total = 'ok';
    } catch (e) {
      health.total = 'fail';
      health.totalErr = e;
      state.total = null;
      state.allProjects = null;
    }
  }

  async function loadPermits() {
    health.permits = 'loading';
    health.permitsErr = null;
    try {
      state.permits = await FtthUI.withTimeout(
        window.FtthLldApi.getPermitSummary(),
        20000,
        'Permit analysis'
      );
      health.permits = 'ok';
    } catch (e) {
      health.permits = 'fail';
      health.permitsErr = e;
      state.permits = null;
    }
  }

  /* ── renderers ────────────────────────────────────────────────── */

  /* Each stage renders one of three truths, never conflated:
     "we could not reach this" (null) vs "there is nothing here" ([]). */
  function stageValue(healthKey, el, text) {
    var el2 = $(el);
    if (!el2) return;
    if (health[healthKey] === 'fail') {
      el2.textContent = '—';
      el2.classList.add('value-unknown');
      el2.setAttribute('title', 'Could not load — the design service is unreachable');
    } else {
      el2.textContent = text;
      el2.classList.remove('value-unknown');
      el2.removeAttribute('title');
    }
  }

  function stageBadge(healthKey, id, liveText, idleText) {
    var b = $(id);
    if (!b) return;
    if (health[healthKey] === 'fail') {
      b.textContent = 'OFFLINE';
      b.className = 'stage-badge offline';
    } else {
      b.textContent = liveText;
      b.className = 'stage-badge live';
    }
  }

  function renderRail() {
    /* `health` decides what the operator is told; the arrays are only
       used for arithmetic, so a failed load is safe to treat as zero
       here because stageValue/stageBadge suppress the misleading 0. */
    var hld = state.hld || [],
      queue = state.queue || [];

    var hldDone = hld.filter(function (p) {
      return String(p.status || '').indexOf('complete') !== -1;
    }).length;
    var hldBusy = hld.length - hldDone;
    stageValue('hld', 'hldCount', String(hld.length));
    $('hldSub').textContent = hld.length
      ? hldDone + ' completed · ' + hldBusy + ' in progress'
      : 'No HLD runs yet — upload one to start';
    stageBadge('hld', 'hldBadge', hldBusy ? 'LIVE' : 'IDLE', 'IDLE');

    var pendingAll = queue.reduce(function (s, p) {
      return s + (p.pending || 0);
    }, 0);
    var readyCount = queue.filter(function (p) {
      return p.ready;
    }).length;
    stageValue('queue', 'surveyCount', String(queue.length));
    $('surveySub').textContent = queue.length
      ? pendingAll + ' pending · ' + readyCount + ' ready for LLD'
      : 'No survey changes yet';
    stageBadge('queue', 'surveyBadge', pendingAll ? 'LIVE' : 'IDLE', 'IDLE');
  }

  function kpiValue(healthKey, id, noteId, value, note, spark, sparkColor, series) {
    if (health[healthKey] === 'fail') {
      var v = $(id);
      if (v) {
        v.textContent = '—';
        v.classList.add('value-unknown');
        v.setAttribute('title', 'Could not load');
      }
      if ($(noteId)) {
        $(noteId).textContent = 'unavailable';
      }
      drawSpark($(spark), [null, null], sparkColor);
      return;
    }
    var el = $(id);
    if (el) el.classList.remove('value-unknown');
    countUp(el, value);
    if ($(noteId)) $(noteId).textContent = note;
    drawSpark($(spark), series, sparkColor);
  }

  function renderKpis() {
    var hld = state.hld || [],
      queue = state.queue || [];

    var hldDone = hld.filter(function (p) {
      return String(p.status || '').indexOf('complete') !== -1;
    }).length;
    kpiValue(
      'hld',
      'kpiHld',
      'kpiHldNote',
      hld.length,
      hldDone + ' completed',
      'sparkHld',
      '#6366F1',
      dailySeries(hld, function (p) {
        return p.created_at;
      })
    );

    var pending = queue.reduce(function (s, p) {
      return s + (p.pending || 0);
    }, 0);
    var readyCount = queue.filter(function (p) {
      return p.ready;
    }).length;
    kpiValue(
      'queue',
      'kpiPending',
      'kpiPendingNote',
      pending,
      readyCount + ' projects LLD-ready',
      'sparkPending',
      '#047857',
      queue.map(function (p) {
        return p.pending || 0;
      })
    );

    kpiValue(
      'total',
      'kpiTotal',
      'kpiTotalNote',
      state.total,
      'across all stage flags',
      'sparkTotal',
      '#E31837',
      dailySeries(state.allProjects || [], function (p) {
        return p.created_at;
      })
    );

    var pm = state.permits;
    if (health.permits === 'fail') {
      kpiValue('permits', 'kpiPermit', 'kpiPermitNote', 0, '', 'sparkPermit', '#92400E', []);
    } else if (pm && (pm.total || pm.total_groups)) {
      var groups = pm.total_groups || pm.total;
      var readyN = pm.ready || 0;
      var identN = (pm.group_by_status && pm.group_by_status.identified) || 0;
      kpiValue(
        'permits',
        'kpiPermit',
        'kpiPermitNote',
        groups,
        readyN +
          ' ready · ' +
          identN +
          ' identified · ' +
          (pm.projects_with_permits || 0) +
          ' project(s) · ' +
          pm.total +
          ' sections',
        'sparkPermit',
        '#92400E',
        (pm.projects || []).map(function (p) {
          return p.groups || p.permits || 0;
        })
      );
    } else {
      kpiValue(
        'permits',
        'kpiPermit',
        'kpiPermitNote',
        0,
        'no analysis run yet',
        'sparkPermit',
        '#92400E',
        [0]
      );
    }
  }

  /* A chart whose data failed is not a chart with zero data. It says so
     in the same box, and the surrounding card keeps its shape. */
  /* The reason a panel failed, in words that name the actual cause. The
     error is passed through, not discarded: a 401 must not be reported as
     "check that the API is running". */
  function whyFailed(healthKey) {
    return FtthUI.errorMessage(health[healthKey + 'Err']);
  }

  /* A "Try again" button is only honest when retrying could plausibly work.
     A 401 that already ran its token refresh will fail identically forever,
     so we send the user to sign in instead of offering a dead-end button. */
  function failureAction(healthKey) {
    var err = health[healthKey + 'Err'];
    var kind = FtthUI.errorKind(err);
    if (kind === 'unauthorized') {
      return '<a class="panel-state__action" href="index.html">Sign in again →</a>';
    }
    return (
      '<button type="button" class="panel-state__retry" data-retry="' +
      esc(healthKey) +
      '">Try again</button>'
    );
  }

  function wireRetries(root) {
    (root || document).querySelectorAll('[data-retry]').forEach(function (b) {
      b.addEventListener('click', loadAll);
    });
  }

  function chartUnavailable(hintId, legendId, canvasId, what, healthKey) {
    var hint = $(hintId);
    if (hint) hint.textContent = 'unavailable';
    var cv = $(canvasId);
    if (cv) {
      cv.style.visibility = 'hidden';
    }
    var lg = $(legendId);
    if (lg) {
      lg.innerHTML =
        '<div class="panel-state panel-state--error" style="padding:18px 14px;">' +
        '<p class="panel-state__title">Can’t load ' +
        esc(what) +
        '</p>' +
        '<p class="panel-state__body">' +
        esc(whyFailed(healthKey)) +
        '</p>' +
        failureAction(healthKey) +
        '</div>';
      wireRetries(lg);
    }
  }

  function chartAvailable(canvasId) {
    var cv = $(canvasId);
    if (cv) cv.style.visibility = '';
  }

  function renderDonuts() {
    // HLD status donut
    var hld = state.hld;
    if (hld === null) {
      chartUnavailable('hldChartHint', 'legendHld', 'donutHld', 'HLD pipeline status', 'hld');
    } else {
      chartAvailable('donutHld');
      var comp = hld.filter(function (p) {
        return String(p.status || '').indexOf('complete') !== -1;
      }).length;
      var run = hld.filter(function (p) {
        return /run|progress|queue/.test(String(p.status || ''));
      }).length;
      var fail = hld.filter(function (p) {
        return String(p.status || '').indexOf('fail') !== -1;
      }).length;
      var other = hld.length - comp - run - fail;
      var hldSegs = [
        { label: 'Completed', value: comp, color: '#047857' },
        { label: 'In progress', value: run, color: '#B45309' },
        { label: 'Failed', value: fail, color: '#EF4444' },
        { label: 'Other', value: other, color: '#6B7280' },
      ];
      drawDonut($('donutHld'), hldSegs, hld.length, 'projects');
      $('hldChartHint').textContent = hld.length + ' HLD runs';
      $('legendHld').innerHTML = hldSegs
        .map(function (s) {
          var pct = hld.length ? Math.round((s.value / hld.length) * 100) : 0;
          return (
            '<div class="lg-row"><span class="lg-swatch" style="background:' +
            s.color +
            '"></span>' +
            s.label +
            '<span class="lg-pct">' +
            pct +
            '%</span><span class="lg-val">' +
            s.value +
            '</span></div>'
          );
        })
        .join('');
    }

    // queue status donut
    var queue = state.queue;
    if (queue === null) {
      chartUnavailable(
        'queueChartHint',
        'legendQueue',
        'donutQueue',
        'survey review status',
        'queue'
      );
    } else {
      chartAvailable('donutQueue');
      var qApproved = queue.reduce(function (s, p) {
        return s + (p.approved || 0);
      }, 0);
      var qRejected = queue.reduce(function (s, p) {
        return s + (p.rejected || 0);
      }, 0);
      var qNeeds = queue.reduce(function (s, p) {
        return s + (p.needs_correction || 0);
      }, 0);
      var qPending = queue.reduce(function (s, p) {
        return s + (p.pending || 0);
      }, 0);
      var qTotal = qApproved + qRejected + qNeeds + qPending;
      var qSegs = [
        { label: 'Approved', value: qApproved, color: '#047857' },
        { label: 'Rejected', value: qRejected, color: '#EF4444' },
        { label: 'Needs correction', value: qNeeds, color: '#B45309' },
        { label: 'Pending', value: qPending, color: '#6B7280' },
      ];
      drawDonut($('donutQueue'), qSegs, qTotal, 'changes');
      $('queueChartHint').textContent = qTotal + ' changes · ' + queue.length + ' projects';
      $('legendQueue').innerHTML = qSegs
        .map(function (s) {
          var pct = qTotal ? Math.round((s.value / qTotal) * 100) : 0;
          return (
            '<div class="lg-row"><span class="lg-swatch" style="background:' +
            s.color +
            '"></span>' +
            s.label +
            '<span class="lg-pct">' +
            pct +
            '%</span><span class="lg-val">' +
            s.value +
            '</span></div>'
          );
        })
        .join('');
    }

    // LLD runs bars
    var runs = state.runs;
    var barEl = $('lldBars');
    if (runs === null) {
      $('lldChartHint').textContent = 'unavailable';
      barEl.innerHTML =
        '<div class="panel-state panel-state--error" style="padding:18px 14px;">' +
        '<p class="panel-state__title">Can’t load LLD runs</p>' +
        '<p class="panel-state__body">' +
        esc(whyFailed('runs')) +
        '</p>' +
        failureAction('runs') +
        '</div>';
      wireRetries(barEl);
      return;
    }
    $('lldChartHint').textContent = runs.length + ' runs';
    if (!runs.length) {
      barEl.innerHTML =
        '<div class="dash-bar-empty">No LLD runs yet — run LLD after survey approval.</div>';
      return;
    }
    var byProject = {};
    runs.forEach(function (r) {
      var key = r.project_id || r.project_name;
      if (!byProject[key]) byProject[key] = { name: r.project_name || r.project_id, n: 0 };
      byProject[key].n++;
    });
    var rows = Object.keys(byProject)
      .map(function (k) {
        return byProject[k];
      })
      .sort(function (a, b) {
        return b.n - a.n;
      })
      .slice(0, 7);
    var maxN = Math.max.apply(
      null,
      rows
        .map(function (r) {
          return r.n;
        })
        .concat([1])
    );
    barEl.innerHTML = rows
      .map(function (r, i) {
        return (
          '<div class="dash-bar-row" style="animation-delay:' +
          i * 60 +
          'ms">' +
          '<span class="bar-label" title="' +
          esc(r.name) +
          '">' +
          esc(r.name) +
          '</span>' +
          '<span class="bar-track"><span class="bar-fill" data-w="' +
          Math.round((r.n / maxN) * 100) +
          '%"></span></span>' +
          '<span class="bar-val">' +
          r.n +
          '</span></div>'
        );
      })
      .join('');
    requestAnimationFrame(function () {
      barEl.querySelectorAll('.bar-fill').forEach(function (f) {
        f.style.width = f.getAttribute('data-w');
      });
    });
  }

  function renderQueueTable(filter) {
    var tbody = $('queueBody');

    if (state.queue === null) {
      $('queueHint').textContent = 'unavailable';
      tbody.innerHTML =
        '<tr><td colspan="9"><div class="panel-state panel-state--error">' +
        '<p class="panel-state__title">Can’t load the approval queue</p>' +
        '<p class="panel-state__body">' +
        esc(whyFailed('queue')) +
        '</p>' +
        failureAction('queue') +
        '</div></td></tr>';
      wireRetries(tbody);
      return;
    }

    var queue = state.queue.slice();
    if (filter) {
      var q = filter.toLowerCase();
      queue = queue.filter(function (p) {
        return (
          String(p.name || '')
            .toLowerCase()
            .indexOf(q) !== -1
        );
      });
    }
    var pendingAll = state.queue.reduce(function (s, p) {
      return s + (p.pending || 0);
    }, 0);
    $('queueHint').textContent =
      state.queue.length + ' projects · ' + pendingAll + ' pending reviews';

    if (!queue.length) {
      tbody.innerHTML =
        '<tr><td colspan="9"><div class="dash-empty">' +
        (state.queue.length
          ? 'No projects match your search.'
          : 'No projects in the approval queue yet.') +
        '</div></td></tr>';
      return;
    }
    tbody.innerHTML = '';
    queue.forEach(function (p, i) {
      var total = p.total || 0;
      var resolved = (p.approved || 0) + (p.rejected || 0);
      var pct = total ? Math.round((resolved / total) * 100) : 0;
      var ready = p.ready;
      var tr = document.createElement('tr');
      tr.style.animation = 'dash-fadein 0.4s ease ' + i * 40 + 'ms both';
      tr.innerHTML =
        '<td style="font-weight:700;">' +
        esc(p.name || p.project_id) +
        '</td>' +
        '<td style="font-variant-numeric:tabular-nums;">' +
        (p.total || 0) +
        '</td>' +
        '<td style="color:#047857;font-weight:700;font-variant-numeric:tabular-nums;">' +
        (p.approved || 0) +
        '</td>' +
        '<td style="color:#B91C1C;font-weight:700;font-variant-numeric:tabular-nums;">' +
        (p.rejected || 0) +
        '</td>' +
        '<td style="color:#B45309;font-weight:700;font-variant-numeric:tabular-nums;">' +
        (p.needs_correction || 0) +
        '</td>' +
        '<td style="color:#616A75;font-variant-numeric:tabular-nums;">' +
        (p.pending || 0) +
        '</td>' +
        '<td><div class="dash-progress"><span class="track"><span class="fill" data-w="' +
        pct +
        '%"></span></span><span class="pct">' +
        pct +
        '%</span></div></td>' +
        '<td><span class="dash-pill ' +
        (ready ? 'ready' : 'review') +
        '">' +
        (ready ? 'LLD READY' : 'REVIEWING') +
        '</span></td>' +
        '<td><a class="action-link" href="ftth-survey-changes.html?project_id=' +
        encodeURIComponent(p.project_id) +
        '">Review →</a></td>';
      tbody.appendChild(tr);
      requestAnimationFrame(function () {
        tr.querySelectorAll('.fill').forEach(function (f) {
          f.style.width = f.getAttribute('data-w');
        });
      });
    });
  }

  function renderTimeline() {
    var events = [];
    (state.hld || []).forEach(function (p) {
      events.push({
        t: p.created_at,
        kind: 'hld',
        icon: '🏗️',
        title:
          'HLD pipeline ' +
          (String(p.status || '').indexOf('complete') !== -1 ? 'completed' : 'created'),
        sub: p.name || p.project_id,
        link: 'ftth-hld-results.html?project_id=' + encodeURIComponent(p.project_id),
        linkText: 'View results',
      });
    });
    (state.runs || []).forEach(function (r) {
      var done = String(r.status || '').indexOf('complete') !== -1;
      events.push({
        t: r.run_date,
        kind: 'lld',
        icon: '📐',
        title:
          (done ? 'LLD ' : 'LLD run ') + (r.lld_version || '') + (done ? ' completed' : ' started'),
        sub: r.project_name || r.project_id + (r.run_by ? ' · by ' + r.run_by : ''),
        link: 'ftth-lld-outputs.html',
        linkText: 'View outputs',
      });
    });
    events.sort(function (a, b) {
      return new Date(b.t) - new Date(a.t);
    });
    events = events.slice(0, 10);

    var tl = $('timeline');

    if (state.hld === null && state.runs === null) {
      $('activityHint').textContent = 'unavailable';
      // Two loaders feed this panel; report whichever failure we can name.
      var activityKey = health.hld === 'fail' ? 'hld' : 'runs';
      tl.innerHTML =
        '<div class="panel-state panel-state--error">' +
        '<p class="panel-state__title">Can’t load activity</p>' +
        '<p class="panel-state__body">' +
        esc(whyFailed(activityKey)) +
        '</p>' +
        failureAction(activityKey) +
        '</div>';
      wireRetries(tl);
      return;
    }

    if (!events.length) {
      $('activityHint').textContent = '0 events';
      tl.innerHTML =
        '<div class="panel-state panel-state--empty">' +
        '<p class="panel-state__title">No runs yet</p>' +
        '<p class="panel-state__body">Upload an HLD area to start the pipeline. Every run will appear here.</p>' +
        '<a class="panel-state__action" href="ftth-hld.html">Upload HLD →</a></div>';
      return;
    }
    $('activityHint').textContent = events.length + ' events';
    tl.innerHTML = events
      .map(function (e) {
        return (
          '<div class="dash-tl-item">' +
          '<div class="dash-tl-rail"><span class="dash-tl-dot ' +
          e.kind +
          '">' +
          e.icon +
          '</span></div>' +
          '<div class="dash-tl-body"><div class="dash-tl-title">' +
          esc(e.title) +
          '</div>' +
          '<div class="dash-tl-sub">' +
          esc(e.sub) +
          '</div>' +
          '<div class="dash-tl-time">' +
          fmtDate(e.t) +
          ' · ' +
          daysAgo(e.t) +
          'd ago</div>' +
          '<a class="dash-tl-link" href="' +
          e.link +
          '">' +
          esc(e.linkText) +
          ' →</a></div></div>'
        );
      })
      .join('');
  }

  var ENDPOINT_LABEL = {
    hld: 'HLD projects',
    queue: 'Survey approval queue',
    runs: 'LLD runs',
    permits: 'Permit analysis',
    total: 'Projects',
  };

  function renderStatus() {
    var el = $('heroStatus'),
      txt = $('heroStatusText');
    var failed = Object.keys(health).filter(function (k) {
      return health[k] === 'fail';
    });
    var total = Object.keys(health).length;
    el.className = 'dash-status';

    if (failed.length === 0) {
      el.classList.add('ok');
      txt.textContent = 'All ' + total + ' services responding';
    } else if (failed.length < total) {
      el.classList.add('warn');
      txt.textContent =
        failed.length +
        ' of ' +
        total +
        ' unreachable: ' +
        failed
          .map(function (k) {
            return ENDPOINT_LABEL[k];
          })
          .join(', ');
    } else {
      el.classList.add('down');
      txt.textContent = 'Design service unreachable — showing last known data';
    }
  }

  function describeCharts() {
    var hld = state.hld,
      queue = state.queue,
      runs = state.runs;

    if (hld === null) {
      FtthUI.describeCanvas($('donutHld'), 'HLD pipeline status. Could not load this chart.');
    } else {
      var comp = hld.filter(function (p) {
        return String(p.status || '').indexOf('complete') !== -1;
      }).length;
      FtthUI.describeCanvas(
        $('donutHld'),
        'HLD pipeline status donut. ' + hld.length + ' HLD runs, ' + comp + ' completed.'
      );
    }

    if (queue === null) {
      FtthUI.describeCanvas($('donutQueue'), 'Survey review status. Could not load this chart.');
    } else {
      var qPending = queue.reduce(function (s, p) {
        return s + (p.pending || 0);
      }, 0);
      FtthUI.describeCanvas(
        $('donutQueue'),
        'Survey review status donut. ' +
          qPending +
          ' changes still pending across ' +
          queue.length +
          ' projects.'
      );
    }

    FtthUI.describeCanvas($('sparkHld'), 'Fourteen-day trend of HLD runs created.');
    FtthUI.describeCanvas($('sparkPending'), 'Pending review count per project.');
    FtthUI.describeCanvas($('sparkLld'), 'Fourteen-day trend of LLD runs started.');
    FtthUI.describeCanvas($('sparkTotal'), 'Fourteen-day trend of projects created.');
    FtthUI.describeCanvas($('sparkPermit'), 'Permit groups per project.');
  }

  /* ── master loader ────────────────────────────────────────────── */
  async function loadAll() {
    if (loading) return;
    loading = true;
    var btn = $('btnRefresh');
    btn.classList.add('is-busy');
    btn.disabled = true;

    await Promise.all([loadHld(), loadQueue(), loadRuns(), loadPermits(), loadTotal()]);

    try {
      renderRail();
      renderKpis();
      renderDonuts();
      renderQueueTable($('queueSearch').value.trim());
      renderTimeline();
      renderStatus();
      describeCharts();
    } catch (renderErr) {
      console.error('Dashboard render failed:', renderErr);
      FtthUI.toast('The dashboard could not draw its figures. Try refreshing.', 'error');
    }

    var failed = Object.keys(health).filter(function (k) {
      return health[k] === 'fail';
    });
    if (failed.length) {
      FtthUI.toast(
        failed.length === Object.keys(health).length
          ? 'Design service unreachable — the figures below could not be loaded.'
          : failed.length +
              ' of 5 services unreachable: ' +
              failed
                .map(function (k) {
                  return ENDPOINT_LABEL[k];
                })
                .join(', ') +
              '.',
        'error'
      );
    }

    loading = false;
    btn.classList.remove('is-busy');
    btn.disabled = false;
  }

  /* ── wire up ──────────────────────────────────────────────────── */
  $('btnRefresh').addEventListener('click', loadAll);
  $('queueSearch').addEventListener('input', function () {
    renderQueueTable(this.value.trim());
  });

  // subtle stagger reveal for the sections
  var cards = document.querySelectorAll('.dash-card, .dash-stage, .dash-kpi');
  if (FtthUI.motionOk()) {
    cards.forEach(function (c, i) {
      if (c.classList.contains('dash-fade')) {
        c.style.animationDelay = i * 40 + 'ms';
        c.style.animationDuration = '0.45s';
      }
    });
  }

  loadAll();

  /* Auto-refresh pauses when the tab is hidden. The old unconditional
     setInterval kept rebuilding #queueBody for nobody. */
  var poller = FtthUI.poll(loadAll, 30000);
  poller.start();
})();
