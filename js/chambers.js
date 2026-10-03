/* ==========================================================================
   Inner — Chamber previews (homepage "Go deeper" section)

   Native <audio> via `new Audio()` — no dependency, and nothing is fetched
   until the visitor presses a preview: no <audio> elements in the markup,
   no preload, no autoplay, no loop.

   Behavior
   - One preview at a time. Starting another stops and resets the current one.
   - Play/pause on the same control. Pause keeps the position; starting a
     different chamber (or the clip ending) resets.
   - The card carries its state in data-state (idle | playing | paused) and
     css/chambers.css does all the visuals from that; this file never touches
     styles beyond a single progress transform.
   - Fails gracefully: the preview files are dropped in later at
     /media/sounds/ (see data-preview-src in index.html). If one is missing
     or can't play, the control resets and a polite status line says so; the
     next press simply tries again.
   - Audio objects and their listeners are torn down whenever a preview
     stops or fails, and everything stops on pagehide.
   ========================================================================== */

(function () {
  'use strict';

  // The homepage section, or the dedicated Chambers page (chambers.html).
  var root = document.querySelector('.chambers, [data-chamber-previews]');
  if (!root) return;

  var items = Array.prototype.map.call(root.querySelectorAll('.chamber[data-preview-src]'), function (card) {
    return {
      card: card,
      button: card.querySelector('.chamber-play'),
      label: card.querySelector('.chamber-play-label'),
      bar: card.querySelector('.chamber-progress-bar'),
      status: card.querySelector('.chamber-status'),
      src: card.getAttribute('data-preview-src'),
      audio: null,
      listeners: null,
      onClick: null
    };
  }).filter(function (item) {
    return item.button && item.label && item.src;
  });

  if (!items.length) return;

  var current = null;

  function setState(item, state) {
    item.card.setAttribute('data-state', state);
    item.label.textContent = state === 'playing' ? 'Pause preview' : 'Preview Chamber';
  }

  function setProgress(item, ratio) {
    if (item.bar) item.bar.style.transform = 'scaleX(' + Math.max(0, Math.min(1, ratio)) + ')';
  }

  function say(item, message) {
    if (item.status) item.status.textContent = message || '';
  }

  function teardown(item) {
    var audio = item.audio;
    if (!audio) return;
    if (item.listeners) {
      Object.keys(item.listeners).forEach(function (type) {
        audio.removeEventListener(type, item.listeners[type]);
      });
    }
    item.listeners = null;
    audio.pause();
    // Detach the source so the browser drops the connection/buffer. Done
    // after the listeners are gone so this can't fire a spurious 'error'.
    audio.removeAttribute('src');
    audio.load();
    item.audio = null;
  }

  function reset(item) {
    teardown(item);
    setProgress(item, 0);
    setState(item, 'idle');
    if (current === item) current = null;
  }

  function fail(item) {
    reset(item);
    say(item, 'Preview coming soon.');
  }

  function attach(item) {
    var audio = new Audio();
    audio.preload = 'none';
    audio.loop = false;
    item.audio = audio;

    item.listeners = {
      playing: function () { setState(item, 'playing'); },
      pause: function () {
        // Native pause (our own button, or an OS/media-key pause). A clip
        // that has ended is handled by 'ended' instead.
        if (!audio.ended && item.card.getAttribute('data-state') === 'playing') setState(item, 'paused');
      },
      timeupdate: function () {
        if (audio.duration) setProgress(item, audio.currentTime / audio.duration);
      },
      ended: function () { reset(item); },
      error: function () { fail(item); }
    };
    Object.keys(item.listeners).forEach(function (type) {
      audio.addEventListener(type, item.listeners[type]);
    });

    audio.src = item.src;
  }

  function play(item) {
    if (current && current !== item) reset(current);
    current = item;
    say(item, '');
    if (!item.audio) attach(item);

    var started = item.audio.play();
    if (started && typeof started.catch === 'function') {
      started.catch(function (err) {
        // An interrupted play() (we paused/reset while it was loading) isn't
        // a failure; anything else — missing file, unsupported — is.
        if (err && err.name === 'AbortError') return;
        if (item.audio) fail(item);
      });
    }
  }

  function toggle(item) {
    if (item.card.getAttribute('data-state') === 'playing' && item.audio) {
      item.audio.pause();
    } else {
      play(item);
    }
  }

  items.forEach(function (item) {
    setState(item, 'idle');
    item.onClick = function () { toggle(item); };
    item.button.addEventListener('click', item.onClick);
  });

  function stopAll() {
    items.forEach(reset);
  }

  // A page restored from the back/forward cache must not resume playing.
  window.addEventListener('pagehide', stopAll);
})();
