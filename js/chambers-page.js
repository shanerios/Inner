/* ==========================================================================
   Inner — The Chambers page (chambers.html)

   Three small jobs, no dependencies:
   1. Arrival: mark each section .is-in the first time it is meaningfully on
      screen; css/chambers-page.css does all the revealing from that.
   2. The descent rail: tell it which Chamber currently crosses the middle of
      the viewport (data-n on #descent; 0 = opening/ending, rail hidden).
   3. A slow parallax drift of the artwork (--py), only while it is on
      screen, and never under prefers-reduced-motion.

   Audio previews are not handled here — js/chambers.js does that, unchanged.
   Everything degrades to a fully visible static page without
   IntersectionObserver.
   ========================================================================== */

(function () {
  'use strict';

  var sections = Array.prototype.slice.call(document.querySelectorAll('main > section'));
  if (!sections.length) return;

  var rail = document.getElementById('descent');
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (!('IntersectionObserver' in window)) {
    sections.forEach(function (s) { s.classList.add('is-in'); });
    return;
  }

  /* 1 — Arrival */
  var arrive = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-in');
        arrive.unobserve(entry.target);
      }
    });
  }, { threshold: 0.2, rootMargin: '0px 0px -6% 0px' });
  sections.forEach(function (s) { arrive.observe(s); });

  /* 2 — Rail: the section crossing the viewport's centre line */
  if (rail) {
    var current = null;
    var centre = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        var n = entry.target.getAttribute('data-n') || '0';
        if (n !== current) {
          current = n;
          rail.setAttribute('data-n', n);
        }
      });
    }, { rootMargin: '-50% 0px -50% 0px', threshold: 0 });
    sections.forEach(function (s) { centre.observe(s); });
  }

  /* 3 — Drift */
  if (reduce) return;

  var arts = Array.prototype.slice.call(document.querySelectorAll('.chm-art')).map(function (el) {
    return { el: el, amp: parseFloat(el.getAttribute('data-drift')) || 24, on: false };
  });
  var live = [];
  var ticking = false;

  function frame() {
    ticking = false;
    var vh = window.innerHeight || 800;
    live.forEach(function (a) {
      var r = a.el.getBoundingClientRect();
      var p = (r.top + r.height / 2 - vh / 2) / vh;      // ~ -1 .. 1
      p = Math.max(-1, Math.min(1, p));
      a.el.style.setProperty('--py', (-p * a.amp).toFixed(1) + 'px');
    });
  }

  function request() {
    if (!ticking && live.length) {
      ticking = true;
      requestAnimationFrame(frame);
    }
  }

  var watch = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      var a = arts.filter(function (x) { return x.el === entry.target; })[0];
      if (a) a.on = entry.isIntersecting;
    });
    live = arts.filter(function (x) { return x.on; });
    request();
  }, { rootMargin: '10% 0px 10% 0px' });
  arts.forEach(function (a) { watch.observe(a.el); });

  window.addEventListener('scroll', request, { passive: true });
  window.addEventListener('resize', request);
})();
