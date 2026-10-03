/* ==========================================================================
   Inner — About

   Optional and tiny: the page reads completely without it. The central
   question and the closing lines arrive with one slow fade the first time they
   are scrolled into view. No scroll effects, no libraries.
   ========================================================================== */

(function () {
  'use strict';

  var els = Array.prototype.slice.call(document.querySelectorAll('.about-rv'));
  if (!els.length) return;

  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce || !('IntersectionObserver' in window)) {
    els.forEach(function (el) { el.classList.add('is-in'); });
    return;
  }

  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-in');
        io.unobserve(entry.target);
      }
    });
  }, { threshold: 0.2, rootMargin: '0px 0px -6% 0px' });

  els.forEach(function (el) { io.observe(el); });
})();
