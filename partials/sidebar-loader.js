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
      })
      .catch(function(err) {
        console.error('Error loading sidebar:', err);
      });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectSidebar);
  } else {
    injectSidebar();
  }
})();
