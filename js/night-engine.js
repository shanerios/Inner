/* ==========================================================================
   Inner — The Night Engine behavior

   Mirrors js/home.js's Approach pattern exactly: a tall wrapper with a
   sticky stage, driven by a single --ne-progress (0..1) custom property
   that CSS reads for every visual change. This file only computes
   numbers (progress, and three derived "signal layer" intensities) —
   all visuals live in css/night-engine.css.

   The sticky/scroll-scrubbed presentation only activates once
   .is-enhanced is added below, and it is deliberately withheld under
   TWO conditions, not just reduced motion: prefers-reduced-motion, and
   narrow (<=680px) viewports. Below that width the timeline is
   recomposed as a plain static list (see night-engine.css) rather than
   shrinking a horizontal scrub timeline into something that would force
   overflow or stop making sense — so both cases fall back to the exact
   same safe, fully-legible default rendering already present in the
   markup before any JS runs.

   The "Hear the Signal" button is visual-only: no audio asset exists
   for the actual Recognition tone, so this intentionally does not play,
   synthesize, or substitute a sound. It only triggers a CSS ring-pulse.
   ========================================================================== */

(function () {
  'use strict';

  var wrap = document.querySelector('.ne-timeline-wrap');
  var stage = document.querySelector('.ne-timeline-stage');
  if (!wrap || !stage) return;

  var reduceMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  var narrowQuery = window.matchMedia('(max-width: 680px)');

  var stages = Array.prototype.slice.call(document.querySelectorAll('.ne-stage'));
  var recognitionOverlay = document.querySelector('.ne-recognition-overlay');

  var enhanced = false;
  var ticking = false;
  var lastActiveIndex = -1;

  // A trapezoid envelope: ramps 0->1 between a/b, holds at 1 through
  // b/c, ramps 1->0 between c/d. Used for each signal layer's intensity
  // as a function of overall progress — qualitative, not a claim about
  // exact timing within a real Overnight Journey.
  function trapezoid(p, a, b, c, d) {
    if (p <= a || p >= d) return 0;
    if (p < b) return (p - a) / (b - a);
    if (p <= c) return 1;
    return 1 - (p - c) / (d - c);
  }

  function computeProgress() {
    var total = wrap.offsetHeight - window.innerHeight;
    if (total <= 0) return 0;
    var rect = wrap.getBoundingClientRect();
    var scrolled = -rect.top;
    return Math.min(1, Math.max(0, scrolled / total));
  }

  function applyProgress(p) {
    stage.style.setProperty('--ne-progress', p.toFixed(4));
    stage.style.setProperty('--ne-l-entrainment', trapezoid(p, 0.1667, 0.3333, 0.8333, 1).toFixed(3));
    stage.style.setProperty('--ne-l-noise', trapezoid(p, 0.3333, 0.5, 0.6667, 0.8333).toFixed(3));
    stage.style.setProperty('--ne-l-signal', trapezoid(p, 0.6, 0.6667, 0.8333, 0.9).toFixed(3));

    var activeIndex = Math.min(6, Math.floor(p * 6 + 0.0001));
    if (activeIndex === lastActiveIndex) return;
    lastActiveIndex = activeIndex;

    stages.forEach(function (el) {
      var i = parseInt(el.getAttribute('data-index'), 10);
      el.classList.toggle('is-active', i === activeIndex);
      el.classList.toggle('is-passed', i < activeIndex);
    });

    var atRecognition = activeIndex === 4;
    stage.classList.toggle('is-recognition', atRecognition);
    if (recognitionOverlay) recognitionOverlay.classList.toggle('is-visible', atRecognition);
  }

  // Same capture-phase rationale as home.js: this page's <body> can end
  // up being its own scroll container depending on total page height,
  // and 'scroll' doesn't bubble, so only a capture-phase window listener
  // reliably catches it.
  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(function () {
      applyProgress(computeProgress());
      ticking = false;
    });
  }

  function enableEnhanced() {
    if (enhanced) return;
    enhanced = true;
    wrap.classList.add('is-enhanced');
    window.addEventListener('scroll', onScroll, { passive: true, capture: true });
    window.addEventListener('resize', onScroll, { passive: true });
    onScroll();
  }

  function disableEnhanced() {
    if (enhanced) {
      enhanced = false;
      wrap.classList.remove('is-enhanced');
      window.removeEventListener('scroll', onScroll, { capture: true });
      window.removeEventListener('resize', onScroll);
    }
    stage.style.setProperty('--ne-progress', 0);
    stage.style.setProperty('--ne-l-entrainment', 0);
    stage.style.setProperty('--ne-l-noise', 0);
    stage.style.setProperty('--ne-l-signal', 0);
    lastActiveIndex = -1;
    stage.classList.remove('is-recognition');
    stages.forEach(function (el) {
      el.classList.remove('is-active', 'is-passed');
    });
    if (recognitionOverlay) recognitionOverlay.classList.remove('is-visible');
  }

  function syncEnhancement() {
    if (reduceMotionQuery.matches || narrowQuery.matches) disableEnhanced();
    else enableEnhanced();
  }

  syncEnhancement();
  if (reduceMotionQuery.addEventListener) reduceMotionQuery.addEventListener('change', syncEnhancement);
  if (narrowQuery.addEventListener) narrowQuery.addEventListener('change', syncEnhancement);

  var signalBtn = document.querySelector('.ne-signal-btn');
  if (signalBtn) {
    signalBtn.addEventListener('click', function () {
      signalBtn.classList.remove('is-pulsing');
      void signalBtn.offsetWidth; // force reflow so rapid re-clicks still restart the animation
      signalBtn.classList.add('is-pulsing');
    });
  }
})();
