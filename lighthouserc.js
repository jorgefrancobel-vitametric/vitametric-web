module.exports = {
  ci: {
    collect: {
      // Serve the static files from the repo root.
      staticDistDir: './',
      // Run Lighthouse 3 times and take the median for stable scores.
      numberOfRuns: 3,
      // Chrome headless flags for the CI environment.
      settings: {
        chromeFlags: ['--no-sandbox', '--disable-setuid-sandbox'],
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
