/* ── News Ticker (macOS-style) ──────────────────────────────────────── */
(function () {
  'use strict';

  var SECTIONS = [
    { label: 'Top Stories',   feed: 'https://feeds.bbci.co.uk/news/rss.xml' },
    { label: 'Technology',    feed: 'https://feeds.bbci.co.uk/news/technology/rss.xml' },
    { label: 'Sports',        feed: 'https://feeds.bbci.co.uk/sport/rss.xml' },
    { label: 'Entertainment', feed: 'https://feeds.bbci.co.uk/entertainment_and_arts/rss.xml' },
    { label: 'Science',       feed: 'https://feeds.bbci.co.uk/news/science_and_environment/rss.xml' },
  ];

  var ROTATE_MS = 5000;
  var RSS2JSON  = 'https://api.rss2json.com/v1/api.json?rss_url=';

  var clockEl    = document.getElementById('news-clock');
  var dateEl     = document.getElementById('news-date');
  var storyEl    = document.getElementById('news-story');
  var titleEl    = document.getElementById('news-story-title');
  var descEl     = document.getElementById('news-story-desc');
  var dotsEl     = document.getElementById('news-dots');

  if (!clockEl || !storyEl) return;

  var sectionData = [];   // array of arrays of {title, desc}
  var sectionIdx  = 0;    // current section (0-4)
  var articleIdx  = [];   // per-section article index
  var rotateTimer = null;

  /* ── Clock ──────────────────────────────────────────────────────── */
  function updateClock () {
    var now = new Date();
    var h = now.getHours();
    var m = String(now.getMinutes()).padStart(2, '0');
    var ampm = h >= 12 ? 'PM' : 'AM';
    var h12 = h % 12 || 12;
    clockEl.innerHTML = h12 + ':' + m + '<span class="clock-ampm">' + ampm + '</span>';

    var days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
    var months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    dateEl.textContent = days[now.getDay()] + ', ' + months[now.getMonth()] + ' ' + now.getDate();
  }
  updateClock();
  setInterval(updateClock, 10000);

  /* ── Dots ───────────────────────────────────────────────────────── */
  SECTIONS.forEach(function (_, i) {
    var dot = document.createElement('div');
    dot.className = 'news-dot' + (i === 0 ? ' active' : '');
    dotsEl.appendChild(dot);
  });
  var dots = dotsEl.querySelectorAll('.news-dot');

  /* ── Fetch RSS ──────────────────────────────────────────────────── */
  function fetchSection (section) {
    return fetch(RSS2JSON + encodeURIComponent(section.feed))
      .then(function (r) { return r.json(); })
      .then(function (json) {
        if (json.status !== 'ok' || !json.items) return [];
        return json.items.slice(0, 10).map(function (item) {
          return {
            title: item.title || '',
            desc:  stripHtml(item.description || item.content || '').slice(0, 160),
          };
        });
      })
      .catch(function () { return []; });
  }

  function stripHtml (html) {
    var tmp = document.createElement('div');
    tmp.innerHTML = html;
    return tmp.textContent.trim();
  }

  /* ── Show story with switch effect ──────────────────────────────── */
  function showStory (secIdx, artIdx) {
    var articles = sectionData[secIdx];
    if (!articles || !articles.length) return;
    var a = articles[artIdx % articles.length];

    // slide out left
    storyEl.classList.add('slide-out');

    setTimeout(function () {
      titleEl.textContent = a.title;
      descEl.textContent  = a.desc;
      // reset to slide-in position without transition
      storyEl.style.transition = 'none';
      storyEl.classList.remove('slide-out');
      storyEl.classList.add('slide-in');
      void storyEl.offsetWidth;
      // re-enable transition and animate to final position
      storyEl.style.transition = '';
      storyEl.classList.remove('slide-in');
    }, 400);

    dots.forEach(function (d, i) { d.classList.toggle('active', i === secIdx); });
  }

  function rotate () {
    sectionIdx = (sectionIdx + 1) % SECTIONS.length;
    if (!articleIdx[sectionIdx]) articleIdx[sectionIdx] = 0;
    else articleIdx[sectionIdx]++;
    showStory(sectionIdx, articleIdx[sectionIdx]);
  }

  function goToSection (idx) {
    sectionIdx = idx;
    if (!articleIdx[idx]) articleIdx[idx] = 0;
    showStory(idx, articleIdx[idx]);
    clearInterval(rotateTimer);
    rotateTimer = setInterval(rotate, ROTATE_MS);
  }

  dots.forEach(function (dot, i) {
    dot.addEventListener('click', function () { goToSection(i); });
  });

  /* ── Init ───────────────────────────────────────────────────────── */
  var loaded = 0;

  function onReady () {
    loaded++;
    if (loaded < SECTIONS.length) return;

    // init article indices
    SECTIONS.forEach(function (_, i) { articleIdx[i] = 0; });

    // start at a random section
    sectionIdx = Math.floor(Math.random() * SECTIONS.length);
    var articles = sectionData[sectionIdx];
    if (articles && articles.length) {
      titleEl.textContent = articles[0].title;
      descEl.textContent  = articles[0].desc;
      dots.forEach(function (d, i) { d.classList.toggle('active', i === sectionIdx); });
    }

    rotateTimer = setInterval(rotate, ROTATE_MS);
  }

  SECTIONS.forEach(function (sec, i) {
    fetchSection(sec).then(function (items) {
      sectionData[i] = items;
      onReady();
    });
  });
})();
