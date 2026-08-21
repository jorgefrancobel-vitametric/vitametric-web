/* Drawer de navegacion movil de las subpaginas.
   Reemplaza los onclick inline que estaban duplicados en 10 archivos HTML y que tenian
   tres bugs: ponian la clase 'open' al boton cuando el CSS anima '.active' (la hamburguesa
   nunca se volvia X), nunca actualizaban aria-expanded, y no bloqueaban el scroll del fondo. */
(function () {
  'use strict';

  function initSubpageDrawer() {
    var nav = document.querySelector('.subpage-nav-container > nav');
    var toggle = document.querySelector('.subpage-nav-toggle');
    var overlay = document.getElementById('subpageNavOverlay');
    if (!nav || !toggle) return;

    var ANIM_MS = 300;
    var closeTimer = null;

    function isOpen() {
      return nav.classList.contains('open') && !nav.classList.contains('closing');
    }

    function open() {
      clearTimeout(closeTimer);
      nav.classList.remove('closing');
      nav.classList.add('open');
      toggle.classList.add('active');
      toggle.setAttribute('aria-expanded', 'true');
      if (overlay) overlay.classList.add('open');
      document.body.style.overflow = 'hidden';
    }

    function close() {
      if (!nav.classList.contains('open')) return;
      nav.classList.add('closing');
      toggle.classList.remove('active');
      toggle.setAttribute('aria-expanded', 'false');
      if (overlay) overlay.classList.remove('open');
      document.body.style.overflow = '';
      clearTimeout(closeTimer);
      closeTimer = setTimeout(function () {
        nav.classList.remove('open', 'closing');
      }, ANIM_MS);
    }

    toggle.addEventListener('click', function (e) {
      e.stopPropagation();
      if (isOpen()) { close(); } else { open(); }
    });

    if (overlay) overlay.addEventListener('click', close);

    nav.addEventListener('click', function (e) {
      if (e.target.closest('a')) close();
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') close();
    });

    window.addEventListener('resize', function () {
      if (window.innerWidth > 768) close();
    });
  }

  function initStickyCta() {
    var stickyCta = document.querySelector('.sticky-cta');
    if (!stickyCta) return;
    stickyCta.classList.add('visible');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      initSubpageDrawer();
      initStickyCta();
    });
  } else {
    initSubpageDrawer();
    initStickyCta();
  }
})();
