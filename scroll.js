/* ============================================================
   EU2050 — scroll motion layer
   Loads AFTER app.js. Reads the DOM app.js produces; never
   writes to the data model. Safe to delete: removing this file
   and its <script> tag restores the original behaviour.
   ============================================================ */
(function () {
  'use strict';

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  var hasGSAP = typeof window.gsap !== 'undefined' && typeof window.ScrollTrigger !== 'undefined';

  // Bail cleanly. Without html.motion, scroll.css applies nothing.
  if (reduceMotion.matches || !hasGSAP) return;

  document.documentElement.classList.add('motion');

  var gsap = window.gsap;
  var ScrollTrigger = window.ScrollTrigger;
  gsap.registerPlugin(ScrollTrigger);

  /* ----------------------------------------------------------
     1. Smooth scroll
     Lenis is optional. If the CDN is blocked the rest still runs
     on native scrolling.
     ---------------------------------------------------------- */
  var lenis = null;
  if (typeof window.Lenis !== 'undefined') {
    lenis = new window.Lenis({
      duration: 1.05,
      easing: function (t) { return Math.min(1, 1.001 - Math.pow(2, -10 * t)); },
      smoothWheel: true,
      // Touch devices keep native momentum — Lenis on touch feels wrong.
      syncTouch: false
    });
    lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add(function (time) { lenis.raf(time * 1000); });
    gsap.ticker.lagSmoothing(0);
  }

  /* ----------------------------------------------------------
     2. Reveal on entry
     Uses IntersectionObserver rather than a GSAP tween per node,
     because the feed and accession lists add nodes at runtime and
     an observer handles that without a ScrollTrigger.refresh().
     ---------------------------------------------------------- */
  var revealSelectors = [
    '.intro p',
    '.scenario-head',
    '.scenario-desc li',
    '.map-wrap',
    '.map-caption',
    '.legend',
    '.stat',
    '.accession-timeline',
    '.feed-head',
    '.feed-list > *',
    '.footer-row',
    '.footer-disclaimer'
  ].join(',');

  var observer = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (!entry.isIntersecting) return;
      var el = entry.target;
      // Stagger siblings so a stat strip cascades instead of popping.
      var delay = parseFloat(el.dataset.revealDelay || 0);
      setTimeout(function () {
        el.classList.add('is-in');
        setTimeout(function () { el.classList.add('is-done'); }, 750);
      }, delay);
      observer.unobserve(el);
    });
  }, {
    // Fire slightly before the element is fully on screen.
    rootMargin: '0px 0px -12% 0px',
    threshold: 0.05
  });

  function arm(root) {
    (root || document).querySelectorAll(revealSelectors).forEach(function (el) {
      if (el.classList.contains('reveal')) return;
      el.classList.add('reveal');

      // Index within its parent gives the cascade its rhythm.
      var key = el.parentNode;
      var siblings = Array.prototype.filter.call(
        key ? key.children : [],
        function (c) { return c.matches && c.matches(revealSelectors); }
      );
      var i = siblings.indexOf(el);
      el.dataset.revealDelay = i > 0 ? Math.min(i, 6) * 55 : 0;

      observer.observe(el);
    });
  }

  arm(document);

  /* ----------------------------------------------------------
     3. Late-arriving content
     loadFeedData() and updateAccessionTimelines() inject nodes
     after this script runs. Watch for them and arm on arrival.
     ---------------------------------------------------------- */
  ['feedList', 'fragAccessionList', 'fedAccessionList'].forEach(function (id) {
    var host = document.getElementById(id);
    if (!host) return;
    new MutationObserver(function () { arm(host); })
      .observe(host, { childList: true });
  });

  // "See more" expands the feed — arm whatever appears.
  var seeMore = document.getElementById('feedSeeMore');
  if (seeMore) {
    seeMore.addEventListener('click', function () {
      setTimeout(function () { arm(document.getElementById('feedList')); }, 0);
    });
  }

  /* ----------------------------------------------------------
     4. Country materialise
     THE IMPORTANT ONE. app.js calls buildMap() on every slider
     input, which does svgEl.innerHTML = ''. So:
       - first paint  -> animate the countries in
       - later paints -> render instantly, no replay
     The data-map-state attribute is what scroll.css keys off.
     ---------------------------------------------------------- */
  var mapsPlayed = { mapFrag: false, mapFed: false };

  function materialise(svg) {
    if (!svg) return;
    var id = svg.id;
    var paths = svg.querySelectorAll('path.country');
    if (!paths.length) return;

    if (mapsPlayed[id]) {
      svg.removeAttribute('data-map-state');
      gsap.set(paths, { opacity: 1, clearProps: 'opacity' });
      return;
    }

    svg.setAttribute('data-map-state', 'armed');

    ScrollTrigger.create({
      trigger: svg.closest('.map-wrap') || svg,
      start: 'top 78%',
      once: true,
      onEnter: function () {
        mapsPlayed[id] = true;
        gsap.to(paths, {
          opacity: 1,
          duration: 0.55,
          ease: 'power2.out',
          // West-to-east sweep: the continent fills in the way you read it.
          stagger: { each: 0.004, from: 'start' },
          onComplete: function () {
            svg.removeAttribute('data-map-state');
            gsap.set(paths, { clearProps: 'opacity' });
          }
        });
      }
    });
  }

  /* ----------------------------------------------------------
     5. Stat counters
     .stat-value holds strings like "448M", "7%", "0.910".
     Parse the number, keep prefix/suffix, restore the exact
     original string on completion so updateStats() never sees
     a value it did not write.
     ---------------------------------------------------------- */
  var countersPlayed = false;
  var liveCounters = [];

  function countUp(el) {
    var original = el.textContent.trim();
    var match = original.match(/^(\D*)([\d.,]+)(.*)$/);
    if (!match) return;

    var prefix = match[1];
    var raw = match[2];
    var suffix = match[3];
    var target = parseFloat(raw.replace(/,/g, ''));
    if (!isFinite(target)) return;

    var decimals = (raw.split('.')[1] || '').length;
    var proxy = { v: 0 };

    var tween = gsap.to(proxy, {
      v: target,
      duration: 1.1,
      ease: 'power2.out',
      onUpdate: function () {
        el.textContent = prefix + proxy.v.toFixed(decimals) + suffix;
      },
      onComplete: function () {
        el.textContent = original;
      }
    });
    liveCounters.push(tween);
  }

  function armCounters() {
    if (countersPlayed) return;
    var strip = document.querySelector('.stat-strip');
    if (!strip) return;

    ScrollTrigger.create({
      trigger: strip,
      start: 'top 82%',
      once: true,
      onEnter: function () {
        countersPlayed = true;
        document.querySelectorAll('.stat-value').forEach(countUp);
      }
    });
  }

  // Dragging the slider must win over any counter mid-flight.
  var slider = document.getElementById('yearSlider');
  if (slider) {
    slider.addEventListener('input', function () {
      countersPlayed = true;
      liveCounters.forEach(function (t) { t.kill(); });
      liveCounters.length = 0;
    }, { once: false });
  }

  /* ----------------------------------------------------------
     6. Hook into app.js
     Requires the one-line dispatch added at the end of render().
     Falls back to a timeout if that patch is missing.
     ---------------------------------------------------------- */
  function onRendered() {
    materialise(document.getElementById('mapFrag'));
    materialise(document.getElementById('mapFed'));
    armCounters();
    arm(document);
    ScrollTrigger.refresh();
  }

  document.addEventListener('eu2050:rendered', onRendered);

  // Fallback: if the patch was not applied, the maps are already
  // in the DOM by now anyway.
  if (!document.querySelector('#mapFrag path.country')) {
    setTimeout(onRendered, 300);
  } else {
    onRendered();
  }

  /* ----------------------------------------------------------
     7. Housekeeping
     ---------------------------------------------------------- */
  window.addEventListener('load', function () { ScrollTrigger.refresh(); });

  // Theme toggle changes panel heights slightly.
  var themeBtn = document.querySelector('.theme-toggle');
  if (themeBtn) {
    themeBtn.addEventListener('click', function () {
      setTimeout(function () { ScrollTrigger.refresh(); }, 350);
    });
  }

  // If the user turns reduced-motion on mid-session, stand down.
  reduceMotion.addEventListener('change', function (e) {
    if (!e.matches) return;
    if (lenis) lenis.destroy();
    ScrollTrigger.getAll().forEach(function (t) { t.kill(); });
    document.querySelectorAll('.reveal').forEach(function (el) {
      el.classList.add('is-in', 'is-done');
    });
  });
})();
