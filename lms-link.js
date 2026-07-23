/**
 * AIRL landing → LMS.
 *
 * The desktop "Начать обучение" buttons already opened the platform, but the
 * mobile menu's copy of the same button pointed at #events — so on phones it
 * just scrolled down the page instead of opening the LMS.
 *
 * That is fixed at the source (site-updates.js). This script is the safety net:
 * it points every "Начать обучение" CTA at the configured address on load, so
 * the URL lives in ONE place and survives a bundle rebuild.
 *
 * ── TO CHANGE THE PLATFORM URL, EDIT ONE LINE ────────────────────────────────
 *   index.html:  <script>window.AIRL_LMS_URL = 'https://lms.magauin.kz/';</script>
 * ─────────────────────────────────────────────────────────────────────────────
 */
(function () {
  'use strict';

  var LMS_URL = (window.AIRL_LMS_URL || 'https://lms.magauin.kz/').replace(
    /\/+$/,
    '',
  );

  /** Text on the buttons that should open the platform. */
  var CTA_TEXT = 'начать обучение';

  function isCta(a) {
    return (a.textContent || '').trim().toLowerCase().indexOf(CTA_TEXT) !== -1;
  }

  function pointAtLms(a) {
    if (a.getAttribute('data-lms-linked') === '1') return;
    a.setAttribute('href', LMS_URL);
    a.setAttribute('target', '_blank');
    a.setAttribute('rel', 'noopener noreferrer');
    a.setAttribute('data-lms-linked', '1');
  }

  function sweep() {
    var anchors = document.querySelectorAll('a');
    for (var i = 0; i < anchors.length; i++) {
      if (isCta(anchors[i])) pointAtLms(anchors[i]);
    }
  }

  /**
   * The landing is a Vue SPA and the mobile menu is injected by
   * site-updates.js, so CTAs appear after first paint. Sweep across a few
   * frames, then watch for late re-renders, then stop.
   */
  function start() {
    sweep();

    var frames = 0;
    (function tick() {
      sweep();
      if (++frames < 120) requestAnimationFrame(tick);
    })();

    var observer = new MutationObserver(sweep);
    observer.observe(document.body, { childList: true, subtree: true });
    setTimeout(function () {
      observer.disconnect();
    }, 20000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
