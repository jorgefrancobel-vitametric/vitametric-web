(function () {
  var mediaQuery = window.matchMedia ? window.matchMedia('(prefers-color-scheme: light)') : null;

  function getSystemTheme() {
    return mediaQuery && mediaQuery.matches ? 'light' : 'dark';
  }

  function getStoredTheme() {
    try {
      var stored = localStorage.getItem('vt-theme');
      if (stored === 'light' || stored === 'dark') return stored;
    } catch (e) {}
    return null;
  }

  function currentTheme() {
    var stored = getStoredTheme();
    return stored ? stored : getSystemTheme();
  }

  function applyTheme(theme) {
    if (theme === 'light') {
      document.documentElement.setAttribute('data-theme', 'light');
    } else {
      document.documentElement.removeAttribute('data-theme');
    }
    document.querySelectorAll('.theme-toggle').forEach(function (btn) {
      btn.setAttribute('aria-pressed', theme === 'light' ? 'true' : 'false');
      btn.setAttribute('aria-label', theme === 'light' ? 'Cambiar a modo oscuro' : 'Cambiar a modo claro');
      btn.setAttribute('title', theme === 'light' ? 'Cambiar a modo oscuro' : 'Cambiar a modo claro');
    });
  }

  // Escuchar cambios automáticos del sistema si el usuario no ha forzado una preferencia manual
  if (mediaQuery) {
    var handler = function (e) {
      if (!getStoredTheme()) {
        applyTheme(e.matches ? 'light' : 'dark');
      }
    };
    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener('change', handler);
    } else if (mediaQuery.addListener) {
      mediaQuery.addListener(handler);
    }
  }

  // Ejecución inmediata al cargar el script
  applyTheme(currentTheme());

  document.addEventListener('DOMContentLoaded', function () {
    applyTheme(currentTheme());
    document.querySelectorAll('.theme-toggle').forEach(function (btn) {
      if (!btn.__vtListenerAttached) {
        btn.__vtListenerAttached = true;
        btn.addEventListener('click', function (e) {
          e.preventDefault();
          var active = currentTheme();
          var next = active === 'light' ? 'dark' : 'light';
          try { localStorage.setItem('vt-theme', next); } catch (err) {}
          applyTheme(next);
        });
      }
    });
  });
})();
