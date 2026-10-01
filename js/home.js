/* ==========================================================================
   Inner — Homepage opening sequence behavior (Phase 1)

   Drives the Threshold -> Approach scroll transition by writing a single
   --progress (0..1) custom property onto the sticky stage; every visual
   change (scale, opacity, darkening) lives in css/home.css as a function
   of that one variable. This file only computes the number.

   Reduced motion: the tall/sticky "Approach" CSS only activates once
   .is-enhanced is added below. If prefers-reduced-motion is set (now or
   later, via the media query's change event), that class is removed and
   --progress is reset to 0, collapsing the section back to a plain
   static 100vh Threshold with no scroll-jacking.

   Pointer parallax: fine-pointer desktop only, microscopic, and fully
   skipped under reduced motion.
   ========================================================================== */

(function () {
  'use strict';

  var wrap = document.querySelector('.threshold-wrap');
  var stage = document.querySelector('.threshold-stage');
  if (!wrap || !stage) return;

  var reduceMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  var finePointerQuery = window.matchMedia('(pointer: fine)');

  var enhanced = false;
  var ticking = false;

  function computeProgress() {
    var total = wrap.offsetHeight - window.innerHeight;
    if (total <= 0) return 0;
    var rect = wrap.getBoundingClientRect();
    var scrolled = -rect.top;
    return Math.min(1, Math.max(0, scrolled / total));
  }

  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(function () {
      stage.style.setProperty('--progress', computeProgress().toFixed(4));
      ticking = false;
    });
  }

  // This page's <body> has height:100% and can end up being its own
  // scroll container (rather than the document/window scrolling
  // normally) depending on total page height. The 'scroll' event
  // doesn't bubble, so a plain window listener can miss that — a
  // capture-phase listener on window catches it regardless of which
  // element actually scrolled.
  function enableEnhanced() {
    if (enhanced) return;
    enhanced = true;
    wrap.classList.add('is-enhanced');
    window.addEventListener('scroll', onScroll, { passive: true, capture: true });
    window.addEventListener('resize', onScroll, { passive: true });
    onScroll();
  }

  function disableEnhanced() {
    if (!enhanced) return;
    enhanced = false;
    wrap.classList.remove('is-enhanced');
    window.removeEventListener('scroll', onScroll, { capture: true });
    window.removeEventListener('resize', onScroll);
    stage.style.setProperty('--progress', 0);
  }

  function syncMotionPreference() {
    if (reduceMotionQuery.matches) disableEnhanced();
    else enableEnhanced();
  }

  syncMotionPreference();
  if (reduceMotionQuery.addEventListener) {
    reduceMotionQuery.addEventListener('change', syncMotionPreference);
  }

  // Pointer parallax + Orb proximity — fine pointer + motion allowed only,
  // microscopic range. Geometry (the stage rect, and where the Orb's focal
  // point sits within it) is cached and only recomputed on resize, so
  // pointermove itself never forces a layout read.
  var bgLayer = document.querySelector('.threshold-parallax--bg');
  var orbLayer = document.querySelector('.threshold-parallax--orb');
  var orbProximityTarget = document.querySelector('.threshold-orb-proximity');
  var narrowQuery = window.matchMedia('(max-width: 680px)');

  var stageRect = null;
  function refreshStageRect() {
    stageRect = stage.getBoundingClientRect();
  }
  refreshStageRect();
  window.addEventListener('resize', refreshStageRect, { passive: true });

  var pendingPointer = null;
  var pointerTicking = false;

  function applyPointer(px, py) {
    if (bgLayer) bgLayer.style.transform = 'translate(' + (-px * 2).toFixed(2) + 'px, ' + (-py * 1.4).toFixed(2) + 'px)';
    if (orbLayer) orbLayer.style.transform = 'translate(' + (-px * 5).toFixed(2) + 'px, ' + (-py * 4).toFixed(2) + 'px)';

    if (orbProximityTarget) {
      // Orb's approximate visual center as a fraction of the stage,
      // matching the object-position/--orb-focal-* values in home.css
      // for the currently active (landscape vs portrait) art direction.
      var focalY = narrowQuery.matches ? 0.54 : 0.43;
      var dx = px; // px/py are already centered fractions of stage size (-0.5..0.5)
      var dy = (py + 0.5) - focalY;
      var distance = Math.sqrt(dx * dx + dy * dy);
      var radius = 0.48; // falloff radius, as a fraction of stage size
      var proximity = Math.max(0, Math.min(1, 1 - distance / radius));
      orbProximityTarget.style.setProperty('--orb-proximity', proximity.toFixed(3));
    }
  }

  function onPointerMove(e) {
    if (reduceMotionQuery.matches || !finePointerQuery.matches || !stageRect) return;
    pendingPointer = {
      px: (e.clientX - stageRect.left) / stageRect.width - 0.5,
      py: (e.clientY - stageRect.top) / stageRect.height - 0.5
    };
    if (pointerTicking) return;
    pointerTicking = true;
    requestAnimationFrame(function () {
      if (pendingPointer) applyPointer(pendingPointer.px, pendingPointer.py);
      pointerTicking = false;
    });
  }

  function resetPointer() {
    pendingPointer = null;
    if (bgLayer) bgLayer.style.transform = '';
    if (orbLayer) orbLayer.style.transform = '';
    if (orbProximityTarget) orbProximityTarget.style.setProperty('--orb-proximity', 0);
  }

  stage.addEventListener('pointermove', onPointerMove);
  stage.addEventListener('pointerleave', resetPointer);
})();
