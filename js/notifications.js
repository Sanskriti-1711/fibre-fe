/**
 * notifications.js — the shared inbox bell.
 *
 * One module, mounted by `partials/sidebar-loader.js` on every page that draws
 * the sidebar, so the bell exists everywhere without editing 30 HTML files.
 *
 * What it is for: a planner should not have to remember to open the LLD
 * Approval Queue to find out that a field engineer changed a chamber, and an
 * LLD run that failed at 2am should say so instead of waiting for somebody to
 * poll a status page. The backend decides *who* hears about *what*
 * (`notifications.service`); this file only decides how it looks.
 *
 * Design decisions worth keeping:
 *
 * - **The badge is polled, the list is not.** `GET /summary/` is two indexed
 *   counts. The list is fetched when the panel opens and only re-fetched if
 *   the last load is stale, so an idle page costs one tiny request per 45s.
 * - **Everything is text nodes.** Titles carry engineer names and free-text
 *   comments from the field; `innerHTML` with a name in it is how this panel
 *   would become an XSS sink.
 * - **A click marks read, then navigates.** Opening the thing you were told
 *   about is the acknowledgement, so there is no second "mark read" chore.
 * - **Nothing here throws into the page.** A broke inbox is a missing bell,
 *   never a broken LLD review.
 */

