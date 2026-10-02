/* ==========================================================================
   Inner — The Practice / Arrive behavior

   Drives the six intention-glow regions over the Arrive portal with a
   continuous pointer-proximity value, the same principle as the
   Threshold Orb (home.js): attention is tracked continuously, not a
   binary hover toggle. Fine-pointer desktop only, fully inert under
   reduced motion or on touch — mirrors home.js's guards exactly.

   Each region's center is a fixed fraction of the portal; the portal's
   own rect is read once per animation frame (not per raw pointermove),
   because it scrolls with the page. One rAF-throttled write per frame.
   ========================================================================== */

(function () {
  'use strict';

  var portal = document.querySelector('.arrive-portal-frame');
  if (!portal) return;

  var reduceMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  var finePointerQuery = window.matchMedia('(pointer: fine)');

  var glowEls = Array.prototype.slice.call(portal.querySelectorAll('.intention-glow'));
  if (!glowEls.length) return;

  // Centers as fractions of the portal frame, matching the left/top/width/
  // height percentages in css/practice.css for each .intention-glow--*
  // (measured from the actual asset — see the Phase pass report).
  var regions = [
    { el: find('lucidity'),    cx: 0.347, cy: 0.4065 },
    { el: find('clarity'),     cx: 0.660, cy: 0.4065 },
    { el: find('grounding'),   cx: 0.347, cy: 0.5110 },
    { el: find('healing'),     cx: 0.660, cy: 0.5110 },
    { el: find('reawakening'), cx: 0.347, cy: 0.6160 },
    { el: find('expansion'),   cx: 0.660, cy: 0.6160 }
  ].filter(function (r) { return !!r.el; });

  function find(name) {
    return portal.querySelector('.intention-glow--' + name);
  }

  var RADIUS = 0.22; // falloff radius, as a fraction of portal size
  var pending = null;
  var ticking = false;

  function apply(px, py) {
    regions.forEach(function (r) {
      var dx = px - r.cx;
      var dy = py - r.cy;
      var distance = Math.sqrt(dx * dx + dy * dy);
      var proximity = Math.max(0, Math.min(1, 1 - distance / RADIUS));
      r.el.style.setProperty('--intention-proximity', proximity.toFixed(3));
    });
  }

  function reset() {
    regions.forEach(function (r) {
      r.el.style.setProperty('--intention-proximity', 0);
    });
  }

  function onPointerMove(e) {
    if (reduceMotionQuery.matches || !finePointerQuery.matches) return;
    // Raw client coords only; converted against a fresh portal rect in the
    // rAF tick. This section scrolls with the page, so a rect cached at
    // load (or only on resize) goes stale as soon as the user scrolls to
    // it and the glow regions stop lining up with the pointer.
    pending = { clientX: e.clientX, clientY: e.clientY };
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(function () {
      if (pending) {
        var r = portal.getBoundingClientRect();
        apply((pending.clientX - r.left) / r.width, (pending.clientY - r.top) / r.height);
      }
      ticking = false;
    });
  }

  portal.addEventListener('pointermove', onPointerMove);
  portal.addEventListener('pointerleave', reset);

  if (reduceMotionQuery.addEventListener) {
    reduceMotionQuery.addEventListener('change', function () {
      if (reduceMotionQuery.matches) reset();
    });
  }
})();
