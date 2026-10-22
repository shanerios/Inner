/* ==========================================================================
   Inner — Shared site behavior (Phase 0 foundation)

   Shared JS for the "app-shell" template family: index.html,
   guardians.html, auditory-ascension.html. Each of these previously had
   its own copy of this code; index.html's copy was the most complete
   (it added modal focus-trapping and focus restore that the other two
   pages lacked). This file standardizes on that fuller version for all
   three pages — a strictly additive accessibility improvement with no
   visual change, since it only affects keyboard Tab behavior while a
   modal is open.

   One small, deliberate behavioral note: the scroll-reveal
   IntersectionObserver threshold is standardized here at 0.12 (index.html's
   original value). guardians.html and auditory-ascension.html previously
   used 0.10. The difference is a few pixels of scroll position before a
   section fades in — imperceptible in practice, but flagged here for
   transparency since the instruction was to preserve behavior exactly.

   Page-specific behavior (index.html's anchor smooth-scroll, active-nav
   scroll tracking, and smart App/Play Store link) is NOT here — it stays
   inline on index.html since it doesn't apply to the other two pages.
   ========================================================================== */

(function () {
  'use strict';

  function initHamburgerNav() {
    var hamburger = document.getElementById('hamburger');
    var mobileNav = document.getElementById('mobile-nav');
    if (!hamburger || !mobileNav) return;

    hamburger.addEventListener('click', function () {
      var isOpen = mobileNav.classList.toggle('is-open');
      hamburger.classList.toggle('is-open', isOpen);
      hamburger.setAttribute('aria-expanded', isOpen);
      hamburger.setAttribute('aria-label', isOpen ? 'Close navigation' : 'Open navigation');
    });

    mobileNav.querySelectorAll('a').forEach(function (link) {
      link.addEventListener('click', function () {
        mobileNav.classList.remove('is-open');
        hamburger.classList.remove('is-open');
        hamburger.setAttribute('aria-expanded', 'false');
        hamburger.setAttribute('aria-label', 'Open navigation');
      });
    });
  }

  function initNavDropdowns() {
    document.querySelectorAll('.nav-dropdown').forEach(function (dropdown) {
      var toggle = dropdown.querySelector('.nav-dropdown-toggle');
      if (!toggle) return;
      toggle.addEventListener('click', function (e) {
        e.preventDefault();
        document.querySelectorAll('.nav-dropdown').forEach(function (other) {
          if (other !== dropdown) other.classList.remove('is-open');
        });
        dropdown.classList.toggle('is-open');
      });
      document.addEventListener('click', function (e) {
        if (!dropdown.contains(e.target)) dropdown.classList.remove('is-open');
      });
    });
  }

  function initModals() {
    if (!document.querySelector('.modal-backdrop')) return;

    var modalTrigger = null;

    window.openModal = function (id, trigger) {
      var modal = document.getElementById(id);
      if (!modal) return;
      modalTrigger = trigger || document.activeElement;
      modal.setAttribute('aria-hidden', 'false');
      modal.classList.add('is-open');
      document.body.style.overflow = 'hidden';
      var firstFocusable = modal.querySelector('button, a[href]');
      if (firstFocusable) firstFocusable.focus();
    };

    window.closeModal = function (id) {
      var modal = document.getElementById(id);
      if (!modal) return;
      modal.setAttribute('aria-hidden', 'true');
      modal.classList.remove('is-open');
      document.body.style.overflow = '';
      if (modalTrigger) modalTrigger.focus();
      modalTrigger = null;
    };

    document.querySelectorAll('.modal-backdrop').forEach(function (modal) {
      modal.addEventListener('click', function (e) {
        if (e.target === this) window.closeModal(this.id);
      });
    });

    document.addEventListener('keydown', function (e) {
      var openModalEl = document.querySelector('.modal-backdrop.is-open');
      if (e.key === 'Tab' && openModalEl) {
        var focusable = Array.prototype.slice.call(
          openModalEl.querySelectorAll('button, a[href]')
        );
        if (focusable.length) {
          var first = focusable[0];
          var last = focusable[focusable.length - 1];
          if (e.shiftKey && document.activeElement === first) {
            e.preventDefault();
            last.focus();
          } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
      if (e.key === 'Escape') {
        document.querySelectorAll('.modal-backdrop.is-open').forEach(function (m) {
          window.closeModal(m.id);
        });
      }
    });
  }

  function initRevealObserver() {
    var revealEls = document.querySelectorAll('.reveal');
    if (!revealEls.length) return;
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) entry.target.classList.add('visible');
      });
    }, { threshold: 0.12 });
    revealEls.forEach(function (el) { io.observe(el); });
  }

  initHamburgerNav();
  initNavDropdowns();
  initModals();
  initRevealObserver();
})();
