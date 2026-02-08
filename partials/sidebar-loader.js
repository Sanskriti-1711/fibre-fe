(function() {
  'use strict';

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

  function injectSidebar() {
    const sidebarContainer = document.getElementById('sidebarContainer');
    if (!sidebarContainer) {
      console.warn('Sidebar container not found. Add <div id="sidebarContainer"></div> to your HTML.');
      return;
    }

    fetch('partials/sidebar.html')
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
