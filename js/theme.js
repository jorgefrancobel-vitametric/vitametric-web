(function () {
  function currentTheme() {
    var stored = null;
    try { stored = localStorage.getItem('vt-theme'); } catch (e) {}
    if (stored === 'light' || stored === 'dark') return stored;
    return document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
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
    });
  }

  // Ejecución inmediata
  applyTheme(currentTheme());

  document.addEventListener('DOMContentLoaded', function () {
    applyTheme(currentTheme());
    document.querySelectorAll('.theme-toggle').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var next = currentTheme() === 'light' ? 'dark' : 'light';
        try { localStorage.setItem('vt-theme', next); } catch (e) {}
        applyTheme(next);
      });
    });
  });
})();
