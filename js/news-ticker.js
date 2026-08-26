/* ── News Ticker (macOS-style) ──────────────────────────────────────── */
(function () {
  'use strict';

  var ROTATE_MS = 5000;

  var clockEl    = document.getElementById('news-clock');
  var dateEl     = document.getElementById('news-date');
  var storyEl    = document.getElementById('news-story');
  var titleEl    = document.getElementById('news-story-title');
  var descEl     = document.getElementById('news-story-desc');
  var dotsEl     = document.getElementById('news-dots');

  if (!clockEl || !storyEl) return;

  var sectionData = [];   // array of arrays of {title, desc}
  var sectionIdx  = 0;
  var articleIdx  = 0;
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

  /* ── Load news from JSON ──────────────────────────────────────────── */
  function loadNews () {
    return fetch('data/news.json')
      .then(function (r) { return r.json(); })
      .then(function (json) {
        if (!json.sections) return [];
        return json.sections.map(function (sec) {
          return (sec.articles || []).map(function (a) {
            return { title: a.title || '', desc: a.desc || '' };
          });
        });
      })
      .catch(function () { return []; });
  }

  /* ── Show story with switch effect ──────────────────────────────── */
  function showStory (secIdx, artIdx) {
    var articles = sectionData[secIdx];
    if (!articles || !articles.length) return;
    var a = articles[artIdx % articles.length];

    storyEl.classList.add('slide-out');

    setTimeout(function () {
      titleEl.textContent = a.title;
      descEl.textContent  = a.desc;
      storyEl.style.transition = 'none';
      storyEl.classList.remove('slide-out');
      storyEl.classList.add('slide-in');
      void storyEl.offsetWidth;
      storyEl.style.transition = '';
      storyEl.classList.remove('slide-in');
    }, 400);
  }

  function rotate () {
    articleIdx++;
    showStory(0, articleIdx);
  }

  /* ── Dots ───────────────────────────────────────────────────────── */
  function buildDots (count) {
    dotsEl.innerHTML = '';
    for (var i = 0; i < count; i++) {
      var dot = document.createElement('div');
      dot.className = 'news-dot' + (i === 0 ? ' active' : '');
      dotsEl.appendChild(dot);
    }
    return dotsEl.querySelectorAll('.news-dot');
  }

  /* ── Init ───────────────────────────────────────────────────────── */
  loadNews().then(function (sections) {
    if (!sections.length || !sections[0].length) return;
    sectionData = sections;

    var articles = sections[0];
    var dots = buildDots(articles.length);

    titleEl.textContent = articles[0].title;
    descEl.textContent  = articles[0].desc;

    dots.forEach(function (dot, i) {
      dot.addEventListener('click', function () {
        articleIdx = i;
        showStory(0, articleIdx);
        clearInterval(rotateTimer);
        rotateTimer = setInterval(rotate, ROTATE_MS);
        dots.forEach(function (d, j) { d.classList.toggle('active', j === i); });
      });
    });

    rotateTimer = setInterval(rotate, ROTATE_MS);
  });
})();
