module.exports = {
  ci: {
    collect: {
      // Serve the static files from the repo root.
      staticDistDir: './',
      // Sin URLs declaradas, LHCI autodescubre HTML (tope 5, prof. 2) y siempre
      // incluye 404.html. Esa página lleva `noindex` — correcto en una página de
      // error, pero Lighthouse lo marca como "page is blocked from indexing"
      // (is-crawlable) y hunde su SEO a 0.63 < 0.95, enrojeciendo todo el gate.
      // Se excluye del autodescubrimiento; los umbrales siguen intactos para las
      // páginas de contenido.
      autodiscoverUrlBlocklist: ['404.html'],
      // Five runs reduce CI noise; LHCI asserts against the median.
      numberOfRuns: 5,
      // Chrome headless flags for the CI environment.
      settings: {
        // Deterministic desktop CI profile with explicit DevTools throttling.
        // Mobile realism is audited separately; score thresholds remain strict.
        preset: 'desktop',
        throttlingMethod: 'devtools',
        throttling: {
          rttMs: 40,
          throughputKbps: 10240,
          requestLatencyMs: 40,
          downloadThroughputKbps: 10240,
          uploadThroughputKbps: 10240,
          cpuSlowdownMultiplier: 1,
        },
        // LHCI 0.14 passes this value directly to Lighthouse; use a string so
        // the Linux runner receives the sandbox flags instead of dropping them.
        chromeFlags: '--no-sandbox --disable-setuid-sandbox --disable-dev-shm-usage',
      },
    },
    assert: {
      assertions: {
        'categories:performance': ['error', { minScore: 0.90 }],
        'categories:accessibility': ['error', { minScore: 0.95 }],
        'categories:best-practices': ['error', { minScore: 0.95 }],
        'categories:seo': ['error', { minScore: 0.95 }],
      },
    },
    upload: {
      // Keep reports on the runner so failed assertions remain inspectable in Actions.
      target: 'filesystem',
      outputDir: '.lighthouseci',
    },
  },
};
