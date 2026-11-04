(function () {
  'use strict';

  // Global logout handler for sidebar
  window.handleLogout = function (e) {
    if (e) e.preventDefault();
    if (window.FiberAuth && window.FiberAuth.clear) {
      window.FiberAuth.clear();
    }
    window.location.href = 'index.html';
  };

  /* One project, one flow. Each stage collects the pages that belong to it, so
     whichever page the user is on, the sidebar can say where they are:
     Overview / Planning / Permits / Jobs / Review / Progress. */
  var STAGES = [
    {
      key: 'overview',
      page: 'project-details.html',
      pages: [
        'project-details',
        'ftth-project-overview',
        'project-map-review',
        'layer-details',
        'feature-details',
      ],
    },
    {
      key: 'planning',
      page: 'ftth-lld-versions.html',
      pages: [
        'ftth-hld',
        'ftth-hld-status',
        'ftth-hld-results',
        'ftth-trench-design',
        'ftth-lld-review',
        'ftth-lld-results',
        'ftth-lld-versions',
        'ftth-lld-outputs',
        'ftth-approved-survey',
        'ftth-feature-lineage',
        'gpkg-upload',
        'project-create',
      ],
    },
    {
      key: 'permits',
      page: 'ftth-permits.html',
      pages: ['ftth-permits', 'ftth-permit-copilot'],
    },
    {
      key: 'jobs',
      page: 'project-assign.html',
      pages: ['project-assign'],
    },
    {
      key: 'review',
      page: 'ftth-survey-changes.html',
      pages: [
        'project-approval-que',
        'audit-detail',
        'ftth-survey-changes',
        'ftth-survey-approval',
        'ftth-lld-feature-review',
      ],
    },
    {
      key: 'progress',
      page: 'projects-completion.html',
      pages: ['projects-completion', 'reports'],
    },
  ];

  function getCurrentPageName() {
    const path = window.location.pathname;
    const filename = path.substring(path.lastIndexOf('/') + 1) || 'index.html';
    return filename.replace('.html', '');
  }

  /* Pages name the open project `project_id`, `proj_id` or `project` — the
     audit page alone accepts all three. Read all of them so a project opened
     from any entry point is recognised. */
  function getProjectId() {
    var params = new URLSearchParams(window.location.search);
    var id = params.get('project_id') || params.get('proj_id') || params.get('project') || '';
    if (id) return id;

    if (document.body && document.body.dataset && document.body.dataset.projectId) {
      return document.body.dataset.projectId;
    }
    return '';
  }

  function stageForPage(currentPage) {
    for (var i = 0; i < STAGES.length; i++) {
      if (STAGES[i].pages.indexOf(currentPage) !== -1) return STAGES[i];
    }
    return null;
  }

  function getSidebarBase() {
    var script = document.querySelector('script[data-sidebar-base]');
    if (script) return script.getAttribute('data-sidebar-base') || '';

    if (document.body && document.body.dataset && document.body.dataset.sidebarBase) {
      return document.body.dataset.sidebarBase;
    }

    return '';
  }

  /* Both parameter names are written because the pages disagree: the approval
     queue reads `project`, the rest read `project_id`. Sending both keeps every
     in-project link working without a per-page table to drift out of date. */
  function projectHref(base, page, projectId) {
    var id = encodeURIComponent(projectId);
    return base + page + '?project_id=' + id + '&project=' + id;
  }

  function renderProjectSection(nav, base, currentPage, projectId) {
    var section = document.getElementById('projectNav');
    if (!section) return;

    if (!projectId) {
      section.hidden = true;
      return;
    }

    section.hidden = false;

    var nameEl = document.getElementById('projectNavName');
    if (nameEl) {
      // The pages render the full project name in their own header; the rail
      // only needs enough to say which project the flow belongs to.
      nameEl.textContent = 'Project ' + projectId.slice(0, 8) + '…';
      nameEl.title = projectId;
    }

    Array.prototype.forEach.call(section.querySelectorAll('a[data-stage]'), function (link) {
      var stage = null;
      for (var i = 0; i < STAGES.length; i++) {
        if (STAGES[i].key === link.getAttribute('data-stage')) stage = STAGES[i];
      }
      if (stage) link.setAttribute('href', projectHref(base, stage.page, projectId));
    });

    loadProjectName(projectId);
  }

  /* The rail names the project rather than showing its id: an id in the nav is
     a debugging aid, not a signpost. Silent on failure — navigation must never
     be the reason a page looks broken. */
  function loadProjectName(projectId) {
    var nameEl = document.getElementById('projectNavName');
    var base = window.FIBER_BASE_URL || '';
    var token = '';
    try {
      var raw = window.localStorage.getItem('fiber_auth');
      token = raw ? JSON.parse(raw).access || '' : '';
    } catch {
      token = '';
    }
    if (!nameEl || !base || !token) return;

    fetch(base.replace(/\/+$/, '') + '/api/projects/' + encodeURIComponent(projectId) + '/', {
      headers: { Authorization: 'Bearer ' + token },
    })
      .then(function (response) {
        return response.ok ? response.json() : null;
      })
      .then(function (project) {
        if (!project || !project.name) return;
        nameEl.textContent = project.name;
        nameEl.title = project.name;
      })
      .catch(function () {
        // Keep the id fallback: a failed name lookup must not empty the rail.
      });
  }

  function setActiveNavItem(projectId) {
    const currentPage = getCurrentPageName();
    const nav = document.getElementById('sharedNav');
    if (!nav) return;

    var activeStage = projectId ? stageForPage(currentPage) : null;

    // Clear first: a page that appears both as a stage and as a queue row must
    // not light up twice.
    Array.prototype.forEach.call(nav.querySelectorAll('a'), function (link) {
      link.classList.remove('active');
    });

    if (activeStage) {
      var stageLink = nav.querySelector('a[data-stage="' + activeStage.key + '"]');
      if (stageLink) stageLink.classList.add('active');
      return;
    }

    Array.prototype.forEach.call(nav.querySelectorAll('a[data-page]'), function (link) {
      if (link.getAttribute('data-page') === currentPage) link.classList.add('active');
    });
  }

  /* The bell lives in the sidebar partial, so its styling and behaviour ride
     along with the sidebar instead of being added to every page's <head>.
     Loading them here keeps the 30 pages that draw the sidebar unchanged. */
  function loadNotificationAssets(base) {
    var cssHref = base + 'css/notifications.css';
    var jsSrc = base + 'js/notifications.js';

    if (!document.querySelector('link[data-notifications]')) {
      var link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = cssHref;
      link.setAttribute('data-notifications', 'css');
      document.head.appendChild(link);
    }

    if (!document.querySelector('script[data-notifications]')) {
      var script = document.createElement('script');
      script.src = jsSrc;
      script.defer = true;
      script.setAttribute('data-notifications', 'js');
      document.body.appendChild(script);
    }
  }

  function injectSidebar() {
    const sidebarContainer = document.getElementById('sidebarContainer');
    if (!sidebarContainer) {
      console.warn(
        'Sidebar container not found. Add <div id="sidebarContainer"></div> to your HTML.'
      );
      return;
    }

    var base = getSidebarBase();
    var projectId = getProjectId();
    var currentPage = getCurrentPageName();

    fetch(base + 'partials/sidebar.html')
      .then(function (response) {
        if (!response.ok) throw new Error('Failed to load sidebar: ' + response.status);
        return response.text();
      })
      .then(function (html) {
        sidebarContainer.innerHTML = html;
        var nav = document.getElementById('sharedNav');
        if (nav) {
          renderProjectSection(nav, base, currentPage, projectId);
          setActiveNavItem(projectId);
        }
        initDrawer();
        loadNotificationAssets(base);
      })
      .catch(function (err) {
        console.error('Error loading sidebar:', err);
      });
  }

  /* The mobile shell. Above 860px the drawer stays closed and the sidebar is
     an ordinary rail, so this costs nothing on desktop. Failures here are
     logged, never thrown: a navigation that cannot open is bad, but a page
     whose data cannot load because navigation threw is worse. */
  function initDrawer() {
    if (!window.FtthUI || !window.FtthUI.Drawer) return;
    var sidebar = document.getElementById('sharedSidebar');
    var toggle = document.getElementById('navToggleBtn');
    var scrim = document.getElementById('navScrim');
    if (!sidebar || !toggle) return;
    try {
      window.__ftthDrawer = window.FtthUI.Drawer({
        sidebar: sidebar,
        toggle: toggle,
        scrim: scrim,
      });
    } catch (err) {
      console.warn('Nav drawer unavailable:', err);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectSidebar);
  } else {
    injectSidebar();
  }
})();