(function () {
  'use strict';

  var POLL_MS = 45000;
  var STALE_MS = 15000;
  var FILTERS = [
    { id: 'all', label: 'All' },
    { id: 'design', label: 'Design' },
    { id: 'survey', label: 'Survey' },
    { id: 'permits', label: 'Permits' },
  ];

  var state = {
    mounted: false,
    open: false,
    loadedAt: 0,
    filter: 'all',
    rows: [],
    unread: 0,
    byCategory: {},
    failed: false,
    busy: false,
    lastFocus: null,
    timer: null,
    fetching: null,
  };

  var els = {};

  /* ── Environment ────────────────────────────────────────────────────── */

  function apiBase() {
    if (window.FIBER_BASE_URL) return String(window.FIBER_BASE_URL).replace(/\/+$/, '');
    if (window.FTTH_BASE_URL) return String(window.FTTH_BASE_URL).replace(/\/+$/, '');
    var host = window.location.hostname;
    var local = host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0';
    return local ? 'http://localhost:8000' : 'https://fibre-backend-wml3.onrender.com';
  }

  /**
   * Where a stored notification URL is relative to.
   *
   * The backend stores frontend paths relative to the site root
   * (`ftth-lld-review.html?…`, `engineer/engineer-project-details.html?…`).
   * Pages under `/engineer/` therefore need one `../` in front of them.
   */
  function siteRoot() {
    var path = window.location.pathname.replace(/\\/g, '/');
    var depth = path.split('/').filter(Boolean).length;
    if (/\.html?$/i.test(path)) depth -= 1;
    return depth > 0 ? new Array(depth + 1).join('../') : '';
  }

  function accessToken() {
    try {
      if (window.FiberAuth && typeof window.FiberAuth.getAccess === 'function') {
        var viaModule = window.FiberAuth.getAccess();
        if (viaModule) return viaModule;
      }
    } catch (_) {
      /* fall through to storage */
    }
    try {
      var raw = window.localStorage.getItem('fiber_auth');
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      return parsed && parsed.access ? parsed.access : null;
    } catch (_) {
      return null;
    }
  }

  function refreshToken() {
    try {
      if (window.FiberApi && typeof window.FiberApi.refreshAccessToken === 'function') {
        return window.FiberApi.refreshAccessToken();
      }
      if (window.FiberAuth && typeof window.FiberAuth.refreshAccessToken === 'function') {
        return window.FiberAuth.refreshAccessToken();
      }
    } catch (_) {
      /* ignore */
    }
    return Promise.resolve(null);
  }

  /* ── HTTP ───────────────────────────────────────────────────────────── */

  function call(path, options, retried) {
    var token = accessToken();
    if (!token) return Promise.reject(new Error('not-signed-in'));

    var opts = options || {};
    var headers = new window.Headers(opts.headers || {});
    headers.set('Authorization', 'Bearer ' + token);
    if (opts.body && !headers.get('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }

    return window
      .fetch(apiBase() + path, {
        method: opts.method || 'GET',
        headers: headers,
        body: opts.body,
        credentials: 'omit',
      })
      .then(function (response) {
        if (response.status === 401 && !retried) {
          return refreshToken().then(function (fresh) {
            if (!fresh) throw new Error('unauthorized');
            return call(path, options, true);
          });
        }
        if (!response.ok) {
          var err = new Error('http-' + response.status);
          err.status = response.status;
          throw err;
        }
        return response.json();
      });
  }

  /* ── Small helpers ──────────────────────────────────────────────────── */

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = String(text);
    return node;
  }

  function timeAgo(iso) {
    if (!iso) return '';
    var then = new Date(iso);
    if (isNaN(then.getTime())) return '';
    var secs = Math.floor((Date.now() - then.getTime()) / 1000);
    if (secs < 45) return 'just now';
    if (secs < 3600) return Math.floor(secs / 60) + 'm ago';
    if (secs < 86400) return Math.floor(secs / 3600) + 'h ago';
    if (secs < 604800) return Math.floor(secs / 86400) + 'd ago';
    return then.toLocaleDateString();
  }

  function absolute(iso) {
    if (!iso) return '';
    var then = new Date(iso);
    return isNaN(then.getTime()) ? '' : then.toLocaleString();
  }

  function plural(count, one, many) {
    return count === 1 ? one : many;
  }

  /* ── Badge ──────────────────────────────────────────────────────────── */

  function paintBadge() {
    var badge = els.badge;
    var bell = els.bell;
    if (!badge || !bell) return;

    var unread = state.unread || 0;
    badge.hidden = unread === 0;
    if (unread > 9) badge.textContent = '9+';
    else badge.textContent = String(unread);

    bell.dataset.state = unread > 0 ? 'has-unread' : 'idle';
    bell.setAttribute(
      'aria-label',
      unread > 0 ? 'Notifications — ' + unread + ' unread' : 'Notifications — nothing unread'
    );
  }

  /* ── Panel chrome ───────────────────────────────────────────────────── */

  function paintFilters() {
    var host = els.filters;
    if (!host) return;
    host.textContent = '';

    FILTERS.forEach(function (spec) {
      var count = spec.id === 'all' ? state.unread : state.byCategory[spec.id] || 0;
      var button = el('button', 'notif-filter');
      button.type = 'button';
      button.dataset.filter = spec.id;
      button.setAttribute('aria-pressed', String(state.filter === spec.id));
      button.appendChild(document.createTextNode(spec.label));
      if (count > 0) {
        var chip = el('span', 'notif-filter__count', count > 99 ? '99+' : count);
        button.appendChild(chip);
        button.setAttribute('aria-label', spec.label + ' — ' + count + ' unread');
      }
      button.addEventListener('click', function () {
        if (state.filter === spec.id) return;
        state.filter = spec.id;
        paintFilters();
        render();
      });
      host.appendChild(button);
    });
  }

  function paintSub() {
    if (!els.sub) return;
    els.sub.textContent =
      state.unread > 0
        ? state.unread + ' ' + plural(state.unread, 'thing', 'things') + ' waiting on you'
        : 'You are all caught up';
    if (els.footNote) {
      els.footNote.textContent = state.rows.length ? state.rows.length + ' shown' : '';
    }
  }

  /* ── List rendering ─────────────────────────────────────────────────── */

  function skeleton() {
    var list = els.list;
    list.textContent = '';
    list.setAttribute('aria-busy', 'true');
    for (var i = 0; i < 4; i += 1) {
      var row = el('li', 'notif-skeleton');
      row.appendChild(el('div', 'notif-skeleton__line'));
      row.appendChild(el('div', 'notif-skeleton__line'));
      list.appendChild(row);
    }
  }

  function emptyState() {
    var wrap = el('div', 'notif-empty');
    if (state.failed) {
      wrap.className = 'notif-empty notif-empty--error';
      wrap.appendChild(el('h3', null, 'Could not load notifications'));
      wrap.appendChild(
        el(
          'p',
          null,
          'The inbox did not answer. Your work is unaffected — reopen this panel to try again.'
        )
      );
    } else if (state.filter !== 'all') {
      wrap.appendChild(el('h3', null, 'Nothing in this category'));
      wrap.appendChild(
        el('p', null, 'Switch to All to see everything waiting on you across the pipeline.')
      );
    } else {
      wrap.appendChild(el('h3', null, 'Inbox zero'));
      wrap.appendChild(
        el(
          'p',
          null,
          'New survey changes, review decisions and LLD runs land here the moment they happen.'
        )
      );
    }
    var item = el('li');
    item.appendChild(wrap);
    return item;
  }

  function rowNode(row) {
    var item = el('li');
    var button = el('button', 'notif-item');
    button.type = 'button';
    button.dataset.read = row.read ? 'true' : 'false';
    button.dataset.severity = row.severity || 'info';

    button.appendChild(el('span', 'notif-item__dot'));
    var body = el('span');

    body.appendChild(el('p', 'notif-item__title', row.title));

    if (row.body) body.appendChild(el('p', 'notif-item__body', row.body));

    var meta = el('span', 'notif-item__meta');
    if (row.project_name) {
      var project = el('span', 'notif-item__project', row.project_name);
      project.title = row.project_name;
      meta.appendChild(project);
    }
    if (row.kind_label) meta.appendChild(el('span', 'notif-item__kind', row.kind_label));
    var when = el('time', 'notif-item__time', timeAgo(row.created_at));
    if (row.created_at) {
      when.dateTime = row.created_at;
      when.title = absolute(row.created_at);
    }
    meta.appendChild(when);
    body.appendChild(meta);

    button.appendChild(body);
    button.addEventListener('click', function () {
      openTarget(row);
    });

    item.appendChild(button);
    return item;
  }

  function render() {
    var list = els.list;
    if (!list) return;
    list.textContent = '';

    var rows = state.rows.filter(function (row) {
      return state.filter === 'all' || row.category === state.filter;
    });

    if (state.busy) {
      skeleton();
      paintSub();
      return;
    }

    list.setAttribute('aria-busy', 'false');

    if (!rows.length) {
      list.appendChild(emptyState());
      paintSub();
      return;
    }

    rows.forEach(function (row) {
      list.appendChild(rowNode(row));
    });
    paintSub();
  }

  /* ── Data ───────────────────────────────────────────────────────────── */

  function applySummary(summary) {
    state.unread = (summary && summary.unread) || 0;
    state.byCategory = (summary && summary.by_category) || {};
    paintBadge();
    if (state.open) {
      paintFilters();
      paintSub();
    }
  }

  function loadSummary() {
    return call('/api/notifications/summary/').then(applySummary, function () {
      /* A missing badge is a quiet failure by design. */
    });
  }

  function loadList(force) {
    var fresh = state.loadedAt && Date.now() - state.loadedAt < STALE_MS;
    if (!force && fresh && state.rows.length) return Promise.resolve(state.rows);
    if (state.fetching) return state.fetching;

    state.busy = true;
    state.failed = false;
    render();

    state.fetching = call('/api/notifications/?limit=50')
      .then(function (payload) {
        state.rows = (payload && payload.notifications) || [];
        state.unread = (payload && payload.unread) || 0;
        state.loadedAt = Date.now();
        state.busy = false;
        state.failed = false;
        paintBadge();
        render();
        return state.rows;
      })
      .catch(function () {
        state.busy = false;
        state.failed = true;
        render();
        return state.rows;
      })
      .then(function (rows) {
        state.fetching = null;
        return rows;
      });

    return state.fetching;
  }

  /* ── Actions ────────────────────────────────────────────────────────── */

  function openTarget(row) {
    var markRead = row.read
      ? Promise.resolve()
      : call('/api/notifications/' + encodeURIComponent(row.id) + '/read/', {
          method: 'POST',
          body: '{}',
        }).catch(function () {
          /* Navigating matters more than the read receipt. */
        });

    markRead.then(function (result) {
      row.read = true;
      if (result && typeof result.unread === 'number') {
        state.unread = result.unread;
        paintBadge();
      }
      if (row.url) {
        window.location.href = siteRoot() + String(row.url).replace(/^\/+/, '');
      } else {
        render();
      }
    });
  }

  function markAllRead() {
    if (state.busy) return;
    var button = els.markAll;
    if (button) button.disabled = true;

    call('/api/notifications/read-all/', { method: 'POST', body: '{}' })
      .then(function (result) {
        state.unread = (result && result.unread) || 0;
        state.rows.forEach(function (row) {
          row.read = true;
        });
        state.byCategory = {};
        paintBadge();
        paintFilters();
        render();
      })
      .catch(function () {
        /* Keep the badge honest: nothing changed. */
      })
      .then(function () {
        if (button) button.disabled = false;
      });
  }

  /* ── Open / close ───────────────────────────────────────────────────── */

  function focusables() {
    if (!els.panel) return [];
    return Array.prototype.filter.call(
      els.panel.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      ),
      function (node) {
        return !node.disabled && node.offsetParent !== null;
      }
    );
  }

  function onKeydown(event) {
    if (!state.open) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
      return;
    }
    if (event.key !== 'Tab') return;

    var nodes = focusables();
    if (!nodes.length) return;
    var first = nodes[0];
    var last = nodes[nodes.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function open() {
    if (!state.open || !els.panel) {
      state.open = true;
      state.lastFocus = document.activeElement;

      if (els.scrim) {
        els.scrim.hidden = false;
      }
      els.panel.hidden = false;
      /* One frame between `hidden` and the transform, or the panel appears
         instead of sliding. */
      window.requestAnimationFrame(function () {
        if (!els.panel) return;
        els.panel.classList.add('is-open');
        if (els.scrim) els.scrim.classList.add('is-open');
      });

      if (els.bell) {
        els.bell.setAttribute('aria-expanded', 'true');
        els.bell.dataset.state = 'idle';
      }
      document.addEventListener('keydown', onKeydown, true);

      paintFilters();
      paintSub();
      render();
      loadList(true);
      if (els.close && els.close.focus) els.close.focus();
    }
  }

  function close() {
    if (!state.open || !els.panel) return;
    state.open = false;

    els.panel.classList.remove('is-open');
    if (els.scrim) els.scrim.classList.remove('is-open');
    if (els.bell) els.bell.setAttribute('aria-expanded', 'false');
    document.removeEventListener('keydown', onKeydown, true);

    window.setTimeout(function () {
      if (state.open) return;
      if (els.panel) els.panel.hidden = true;
      if (els.scrim) els.scrim.hidden = true;
    }, 280);

    if (state.lastFocus && state.lastFocus.focus) {
      try {
        state.lastFocus.focus();
      } catch (_) {
        /* the element may be gone */
      }
    }
  }

  /* ── Mount ──────────────────────────────────────────────────────────── */

  function mount() {
    els.bell = document.getElementById('notifBell');
    els.badge = document.getElementById('notifBadge');
    els.panel = document.getElementById('notifPanel');
    els.scrim = document.getElementById('notifScrim');
    els.list = document.getElementById('notifList');
    els.filters = document.getElementById('notifFilters');
    els.close = document.getElementById('notifClose');
    els.markAll = document.getElementById('notifMarkAll');
    els.sub = document.getElementById('notifPanelSub');
    els.footNote = document.getElementById('notifFootNote');

    if (!els.bell || !els.panel || state.mounted) return false;
    state.mounted = true;

    els.bell.addEventListener('click', function () {
      if (state.open) close();
      else open();
    });
    if (els.close) els.close.addEventListener('click', close);
    if (els.scrim) els.scrim.addEventListener('click', close);
    if (els.markAll) els.markAll.addEventListener('click', markAllRead);

    window.addEventListener('focus', function () {
      if (!state.open) loadSummary();
    });

    window.FiberNotifications = {
      open: open,
      close: close,
      refresh: function () {
        return loadSummary().then(function () {
          return loadList(true);
        });
      },
      unread: function () {
        return state.unread;
      },
      item: render,
      url: function (relative) {
        return siteRoot() + String(relative || '').replace(/^\/+/, '');
      },
    };

    return true;
  }

  function start() {
    if (!mount()) return;

    loadSummary().then(function () {
      if (!els.bell) return;
      /* Only reveal the bell once we know there is an inbox to show: an
         unauthenticated page should not offer it. */
      if (accessToken()) els.bell.hidden = false;
      if (state.timer) window.clearInterval(state.timer);
      state.timer = window.setInterval(function () {
        if (document.hidden || state.open) return;
        loadSummary();
      }, POLL_MS);
    });
  }

  function boot() {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', start);
    } else {
      start();
    }
  }

  boot();
})();
