/* ==========================================================================
   Inner — Sanctum discovery behavior

   Two independent, unrelated mechanisms live in this file:

   1. Desktop/fine-pointer proximity discovery over the real Sanctum
      screenshot. Same principle as home.js (Orb) and practice.js
      (intentions): geometry is cached and only recomputed on resize, one
      rAF-throttled write per frame, continuous proximity rather than a
      binary hover. The one addition here is hysteresis — a region only
      becomes "active" (shows its annotation) past a higher threshold,
      and only deactivates below a lower one — so hovering near a
      boundary doesn't flicker the annotation on/off every frame.

      Keyboard focus bypasses proximity entirely: focusing a hotspot
      <button> activates its region immediately (no animation dependency
      on pointer movement), and blur/Escape clears it. The destination
      name + description also reaches screen readers directly via each
      button's own aria-label, independent of whether an annotation is
      ever visually shown.

   2. Mobile/touch disclosure — a plain expand/collapse toggle, entirely
      separate from the proximity system (see css/sanctum-discovery.css's
      media query that swaps one mechanism for the other).
   ========================================================================== */

(function () {
  'use strict';

  var portal = document.querySelector('.sanctum-portal');
  if (!portal) return;

  var reduceMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  var finePointerQuery = window.matchMedia('(pointer: fine)');
  var narrowQuery = window.matchMedia('(max-width: 680px)');

  var hotspots = Array.prototype.slice.call(portal.querySelectorAll('.sanctum-hotspot'));
  if (hotspots.length) {
    var regions = hotspots.map(function (btn) {
      return {
        name: btn.getAttribute('data-region'),
        el: btn,
        annotation: portal.querySelector('.sanctum-annotation[data-region="' + btn.getAttribute('data-region') + '"]'),
        proximity: 0
      };
    });

    var ACTIVATE = 0.6;
    var DEACTIVATE = 0.4;
    var FALLOFF_PX = 46;

    var rect = null;
    function refreshRect() {
      rect = portal.getBoundingClientRect();
      regions.forEach(function (r) {
        var b = r.el.getBoundingClientRect();
        r.box = {
          left: b.left - rect.left,
          top: b.top - rect.top,
          right: b.right - rect.left,
          bottom: b.bottom - rect.top
        };
      });
    }
    refreshRect();
    window.addEventListener('resize', refreshRect, { passive: true });

    function rectDistance(px, py, box) {
      var dx = Math.max(box.left - px, 0, px - box.right);
      var dy = Math.max(box.top - py, 0, py - box.bottom);
      return Math.sqrt(dx * dx + dy * dy);
    }

    var activeRegion = null;
    var keyboardLock = false; // true while a region is active via focus, not pointer

    function setActive(region) {
      if (activeRegion === region) return;
      if (activeRegion && activeRegion.annotation) activeRegion.annotation.classList.remove('is-active');
      activeRegion = region;
      if (activeRegion && activeRegion.annotation) activeRegion.annotation.classList.add('is-active');
    }

    function applyPointer(px, py) {
      var best = null;
      var bestP = 0;
      regions.forEach(function (r) {
        var d = rectDistance(px, py, r.box);
        var p = Math.max(0, Math.min(1, 1 - d / FALLOFF_PX));
        r.proximity = p;
        r.el.style.setProperty('--proximity', (p * 0.7).toFixed(3));
        if (p > bestP) {
          bestP = p;
          best = r;
        }
      });

      if (keyboardLock) return; // a focused hotspot always wins over pointer proximity

      if (activeRegion && activeRegion.proximity < DEACTIVATE) {
        setActive(null);
      }
      if (best && bestP >= ACTIVATE && best !== activeRegion) {
        if (!activeRegion || bestP > activeRegion.proximity) setActive(best);
      }
    }

    function resetProximity() {
      regions.forEach(function (r) {
        r.proximity = 0;
        r.el.style.setProperty('--proximity', 0);
      });
      if (!keyboardLock) setActive(null);
    }

    var pending = null;
    var ticking = false;
    function onPointerMove(e) {
      if (reduceMotionQuery.matches || !finePointerQuery.matches || narrowQuery.matches) return;
      // Raw viewport coordinates only — converted to portal-relative
      // space inside the rAF tick below, against a freshly-read portal
      // rect. Unlike the Threshold's sticky stage, the Sanctum portal is
      // a normal scrolled element: its viewport position keeps changing
      // as the page scrolls, so a rect cached once at load (or only on
      // resize) goes stale the moment the user scrolls to it. One
      // getBoundingClientRect() per animation frame — not per raw
      // pointermove — keeps this at the same cost as home.js's own
      // per-scroll-frame layout read.
      pending = { clientX: e.clientX, clientY: e.clientY };
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(function () {
        if (pending) {
          var r = portal.getBoundingClientRect();
          applyPointer(pending.clientX - r.left, pending.clientY - r.top);
        }
        ticking = false;
      });
    }

    portal.addEventListener('pointermove', onPointerMove);
    portal.addEventListener('pointerleave', resetProximity);

    // Keyboard: focusing a hotspot shows its annotation immediately,
    // independent of pointer position; blurring clears it (unless the
    // pointer itself is currently over a region, in which case pointer
    // state simply resumes on the next move).
    hotspots.forEach(function (btn) {
      var region = regions.filter(function (r) { return r.el === btn; })[0];
      btn.addEventListener('focus', function () {
        keyboardLock = true;
        setActive(region);
      });
      btn.addEventListener('blur', function () {
        keyboardLock = false;
        setActive(null);
      });
      btn.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') {
          btn.blur();
        }
      });
    });

    if (reduceMotionQuery.addEventListener) {
      reduceMotionQuery.addEventListener('change', function () {
        if (reduceMotionQuery.matches) resetProximity();
      });
    }
  }

  // ---------- Mobile/touch disclosure ----------

  var toggle = document.querySelector('.sanctum-disclosure-toggle');
  var panel = document.querySelector('.sanctum-disclosure-panel');
  if (toggle && panel) {
    toggle.addEventListener('click', function () {
      var open = toggle.getAttribute('aria-expanded') === 'true';
      toggle.setAttribute('aria-expanded', String(!open));
      panel.classList.toggle('is-open', !open);
      panel.toggleAttribute('inert', open);
    });
  }
})();
