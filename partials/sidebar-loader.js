(function() {
  'use strict';

  // Global logout handler for sidebar
  window.handleLogout = function(e) {
    if (e) e.preventDefault();
    if (window.FiberAuth && window.FiberAuth.clear) {
      window.FiberAuth.clear();
    }
    window.location.href = "index.html";
  };

  function getCurrentPageName() {
    const path = window.location.pathname;
    const filename = path.substring(path.lastIndexOf('/') + 1) || 'index.html';
    return filename.replace('.html', '');
  }

  function setActiveNavItem() {
    const currentPage = getCurrentPageName();
    const nav = document.getElementById('sharedNav');
    if (!nav) return;

    const links = nav.querySelectorAll('a[data-page]');
    links.forEach(function(link) {
      const pageAttr = link.getAttribute('data-page');
      if (pageAttr === currentPage) {
        link.classList.add('active');
      } else {
        link.classList.remove('active');
      }
    });
  }

  function getSidebarBase() {
    var script = document.querySelector('script[data-sidebar-base]');
    if (script) return script.getAttribute('data-sidebar-base') || '';

    if (document.body && document.body.dataset && document.body.dataset.sidebarBase) {
      return document.body.dataset.sidebarBase;
    }

    return '';
  }

  function injectSidebar() {
    const sidebarContainer = document.getElementById('sidebarContainer');
    if (!sidebarContainer) {
      console.warn('Sidebar container not found. Add <div id="sidebarContainer"></div> to your HTML.');
      return;
    }

    var base = getSidebarBase();
    fetch(base + 'partials/sidebar.html')
      .then(function(response) {
        if (!response.ok) throw new Error('Failed to load sidebar: ' + response.status);
        return response.text();
      })
      .then(function(html) {
        sidebarContainer.innerHTML = html;
        setActiveNavItem();
        initDrawer();
      })
      .catch(function(err) {
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
        scrim: scrim
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
