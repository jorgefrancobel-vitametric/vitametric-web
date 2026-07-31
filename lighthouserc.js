module.exports = {
  ci: {
    collect: {
      // Serve the static files from the repo root.
      staticDistDir: './',
      // Run Lighthouse 3 times and take the median for stable scores.
      numberOfRuns: 3,
      // Chrome headless flags for the CI environment.
      settings: {
        // CI gate profile: GitHub-hosted runners are already CPU-constrained, so avoid
        // applying Lighthouse's additional 4x CPU slowdown on top of the runner.
        // This keeps the strict gate deterministic; mobile realism is audited separately.
        throttling: {
          cpuSlowdownMultiplier: 1,
        },
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
