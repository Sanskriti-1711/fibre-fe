/* FTTH shared UI primitives — panel states, toasts, canvas descriptions.
   Loaded on every page that renders live data. No framework, no build step. */
(function () {
  'use strict';

  if (window.FtthUI) return;

  var reduceMotion = window.matchMedia
    ? window.matchMedia('(prefers-reduced-motion: reduce)')
    : { matches: false, addEventListener: function () {} };

  /* ── Error copy ───────────────────────────────────────────────────
     Raw fetch errors ("Failed to fetch", "NetworkError") leak through
     59 places today. Everything goes through here instead. */
  var ERROR_COPY = {
    offline: 'You appear to be offline. Reconnect and try again.',
    timeout: 'The design service took too long to respond. It may be busy — try again in a moment.',
    unauthorized: 'Your session has expired. Sign in again to continue.',
    forbidden: 'Your role does not have access to this. Ask an administrator if you need it.',
    notfound: 'That record no longer exists. It may have been deleted.',
    ratelimit: 'Too many requests. Wait a moment before trying again.',
    server: 'The design service hit an internal error. Try again shortly.',
    default: 'Could not reach the design service. Check that the API is running.'
  };

  /* Classify a failure into one of the ERROR_COPY keys. Single source of
     truth: the wording and the branching decisions (offer a retry? send the
     user to sign in?) must never disagree about what went wrong. */
  function errorKind(err) {
    if (err && err.__ftthKind) return err.__ftthKind;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return 'offline';
    if (err && err.name === 'AbortError') return 'timeout';

    // Classify from the HTTP status when the API layer attached one, before
    // falling back to message text. A 401 is a dead session, not an outage,
    // and telling someone to check the API when the API answered is the
    // single most misleading thing this panel can do.
    var status = err && (err.status || err.statusCode);
    if (status) status = Number(status);
    if (status === 401) return 'unauthorized';
    if (status === 403) return 'forbidden';
    if (status === 404) return 'notfound';
    if (status === 429) return 'ratelimit';
    if (status >= 500 && status <= 599) return 'server';

    var msg = String((err && err.message) || '').toLowerCase();
    if (!msg) return 'default';
    if (/failed to fetch|networkerror|load failed|network request|fetch failed/.test(msg)) {
      return (typeof navigator !== 'undefined' && navigator.onLine === false)
        ? 'offline'
        : 'default';
    }
    // Wording this backend actually emits for a dead session. Django's
    // simplejwt answers 401 with "Given token not valid for any token type",
    // and an expired refresh token gets 400 with "Token is invalid or
    // expired". Both are a dead session, and both used to reach the user as
    // "check that the API is running".
    if (/session (has )?expired|please (log ?in|login)|unauthor|invalid token|token (has )?expired|token is invalid|not valid for any token type|token_?is_?blacklisted/.test(msg)) {
      return 'unauthorized';
    }
    if (/permission|forbidden|not allowed|role does not have/.test(msg)) return 'forbidden';
    if (/timeout|timed out|took too long/.test(msg)) return 'timeout';
    if (/\b40[13]\b/.test(msg)) return 'unauthorized';
    if (/\b403\b/.test(msg)) return 'forbidden';
    if (/\b404\b/.test(msg)) return 'notfound';
    if (/\b429\b/.test(msg)) return 'ratelimit';
    if (/\b5\d\d\b/.test(msg)) return 'server';
    return 'default';
  }

  function errorMessage(err) {
    return ERROR_COPY[errorKind(err)] || ERROR_COPY.default;
  }

  /* The scrub every catch block wants.
     errorMessage() answers "what should I tell them" for failures the
     platform produced. This answers "is there anything worth showing at
     all": a real API message ("Project not found", "Version 3 is
     already approved") is specific and actionable and should survive
     verbatim, while a browser-level TypeError("Failed to fetch") is
     noise that tells the user nothing they can act on.

     So: sanitize the uninformative failures to shared copy, pass the
     informative ones through. Call sites stop having to know which is
     which. */
  function humanize(err) {
    var kind = errorKind(err);
    var raw = err && typeof err === 'object' ? String(err.message || '') : String(err || '');

    if (kind !== 'default') return ERROR_COPY[kind] || ERROR_COPY.default;

    // No status, no meaningful kind, but there is a message. If it looks
    // like platform plumbing rather than an application error, it is not
    // worth a user's attention — say something actionable instead.
    if (!raw || /^(failed to fetch|networkerror|load failed|fetch failed|network request failed|error loading|request failed)/i.test(raw)) {
      return ERROR_COPY.default;
    }
    return raw;
  }

  function markKind(err, kind) {
    try { if (err && typeof err === 'object') err.__ftthKind = kind; } catch (_) {}
    return err;
  }

  /* Tag a fetch rejection with an HTTP kind so errorMessage can speak. */
  function fromResponse(res) {
    if (res && res.status === 401) return markKind(new Error('401'), 'unauthorized');
    if (res && res.status === 403) return markKind(new Error('403'), 'forbidden');
    if (res && res.status === 404) return markKind(new Error('404'), 'notfound');
    if (res && res.status === 429) return markKind(new Error('429'), 'ratelimit');
    if (res && res.status >= 500) return markKind(new Error(String(res.status)), 'server');
    return markKind(new Error(String((res && res.status) || 500)), 'server');
  }

  /* ── Panel ────────────────────────────────────────────────────────
     A panel owns one region of the page and can only be in one of four
     states. The rule that matters: a panel never renders a number it did
     not actually receive. Unknown is "—", not 0. */
  function Panel(opts) {
    opts = opts || {};
    this.host = opts.host || null;
    this.label = opts.label || 'Data';
    this.emptyTitle = opts.emptyTitle || 'Nothing here yet';
    this.emptyBody = opts.emptyBody || '';
    this.emptyAction = opts.emptyAction || null;
    this.valueEl = opts.valueEl || null;
    this.noteEl = opts.noteEl || null;
    this.onRetry = opts.onRetry || null;
    this._state = 'loading';
    this._lastGood = null;
    this._build();
  }

  Panel.prototype._build = function () {
    if (!this.host) return;
    this.host.classList.add('panel-state-host');
    if (!this.host.querySelector('.panel-state')) {
      var box = document.createElement('div');
      box.className = 'panel-state';
      box.setAttribute('role', 'status');
      box.setAttribute('aria-live', 'polite');
      this.host.appendChild(box);
      this._box = box;
    } else {
      this._box = this.host.querySelector('.panel-state');
    }
  };

  Panel.prototype._clear = function () {
    if (this._box) this._box.innerHTML = '';
    if (this.valueEl) this.valueEl.textContent = '—';
    if (this.noteEl) this.noteEl.textContent = '';
  };

  Panel.prototype.loading = function () {
    this._state = 'loading';
    this._clear();
    if (this.host) this.host.setAttribute('aria-busy', 'true');
    if (this._box) {
      this._box.className = 'panel-state panel-state--loading';
      this._box.innerHTML = '<span class="panel-spinner" aria-hidden="true"></span>' +
        '<span>Loading ' + esc(this.label.toLowerCase()) + '…</span>';
    }
  };

  Panel.prototype.ok = function (value, note) {
    this._state = 'ok';
    this._lastGood = note || null;
    if (this.host) this.host.setAttribute('aria-busy', 'false');
    if (this._box) { this._box.innerHTML = ''; this._box.hidden = true; }
    if (this.valueEl) this.valueEl.textContent = value;
    if (this.noteEl) this.noteEl.textContent = note || '';
  };

  Panel.prototype.empty = function (title, body, action) {
    this._state = 'empty';
    if (this.host) this.host.setAttribute('aria-busy', 'false');
    this._clear();
    if (!this._box) return;
    this._box.hidden = false;
    this._box.className = 'panel-state panel-state--empty';
    var act = action || this.emptyAction;
    this._box.innerHTML =
      '<p class="panel-state__title">' + esc(title || this.emptyTitle) + '</p>' +
      (body || this.emptyBody ? '<p class="panel-state__body">' + esc(body || this.emptyBody) + '</p>' : '') +
      (act ? '<a class="panel-state__action" href="' + esc(act.href) + '">' + esc(act.label) + '</a>' : '');
  };

  Panel.prototype.error = function (err) {
    this._state = 'error';
    if (this.host) this.host.setAttribute('aria-busy', 'false');
    this._clear();
    if (!this._box) return;
    this._box.hidden = false;
    this._box.className = 'panel-state panel-state--error';
    var msg = errorMessage(err);
    var retry = this.onRetry
      ? '<button type="button" class="panel-state__retry" data-ftth-retry>Try again</button>'
      : '';
    this._box.innerHTML =
      '<p class="panel-state__title">Can’t load ' + esc(this.label.toLowerCase()) + '</p>' +
      '<p class="panel-state__body">' + esc(msg) + '</p>' + retry;
    if (retry && this.onRetry) {
      this._box.querySelector('[data-ftth-retry]').addEventListener('click', function () {
        this.onRetry();
      }.bind(this));
    }
  };

  /* Show the last known-good note alongside an error, so the operator can
     tell stale from fresh. */
  Panel.prototype.staleNote = function () {
    return this._lastGood ? 'Last updated ' + this._lastGood : '';
  };

  Panel.prototype.state = function () { return this._state; };

  /* ── Toast ────────────────────────────────────────────────────────
     The old .ftth-toast was defined on one page and used on three, so
     failure messages rendered as unstyled text at the bottom of the
     document. This one is real, everywhere, and announced. */
  var toastHost = null;

  function ensureToastHost() {
    if (toastHost && document.body.contains(toastHost)) return toastHost;
    toastHost = document.createElement('div');
    toastHost.className = 'ftth-toast-stack';
    toastHost.setAttribute('aria-live', 'polite');
    toastHost.setAttribute('aria-atomic', 'false');
    document.body.appendChild(toastHost);
    return toastHost;
  }

  function toast(message, kind) {
    var host = ensureToastHost();
    var isError = kind === 'error';

    /* A 30s refresh during a long outage would otherwise stack the same
       message endlessly. Identical text is reused, not duplicated. */
    var existing = null;
    for (var i = 0; i < host.children.length; i++) {
      if (host.children[i].getAttribute('data-ftth-msg') === message) { existing = host.children[i]; break; }
    }
    if (existing) {
      clearTimeout(existing.__timer);
      existing.__timer = setTimeout(function () { dismissOne(existing); }, 9000);
      return { dismiss: function () { dismissOne(existing); } };
    }

    var el = document.createElement('div');
    el.className = 'ftth-toast ftth-toast--' + (isError ? 'error' : (kind || 'info'));
    el.setAttribute('role', isError ? 'alert' : 'status');
    el.setAttribute('data-ftth-msg', message);
    el.textContent = message;

    var close = document.createElement('button');
    close.type = 'button';
    close.className = 'ftth-toast__close';
    close.setAttribute('aria-label', 'Dismiss notification');
    close.textContent = '×';
    close.addEventListener('click', function () { dismissOne(el); });
    el.appendChild(close);
    host.appendChild(el);

    while (host.children.length > 3) host.removeChild(host.firstChild);

    el.__timer = setTimeout(function () { dismissOne(el); }, isError ? 9000 : 4500);

    return { dismiss: function () { dismissOne(el); } };
  }

  function dismissOne(el) {
    if (!el || !el.parentNode) return;
    clearTimeout(el.__timer);
    el.classList.add('is-leaving');
    setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 200);
  }

  /* ── Canvas descriptions ───────────────────────────────────────────
     Every dashboard chart is a <canvas> with no text alternative, so the
     numbers were invisible to screen readers. */
  function describeCanvas(canvas, text) {
    if (!canvas) return;
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', text);
  }

  /* ── Motion ───────────────────────────────────────────────────────
     A single source of truth so no page re-derives the media query. */
  function motionOk() { return !reduceMotion.matches; }

  function onMotionChange(fn) {
    if (reduceMotion.addEventListener) reduceMotion.addEventListener('change', fn);
    else if (reduceMotion.addListener) reduceMotion.addListener(fn);
  }

  /* ── Visibility-aware polling ────────────────────────────────────
     A 30s refresh that keeps running in a background tab burns API and
     rebuilds the DOM for nobody. */
  function poll(fn, intervalMs) {
    var timer = null;
    function start() {
      if (timer) return;
      if (typeof document !== 'undefined' && document.hidden) return;
      timer = setInterval(fn, intervalMs);
    }
    function stop() {
      if (!timer) return;
      clearInterval(timer);
      timer = null;
    }
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', function () {
        if (document.hidden) stop(); else start();
      });
    }
    return { start: start, stop: stop, isRunning: function () { return !!timer; } };
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  }

  /* ── Request timeout ────────────────────────────────────────────
     A request that never settles leaves the panel in "Loading…" for
     ever, which is indistinguishable from a slow server. Every call
     the dashboard makes is raced against this. */
  function withTimeout(promise, ms, label) {
    ms = ms || 12000;
    var timer;
    var timeout = new Promise(function (_resolve, reject) {
      timer = setTimeout(function () {
        reject(markKind(new Error('timeout: ' + (label || 'request')), 'timeout'));
      }, ms);
    });
    return Promise.race([promise, timeout]).finally(function () { clearTimeout(timer); });
  }

  /* ── Drawer ──────────────────────────────────────────────────────
     The mobile navigation. Below the breakpoint the sidebar becomes an
     off-canvas drawer over a scrim, because a 9-group nav rendered inline
     puts eleven links between the user and their work.

     Everything a drawer owes its user is handled here rather than in CSS
     alone: Escape closes it, focus moves in and comes back, the page
     behind it cannot scroll, and crossing the breakpoint tidies up so a
     drawer is never left stranded open on a desktop window. */
  function Drawer(opts) {
    var sidebar = opts.sidebar;
    var toggle = opts.toggle;
    var scrim = opts.scrim;
    if (!sidebar || !toggle) return null;

    var nav = sidebar.querySelector('.nav');
    var lastFocused = null;
    var open = false;

    function isOpen() { return open; }

    function focusables() {
      return Array.prototype.slice.call(
        (nav || sidebar).querySelectorAll('a[href], button, [tabindex]:not([tabindex="-1"])')
      ).filter(function (el) { return el.offsetParent !== null; });
    }

    function setOpen(next) {
      if (next === open) return;
      open = next;
      sidebar.classList.toggle('is-open', open);
      document.body.classList.toggle('has-nav-open', open);
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      if (scrim) scrim.hidden = !open;

      if (open) {
        lastFocused = document.activeElement;
        var first = focusables()[0];
        // Move focus into the drawer so the next Tab stays inside it.
        if (first) first.focus();
      } else {
        /* Reclaim focus, but only when the user is still inside the drawer.
           If they have already tabbed out somewhere on the page, yanking
           focus back would be hostile, so that case is left alone.

           The toggle is the fallback rather than `lastFocused` alone: opening
           can happen without anything having been focused (a programmatic
           click, or a tap that moves focus nowhere), and then lastFocused is
           body. Focusing body strands focus on a nav link that is now inside
           a visibility:hidden drawer, so the next Tab starts from nowhere.
           The toggle is always focusable and always on screen. */
        var active = document.activeElement;
        var inside = sidebar.contains(active);
        if (inside) {
          var target = lastFocused;
          var usable = target && target.focus && target !== document.body &&
            document.contains(target) && target.offsetParent !== null;
          (usable ? target : toggle).focus();
        }
      }
    }

    toggle.addEventListener('click', function () { setOpen(!open); });
    if (scrim) scrim.addEventListener('click', function () { setOpen(false); });

    // Following a link navigates, but if the link is an in-page anchor the
    // drawer would otherwise stay open over the destination.
    if (nav) {
      nav.addEventListener('click', function (e) {
        if (e.target.closest('a')) setOpen(false);
      });
    }

    document.addEventListener('keydown', function (e) {
      if (!open) return;
      if (e.key === 'Escape') { setOpen(false); return; }
      if (e.key !== 'Tab') return;
      // Keep Tab inside the drawer while it is modal over the page.
      var items = focusables();
      if (!items.length) return;
      var first = items[0], last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });

    // A drawer open when the window widens past the breakpoint would sit
    // invisibly over a desktop layout with its scroll lock still applied.
    var mq = window.matchMedia('(min-width: 861px)');
    var onChange = function (e) { if (e.matches) setOpen(false); };
    if (mq.addEventListener) mq.addEventListener('change', onChange);
    else if (mq.addListener) mq.addListener(onChange);

    return { open: function () { setOpen(true); }, close: function () { setOpen(false); }, isOpen: isOpen };
  }

  /* ── Dialog ───────────────────────────────────────────────────────
     69 call sites across 18 files used native confirm/alert/prompt. The
     reason to replace them is not that the browser's dialogs look dated —
     it is what they cannot do:

       · they cannot say what will happen. "Are you sure?" does not tell a
         permit officer that closing an approved permit after construction is
         not reversible, and the confirm button sits adjacent to Cancel with
         identical weight, so a stray Enter commits it;
       · prompt() has no validation, so "Rejection reason:" accepts an empty
         string and the rejection is recorded against an approved design with
         no explanation of why;
       · alert() blocks the main thread to say "Copied result.".

     Built on the native <dialog> element rather than a div overlay, because
     the platform then owns the parts that are easy to get wrong by hand:
     the top layer, the inert background, the focus trap, Escape, and the
     ::backdrop. A hand-rolled modal has to re-implement all of that and gets
     the focus-return case subtly wrong. The one thing <dialog> does not do
     is restore focus on close, so that is handled here.

     Every function returns a promise. Call sites read as `if (!await
     FtthUI.confirm(...)) return;` which is a smaller diff than the callbacks
     a callback-based API would force on all 69 of them. */

  function el(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    return node;
  }

  /* Renders a validation message under a field and moves focus to it. Kept
     separate from promptBox so a dialog that collects its own fields can
     report a problem the same way promptBox does. */
  function showFieldError(dlg, field, message) {
    if (!dlg) return;
    var host = field && field.closest ? field.closest('.ftth-field') : null;
    if (!host) return;
    field.classList.add('ftth-input--invalid');
    field.setAttribute('aria-invalid', 'true');
    var err = host.querySelector('.ftth-field__error');
    if (!err) {
      err = el('p', 'ftth-field__error');
      err.setAttribute('role', 'alert');
      host.appendChild(err);
    }
    err.textContent = message;
    if (field.focus) field.focus();
  }

  /* A <dialog> is a top-layer element, so it must live in the document to
     render. Each call gets its own and removes itself, so nested dialogs
     (a confirm raised from inside a dialog) work without a singleton. */
  function dialog(opts) {
    opts = opts || {};
    return new Promise(function (resolve) {
      var dlg = el('dialog', 'ftth-dialog' + (opts.variant ? ' ftth-dialog--' + opts.variant : ''));
      var settled = false;

      function settle(value) {
        if (settled) return;
        settled = true;
        resolve(value);
        /* close() is what returns the top layer, restores the inertness of
           the page behind, and fires the close event that puts focus back.
           Removing the element from the DOM does none of that, so it must not
           be the only teardown. */
        if (typeof dlg.close === 'function' && dlg.open) dlg.close();
        /* Defer removal past the exit animation. */
        setTimeout(function () { if (dlg.parentNode) dlg.parentNode.removeChild(dlg); }, motionOk() ? 160 : 0);
      }

      var head = el('div', 'ftth-dialog__head');
      if (opts.title) {
        var h = el('h2', 'ftth-dialog__title', opts.title);
        h.id = 'ftth-dialog-title';
        dlg.setAttribute('aria-labelledby', h.id);
        head.appendChild(h);
      }
      var x = el('button', 'ftth-dialog__close');
      x.type = 'button';
      x.setAttribute('aria-label', 'Close dialog');
      x.innerHTML = '<span aria-hidden="true">&times;</span>';
      x.addEventListener('click', function () { settle(opts.onCancel ? opts.onCancel() : null); });
      head.appendChild(x);
      dlg.appendChild(head);

      var body = el('div', 'ftth-dialog__body');
      if (opts.message) {
        var p = el('p', 'ftth-dialog__message', opts.message);
        /* A dialog with no title still needs a name. */
        if (!opts.title) p.id = 'ftth-dialog-title';
        body.appendChild(p);
      }
      /* `lines` renders a short list of consequences. This is the part native
         confirm cannot express, and the reason these dialogs exist. */
      if (opts.lines && opts.lines.length) {
        var ul = el('ul', 'ftth-dialog__points');
        opts.lines.forEach(function (t) { ul.appendChild(el('li', null, t)); });
        body.appendChild(ul);
      }
      if (opts.input) body.appendChild(opts.input);
      if (opts.note) body.appendChild(el('p', 'ftth-dialog__note', opts.note));
      dlg.appendChild(body);

      var foot = el('div', 'ftth-dialog__foot');
      (opts.actions || []).forEach(function (a) {
        var b = el('button', 'ftth-btn ' + (a.variant ? 'ftth-btn--' + a.variant : 'ftth-btn--secondary'), a.label);
        b.type = 'button';
        b.addEventListener('click', function () {
          /* `collect` lets a submit button read the fields at click time and
             resolve with a payload rather than a fixed value. Without it, a
             dialog that collects input would have to be read after it closed,
             by which point the fields are gone. Returning a string blocks the
             close and leaves the dialog up, which is what a validation failure
             needs; returning a falsy value that is a *defined* object still
             closes. */
          if (a.collect) {
            var got = a.collect(dlg);
            if (typeof got === 'string') { settle(got); return; }
            if (got && got.__error) {
              showFieldError(dlg, got.field, got.error);
              return;
            }
            settle(got);
            return;
          }
          settle(a.value);
        });
        foot.appendChild(b);
      });
      dlg.appendChild(foot);

      if (opts.variant === 'danger') dlg.classList.add('ftth-dialog--danger');

      /* Escape is a cancel, not a silent no-op. preventDefault stops the
         browser's own dismissal so the promise always resolves with the same
         value a Cancel click would have. */
      dlg.addEventListener('cancel', function (e) {
        e.preventDefault();
        settle(opts.onCancel ? opts.onCancel() : null);
      });

      /* A click landing on the backdrop is a click on the dialog's own
         padding, not on a control. Compare coordinates so a drag that starts
         inside and ends outside does not count. */
      dlg.addEventListener('click', function (e) {
        if (e.target !== dlg) return;
        var r = dlg.getBoundingClientRect();
        if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) {
          settle(opts.onCancel ? opts.onCancel() : null);
        }
      });

      var restoreTo = document.activeElement;
      document.body.appendChild(dlg);
      dlg.showModal();

      /* No entry animation, deliberately.
         Both obvious approaches were built and measured here and both leave the
         dialog invisible: @starting-style in CSS, and Element.animate() in JS.
         showModal() and the animation are set up in the same task, so the
         dialog never gets a committed frame for either to transition from —
         @starting-style's from-values stick at opacity 0, and the JS
         animation sits pending with currentTime pinned at 0 while the
         document timeline runs on normally (measured: timeline +316ms,
         animation +0ms).

         That is not a cosmetic bug here. While the dialog is open the page
         behind is inert, so a dialog stuck at opacity 0 means the user clicks
         "Close permit" and the app freezes with no way back. A confirmation
         that guards an irreversible action has to be visible the instant it is
         shown, and must not depend on an animation frame being produced. The
         ::backdrop still fades, because the backdrop is not gated on this
         element's animation. */

      /* showModal focuses the first focusable, which is the close button. For
         a confirm, the safe default is Cancel, not commit: an Enter keypress
         should never be one keystroke from an irreversible action. */
      if (opts.initialFocus) {
        var target = opts.initialFocus(dlg);
        if (target) target.focus();
      }

      /* <dialog> does not restore focus on close, so this is ours. Runs on
         every exit path — buttons, Escape, backdrop, close button — because
         they all route through close(). */
      dlg.addEventListener('close', function () {
        if (restoreTo && restoreTo.focus && document.contains(restoreTo)) {
          try { restoreTo.focus(); } catch (_) {}
        }
      });
    });
  }

  function confirm(opts) {
    if (typeof opts === 'string') opts = { message: opts };
    opts = opts || {};
    return dialog({
      title: opts.title,
      message: opts.message,
      lines: opts.lines,
      note: opts.note,
      variant: opts.danger ? 'danger' : 'default',
      onCancel: function () { return false; },
      actions: [
        { label: opts.cancelLabel || 'Cancel', value: false, variant: 'secondary' },
        {
          label: opts.confirmLabel || (opts.danger ? 'Delete' : 'Confirm'),
          value: true,
          variant: opts.danger ? 'danger' : 'primary'
        }
      ],
      initialFocus: function (dlg) {
        if (opts.danger) {
          var btns = dlg.querySelectorAll('.ftth-dialog__foot .ftth-btn');
          return btns[0] || null;
        }
        return dlg.querySelector('.ftth-btn--primary') || null;
      }
    });
  }

  function alertBox(opts) {
    if (typeof opts === 'string') opts = { message: opts };
    opts = opts || {};
    return dialog({
      title: opts.title,
      message: opts.message,
      // Forwarded because dialog() supports it and confirm() already
      // forwards it. Dropping it here meant an alert carrying a payload —
      // a CSV preview, a JSON blob to copy by hand — rendered its title
      // and note over an empty body.
      lines: opts.lines,
      note: opts.note,
      variant: opts.variant || 'default',
      onCancel: function () { return true; },
      actions: [{ label: opts.confirmLabel || 'Close', value: true, variant: 'primary' }],
      initialFocus: function (dlg) { return dlg.querySelector('.ftth-btn--primary') || null; }
    });
  }

  /* prompt() replacement. The reason this exists over a confirm is that a
     required reason needs a field that cannot be submitted empty, and a
     character limit with a live count so a pasted essay is visibly too long
     before the server rejects it.

     A failed validation re-opens with the text the user typed and the problem
     shown beside the field. Native prompt() gives you neither: it returns
     whatever was typed, and the caller has to loop, which is how "Rejection
     reason:" ends up recorded as an empty string. */
  function promptBox(opts) {
    if (typeof opts === 'string') opts = { label: opts };
    opts = opts || {};
    /* attempt is 0 on the first pass; later passes carry the rejected value
       and the message, so the user corrects rather than retypes. */
    var attempt = opts._attempt || 0;
    var rejected = opts._rejected || '';

    var input = el('input', 'ftth-input' + (attempt ? ' ftth-input--invalid' : ''));
    input.type = 'text';
    input.id = 'ftth-dialog-input';
    input.value = rejected;
    if (attempt) input.setAttribute('aria-invalid', 'true');
    if (opts.placeholder) input.placeholder = opts.placeholder;
    if (opts.maxlength) input.maxLength = opts.maxlength;

    var wrap = el('div', 'ftth-field');
    if (opts.label) {
      var lab = el('label', 'ftth-label', opts.label + (opts.required ? ' *' : ''));
      lab.setAttribute('for', input.id);
      wrap.appendChild(lab);
    }
    wrap.appendChild(input);

    if (attempt) {
      var err = el('p', 'ftth-field__error', opts._problem);
      err.setAttribute('role', 'alert');
      wrap.appendChild(err);
    }
    if (opts.hint) wrap.appendChild(el('p', 'ftth-field__hint', opts.hint));

    return dialog({
      title: opts.title,
      message: opts.message,
      note: opts.note,
      variant: opts.danger ? 'danger' : 'default',
      input: wrap,
      onCancel: function () { return null; },
      actions: [
        { label: opts.cancelLabel || 'Cancel', value: null, variant: 'secondary' },
        { label: opts.confirmLabel || 'Save', value: '__submit__', variant: opts.danger ? 'danger' : 'primary' }
      ],
      initialFocus: function () {
        /* Retrying should put the caret in the text, not select it — the user
           is amending a sentence, not re-picking a value. */
        input.focus();
        var n = input.value.length;
        try { input.setSelectionRange(n, n); } catch (_) {}
        return input;
      }
    }).then(function (res) {
      if (res !== '__submit__') return null;
      var v = input.value.trim();
      var problem = null;
      if (opts.required && !v) problem = opts.requiredMessage || 'This field is required.';
      else if (opts.validate) problem = opts.validate(v) || null;
      if (problem) {
        var retry = {};
        for (var k in opts) if (Object.prototype.hasOwnProperty.call(opts, k)) retry[k] = opts[k];
        retry._attempt = attempt + 1;
        retry._rejected = input.value;
        retry._problem = problem;
        return promptBox(retry);
      }
      return v;
    });
  }

  window.FtthUI = {
    Panel: Panel,
    Drawer: Drawer,
    dialog: dialog,
    confirm: confirm,
    alert: alertBox,
    prompt: promptBox,
    toast: toast,
    describeCanvas: describeCanvas,
    errorMessage: errorMessage,
    errorKind: errorKind,
    humanize: humanize,
    fromResponse: fromResponse,
    withTimeout: withTimeout,
    motionOk: motionOk,
    onMotionChange: onMotionChange,
    poll: poll,
    reduceMotion: reduceMotion,
    esc: esc
  };
})();
