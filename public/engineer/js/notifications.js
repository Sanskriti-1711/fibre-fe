/**
 * engineer/js/notifications.js — the field engineer's inbox.
 *
 * Two jobs:
 *
 * 1. **Tell the engineer something is waiting.** Every engineer page gets a
 *    bell in the dark top bar and a count on the Notifications tab of the
 *    bottom nav, so an assignment, a rejection or a correction request is
 *    visible from whatever screen they are on. The badge is a 45s poll of a
 *    two-count endpoint.
 * 2. **Render the inbox.** `EngineerInbox.render(container)` draws the list on
 *    `engineer-notifications.html`, so the badge and the page cannot disagree
 *    about what is unread.
 *
 * The backend scopes every response to the caller; no engineer id is sent.
 * A missing inbox degrades to no bell — it never breaks the field screens.
 */

(function () {
  'use strict';

  var POLL_MS = 45000;
  var FILTERS = [
    { id: 'all', label: 'All' },
    { id: 'survey', label: 'My work' },
    { id: 'design', label: 'Design' },
  ];

  var state = {
    unread: 0,
    byCategory: {},
    rows: [],
    filter: 'all',
    loading: false,
    failed: false,
    timer: null,
    container: null,
  };

  /* ── Helpers ────────────────────────────────────────────────────────── */

  function api() {
    return window.FiberApi || null;
  }

  function signedIn() {
    try {
      if (window.FiberAuth && window.FiberAuth.isLoggedIn && window.FiberAuth.isLoggedIn()) {
        return true;
      }
    } catch (_) {
      /* fall through to storage */
    }
    /* A page that loads only js/api.js still has a session in localStorage;
       the bell should not go dark just because the auth module differs. */
    try {
      var parsed = JSON.parse(window.localStorage.getItem('fiber_auth') || 'null');
      return Boolean(parsed && parsed.access);
    } catch (_) {
      return false;
    }
  }

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

  function ensureStylesheet() {
    if (document.querySelector('link[data-inbox-css]')) return;
    var link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'notifications.css';
    link.setAttribute('data-inbox-css', 'css');
    document.head.appendChild(link);
  }

  /* ── Badge ──────────────────────────────────────────────────────────── */

  function paintBadge() {
    var unread = state.unread || 0;
    var label = unread > 9 ? '9+' : String(unread);

    var bellBadge = document.querySelector('.top-bar .notif-bell__badge');
    if (bellBadge) {
      bellBadge.hidden = unread === 0;
      bellBadge.textContent = label;
    }

    var navBadge = document.querySelector('.mobile-nav a .notif-nav-badge');
    if (navBadge) {
      navBadge.hidden = unread === 0;
      navBadge.textContent = label;
    }

    var bell = document.querySelector('.top-bar .notif-bell');
    if (bell) {
      bell.setAttribute(
        'aria-label',
        unread > 0 ? 'Notifications — ' + unread + ' unread' : 'Notifications'
      );
    }

    var count = document.getElementById('inboxCount');
    if (count) {
      count.textContent = unread > 0 ? unread + ' unread' : 'All caught up';
    }
  }

  function refreshBadge() {
    var client = api();
    if (!client || !client.getNotificationSummary) return Promise.resolve();
    return client
      .getNotificationSummary()
      .then(function (summary) {
        state.unread = (summary && summary.unread) || 0;
        state.byCategory = (summary && summary.by_category) || {};
        paintBadge();
      })
      .catch(function () {
        /* silent: a badge is not worth an error state in the field */
      });
  }

  /* ── Bell mount ─────────────────────────────────────────────────────── */

  function mountBell(bar) {
    if (!bar || bar.querySelector('.notif-bell')) return;

    var link = document.createElement('a');
    link.className = 'notif-bell';
    link.href = 'engineer-notifications.html';
    link.setAttribute('aria-label', 'Notifications');
    link.innerHTML =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" ' +
      'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 7h18s-3 0-3-7" />' +
      '<path d="M13.73 21a2 2 0 0 1-3.46 0" /></svg>' +
      '<span class="notif-bell__badge" hidden></span>';

    bar.appendChild(link);
  }

  function mountNavBadge() {
    var link = document.querySelector('.mobile-nav a[href="engineer-notifications.html"]');
    if (!link || link.querySelector('.notif-nav-badge')) return;
    var badge = document.createElement('span');
    badge.className = 'notif-nav-badge';
    badge.hidden = true;
    link.appendChild(badge);
  }

  /* ── Inbox rendering ────────────────────────────────────────────────── */

  function filtersNode() {
    var host = el('div', 'inbox-filters');
    host.setAttribute('role', 'group');
    host.setAttribute('aria-label', 'Filter notifications');
    FILTERS.forEach(function (spec) {
      var button = el('button', 'inbox-filter', spec.label);
      button.type = 'button';
      button.setAttribute('aria-pressed', String(state.filter === spec.id));
      var count = spec.id === 'all' ? state.unread : state.byCategory[spec.id] || 0;
      if (count > 0)
        button.appendChild(el('span', 'inbox-filter__count', count > 99 ? '99+' : count));
      button.addEventListener('click', function () {
        state.filter = spec.id;
        renderInbox();
      });
      host.appendChild(button);
    });
    return host;
  }

  function itemNode(row) {
    var item = el('li');
    var button = el('button', 'inbox-item');
    button.type = 'button';
    button.dataset.read = row.read ? 'true' : 'false';
    button.dataset.severity = row.severity || 'info';

    button.appendChild(el('span', 'inbox-item__dot'));

    var body = el('span');
    body.appendChild(el('p', 'inbox-item__title', row.title));
    if (row.body) body.appendChild(el('p', 'inbox-item__body', row.body));

    var meta = el('span', 'inbox-item__meta');
    if (row.project_name) meta.appendChild(el('span', null, row.project_name));
    if (row.kind_label) meta.appendChild(el('span', 'inbox-item__kind', row.kind_label));
    var when = el('time', 'inbox-item__time', timeAgo(row.created_at));
    if (row.created_at) {
      when.dateTime = row.created_at;
      when.title = new Date(row.created_at).toLocaleString();
    }
    meta.appendChild(when);
    body.appendChild(meta);

    button.appendChild(body);
    button.addEventListener('click', function () {
      var mark = row.read
        ? Promise.resolve()
        : api()
            .markNotificationRead(row.id)
            .catch(function () {
              /* navigation matters more than the receipt */
            });
      mark.then(function () {
        if (row.url) window.location.href = row.url;
        else {
          row.read = true;
          refreshBadge();
          renderInbox();
        }
      });
    });

    item.appendChild(button);
    return item;
  }

  function stateNode() {
    var wrap = el('div', 'inbox-empty');
    if (state.failed) {
      wrap.className = 'inbox-empty inbox-empty--error';
      wrap.appendChild(el('h3', null, 'Could not load your notifications'));
      wrap.appendChild(
        el('p', null, 'Check your connection and try again. Nothing you captured is lost.')
      );
      var retry = el('button', 'action', 'Try again');
      retry.type = 'button';
      retry.style.marginTop = '12px';
      retry.addEventListener('click', function () {
        loadInbox();
      });
      wrap.appendChild(retry);
    } else if (state.filter !== 'all') {
      wrap.appendChild(el('h3', null, 'Nothing here'));
      wrap.appendChild(el('p', null, 'Switch to All to see every update on your work.'));
    } else {
      wrap.appendChild(el('h3', null, 'Nothing waiting on you'));
      wrap.appendChild(
        el(
          'p',
          null,
          'New assignments, planner decisions and LLD updates appear here as they happen.'
        )
      );
    }
    return wrap;
  }

  function renderInbox() {
    var container = state.container;
    if (!container) return;
    container.textContent = '';

    container.appendChild(filtersNode());

    if (state.loading) {
      var skeleton = el('div');
      skeleton.style.display = 'flex';
      skeleton.style.flexDirection = 'column';
      skeleton.style.gap = '8px';
      for (var i = 0; i < 3; i += 1) skeleton.appendChild(el('div', 'inbox-skeleton'));
      container.appendChild(skeleton);
      return;
    }

    var rows = state.rows.filter(function (row) {
      return state.filter === 'all' || row.category === state.filter;
    });

    if (!rows.length) {
      container.appendChild(stateNode());
    } else {
      var list = el('ul', 'inbox-list');
      rows.forEach(function (row) {
        list.appendChild(itemNode(row));
      });
      container.appendChild(list);

      if (state.unread > 0) {
        var actions = el('div', 'inbox-actions');
        var markAll = el('button', 'btn btn-outline btn-sm', 'Mark all read');
        markAll.type = 'button';
        markAll.addEventListener('click', function () {
          markAll.disabled = true;
          api()
            .markAllNotificationsRead()
            .then(function (result) {
              state.unread = (result && result.unread) || 0;
              state.rows.forEach(function (row) {
                row.read = true;
              });
              state.byCategory = {};
              paintBadge();
              renderInbox();
            })
            .catch(function () {
              markAll.disabled = false;
            });
        });
        actions.appendChild(markAll);
        container.appendChild(actions);
      }
    }
  }

  function loadInbox() {
    var client = api();
    if (!client || !client.listNotifications) return;
    if (state.loading) return;

    state.loading = true;
    state.failed = false;
    renderInbox();

    client
      .listNotifications({ limit: 50 })
      .then(function (payload) {
        state.rows = (payload && payload.notifications) || [];
        state.unread = (payload && payload.unread) || 0;
        state.loading = false;
        paintBadge();
        renderInbox();
      })
      .catch(function () {
        state.loading = false;
        state.failed = true;
        renderInbox();
      });
  }

  /* ── Public surface ─────────────────────────────────────────────────── */

  window.EngineerInbox = {
    render: function (container) {
      state.container = container;
      renderInbox();
      loadInbox();
    },
    refresh: function () {
      return refreshBadge();
    },
    unread: function () {
      return state.unread;
    },
  };

  function boot() {
    ensureStylesheet();

    var bar = document.querySelector('.top-bar');
    mountBell(bar);
    mountNavBadge();

    if (!signedIn()) {
      if (bar && bar.querySelector('.notif-bell')) bar.querySelector('.notif-bell').hidden = true;
      return;
    }

    refreshBadge();
    if (state.timer) window.clearInterval(state.timer);
    state.timer = window.setInterval(function () {
      if (!document.hidden) refreshBadge();
    }, POLL_MS);

    window.addEventListener('focus', refreshBadge);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
