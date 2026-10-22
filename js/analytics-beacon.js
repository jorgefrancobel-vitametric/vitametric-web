/*
 * Vitametric — legacy questionnaire analytics disabled.
 *
 * The previous beacon collected quiz answers and health scores. Keep this
 * inert compatibility file so cached HTML cannot restart that collection.
 * Operational conversion measurement uses the consent-gated GA4/Meta paths.
 */
(function (root) {
  'use strict';

  root.VitametricAnalytics = {
    track: function () { return false; },
    trackStart: function () { return false; },
    trackQuestionAnswered: function () { return false; },
    trackResult: function () { return false; },
    trackCTA: function () { return false; },
    trackEmailCaptured: function () { return false; },
    trackAbandon: function () { return false; },
    flushQueue: function () { return false; },
    configure: function () { return false; }
  };
}(typeof self !== 'undefined' ? self : this));
