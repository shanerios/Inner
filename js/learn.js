/* ==========================================================================
   Inner — Learn (field-guide pages)

   Small and optional: the page reads completely without it.
   1. Arrival: section heads and pauses fade in once (12px, short).
   2. Contents: highlight the section being read, in the desktop margin index
      and the narrow-screen disclosure; fill the index hairline / thin
      progress line as the guide is read.
   3. Seven nights: each tick lights as it is reached.
   4. The narrow-screen Contents disclosure closes after a link is chosen.
   No scroll-jacking, no parallax, no libraries.
   ========================================================================== */

(function () {
  'use strict';

  var article = document.querySelector('.learn-article');
  if (!article) return;

  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var hasIO = 'IntersectionObserver' in window;

  /* 1 + 3 — Arrival and ticks */
  var revealEls = Array.prototype.slice.call(document.querySelectorAll('.learn-rv, .learn-plate'));
  var ticks = Array.prototype.slice.call(document.querySelectorAll('.learn-night'));

  if (!hasIO || reduce) {
    revealEls.forEach(function (el) { el.classList.add('is-in'); });
    ticks.forEach(function (el) { el.classList.add('is-lit'); });
  } else {
    var arrive = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-in');
          arrive.unobserve(entry.target);
        }
      });
    }, { threshold: 0.15, rootMargin: '0px 0px -6% 0px' });
    revealEls.forEach(function (el) { arrive.observe(el); });

    var light = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-lit');
          light.unobserve(entry.target);
        }
      });
    }, { threshold: 0.6 });
    ticks.forEach(function (el) { light.observe(el); });
  }

  /* 2 — Contents */
  var links = Array.prototype.slice.call(document.querySelectorAll('.learn-index a, .learn-contents a'));
  var sections = [];
  links.forEach(function (a) {
    var id = (a.getAttribute('href') || '').replace('#', '');
    var el = id && document.getElementById(id);
    if (el && sections.indexOf(el) === -1) sections.push(el);
  });

  function setActive(id) {
    links.forEach(function (a) {
      var on = a.getAttribute('href') === '#' + id;
      if (on) a.setAttribute('aria-current', 'true');
      else a.removeAttribute('aria-current');
    });
  }

  var epilogue = document.querySelector('.learn-epilogue');
  var ticking = false;
  function frame() {
    ticking = false;
    var vh = window.innerHeight || 800;

    // Section being read: the last one whose top has passed ~35% down the viewport.
    var current = null;
    sections.forEach(function (s) {
      if (s.getBoundingClientRect().top <= vh * 0.35) current = s.id;
    });
    setActive(current || '');

    // Reading progress through the article.
    var r = article.getBoundingClientRect();
    var total = r.height - vh * 0.5;
    var done = vh * 0.25 - r.top;
    var p = total > 0 ? Math.max(0, Math.min(1, done / total)) : 0;
    // The guide is over once the epilogue arrives: the margin index steps back.
    if (epilogue) article.classList.toggle('is-ended', epilogue.getBoundingClientRect().top < vh * 0.72);
    article.style.setProperty('--learn-progress', p.toFixed(4));
    document.documentElement.style.setProperty('--learn-progress', p.toFixed(4));
  }

  function request() {
    if (!ticking) {
      ticking = true;
      requestAnimationFrame(frame);
    }
  }

  window.addEventListener('scroll', request, { passive: true });
  window.addEventListener('resize', request);
  request();

  /* 4 — Contents disclosure: close after choosing */
  var disclosure = document.querySelector('.learn-contents details');
  if (disclosure) {
    disclosure.addEventListener('click', function (e) {
      var a = e.target.closest && e.target.closest('a');
      if (a) disclosure.removeAttribute('open');
    });
  }
})();
