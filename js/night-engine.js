/* ==========================================================================
   Inner — The Night Engine behavior

   Mirrors js/home.js's Approach pattern exactly: a tall wrapper with a
   sticky stage, driven by a single --ne-progress (0..1) custom property
   that CSS reads for every visual change. This file only computes
   numbers (progress, derived "signal layer" intensities, and which
   named stage is active) — all visuals live in css/night-engine.css.

   The sticky/scroll-scrubbed presentation only activates once
   .is-enhanced is added below, and it is deliberately withheld under
   TWO conditions, not just reduced motion: prefers-reduced-motion, and
   narrow (<=680px) viewports. Below that width the timeline is
   recomposed as a plain static list (see night-engine.css) rather than
   shrinking a horizontal scrub timeline into something that would force
   overflow or stop making sense — so both cases fall back to the exact
   same safe, fully-legible default rendering already present in the
   markup before any JS runs.

   Stage boundaries are deliberately NOT evenly spaced: Recognition gets
   roughly three times the scroll range of any other single stage (see
   STAGE_BOUNDARIES) so it reads as the dwell point of the journey, not
   a stage like the others. Within that range, reaching Recognition
   plays a one-shot sequence — marker pulse, instrumentation recedes,
   "the signal" label, then the dominant question, then the button, then
   the real product screenshot — staged by further progress thresholds
   rather than a fixed timer, so it stays scroll-controlled.

   The "Hear the Signal" button plays the real cue
   (media/sounds/lucidity_cue.mp3/.wav) on click only — never
   autoplayed, and only in response to a direct user gesture.
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
  var marker = document.querySelector('.ne-marker');

  // Fraction of overall progress at which each stage BEGINS (7 stages,
  // so 7 values — the 8th implicit boundary is 1). Recognition (index 4)
  // spans 0.46-0.80: a 0.34 range versus ~0.10-0.14 for every other
  // stage, i.e. substantially more dwell time than any individual
  // stage, by design.
  var STAGE_BOUNDARIES = [0, 0.10, 0.20, 0.32, 0.46, 0.80, 0.90];
  var RECOGNITION_INDEX = 4;

  // Within Recognition's own range, the progress points at which each
  // beat of the sequence reveals. These are offsets from the stage's
  // own start (0.46), not absolute progress.
  var REC_QUESTION_AT = 0.50;
  var REC_DETAIL_AT = 0.55;
  var REC_PROOF_AT = 0.62;

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

  function activeIndexFor(p) {
    var i = STAGE_BOUNDARIES.length - 1;
    while (i > 0 && p < STAGE_BOUNDARIES[i]) i--;
    return i;
  }

  function computeProgress() {
    var total = wrap.offsetHeight - window.innerHeight;
    if (total <= 0) return 0;
    var rect = wrap.getBoundingClientRect();
    var scrolled = -rect.top;
    return Math.min(1, Math.max(0, scrolled / total));
  }

  function pulseMarker() {
    if (!marker) return;
    marker.classList.remove('is-pulsing');
    void marker.offsetWidth; // force reflow so re-entering recognition restarts the pulse
    marker.classList.add('is-pulsing');
  }

  function applyProgress(p) {
    stage.style.setProperty('--ne-progress', p.toFixed(4));
    stage.style.setProperty('--ne-l-entrainment', trapezoid(p, 0.10, 0.20, 0.90, 1).toFixed(3));
    stage.style.setProperty('--ne-l-noise', trapezoid(p, 0.20, 0.32, 0.46, 0.60).toFixed(3));
    stage.style.setProperty('--ne-l-signal', trapezoid(p, 0.40, 0.46, 0.80, 0.86).toFixed(3));

    var activeIndex = activeIndexFor(p);
    var atRecognition = activeIndex === RECOGNITION_INDEX;

    if (activeIndex !== lastActiveIndex) {
      if (atRecognition && lastActiveIndex !== RECOGNITION_INDEX) pulseMarker();
      lastActiveIndex = activeIndex;
      stages.forEach(function (el) {
        var i = parseInt(el.getAttribute('data-index'), 10);
        el.classList.toggle('is-active', i === activeIndex);
        el.classList.toggle('is-passed', i < activeIndex);
      });
      stage.classList.toggle('is-recognition', atRecognition);
    }

    if (recognitionOverlay) {
      recognitionOverlay.classList.toggle('is-visible', atRecognition);
      recognitionOverlay.classList.toggle('show-question', atRecognition && p >= REC_QUESTION_AT);
      recognitionOverlay.classList.toggle('show-detail', atRecognition && p >= REC_DETAIL_AT);
      recognitionOverlay.classList.toggle('show-proof', atRecognition && p >= REC_PROOF_AT);
    }
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
    if (recognitionOverlay) {
      recognitionOverlay.classList.remove('is-visible', 'show-question', 'show-detail', 'show-proof');
    }
  }

  function syncEnhancement() {
    if (reduceMotionQuery.matches || narrowQuery.matches) disableEnhanced();
    else enableEnhanced();
  }

  syncEnhancement();
  if (reduceMotionQuery.addEventListener) reduceMotionQuery.addEventListener('change', syncEnhancement);
  if (narrowQuery.addEventListener) narrowQuery.addEventListener('change', syncEnhancement);

  var signalBtn = document.querySelector('.ne-signal-btn');
  var signalAudio = document.querySelector('.ne-signal-audio');
  if (signalBtn) {
    signalBtn.addEventListener('click', function () {
      signalBtn.classList.remove('is-pulsing');
      void signalBtn.offsetWidth; // force reflow so rapid re-clicks still restart the animation
      signalBtn.classList.add('is-pulsing');

      if (signalAudio) {
        signalAudio.currentTime = 0;
        // play() can reject (e.g. a user gesture edge case); this is a
        // direct click handler so it should resolve, but never surface
        // an unhandled rejection either way.
        var playResult = signalAudio.play();
        if (playResult && playResult.catch) playResult.catch(function () {});
      }
    });
  }
})();
