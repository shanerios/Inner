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

  // Pointer parallax — fine pointer + motion allowed only, microscopic range.
  var bgLayer = document.querySelector('.threshold-parallax--bg');
  var orbLayer = document.querySelector('.threshold-parallax--orb');

  function onPointerMove(e) {
    if (reduceMotionQuery.matches || !finePointerQuery.matches) return;
    var rect = stage.getBoundingClientRect();
    var px = (e.clientX - rect.left) / rect.width - 0.5;
    var py = (e.clientY - rect.top) / rect.height - 0.5;
    if (bgLayer) bgLayer.style.transform = 'translate(' + (-px * 2).toFixed(2) + 'px, ' + (-py * 1.4).toFixed(2) + 'px)';
    if (orbLayer) orbLayer.style.transform = 'translate(' + (-px * 5).toFixed(2) + 'px, ' + (-py * 4).toFixed(2) + 'px)';
  }

  function resetPointer() {
    if (bgLayer) bgLayer.style.transform = '';
    if (orbLayer) orbLayer.style.transform = '';
  }

  stage.addEventListener('pointermove', onPointerMove);
  stage.addEventListener('pointerleave', resetPointer);
})();
