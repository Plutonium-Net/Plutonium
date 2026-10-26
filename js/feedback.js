/*
 * Feedback: the form behind the Feedback link on the home screen.
 *
 * One dialog, six categories. Everything is filed through the Discord bot's
 * backend (POST /feedback), which validates the submission, opens a thread in
 * the staff channel, and answers with a reference the reporter can quote back.
 *
 * If the visitor is signed in the request carries their Firebase ID token, so
 * the bot can prove the report came from that account instead of taking our
 * word for it. Signed out, the form still works; the report is filed as a
 * guest and only an email is asked for.
 *
 * The category list here has to stay in step with temp/src/lib/feedback-types.js
 * (the server allowlist): the ids, the select options and the required fields
 * are all checked again on the server, so a drift shows up as a 422 rather than
 * as a silently wrong report. GET /feedback/types on the bot returns the same
 * catalog for diffing.
 */
(function () {
  'use strict';

  var ENDPOINT = 'https://stelena.plutoniumnet.work/feedback';
  var TYPES_URL = 'https://stelena.plutoniumnet.work/feedback/types';
  var DISCORD = 'https://discord.gg/R3dJ7hpUXX';
  var SLOW_HINT_MS = 6000;
  var TIMEOUT_MS = 60000;
  var DRAFT_KEY = 'plu_feedback_draft';
  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

  var AREAS = ['browsing engine', 'games', 'media / streaming', 'AI (Stelena)', 'virtual machines', 'accounts', 'home screen', 'other'];

  var TYPES = [
    {
      // Slowness is folded in here on purpose: a performance complaint needs the
      // same description, area and severity a bug does, and a separate tile only
      // made people guess which one to pick.
      id: 'bug', label: 'Report a bug', icon: 'fa-bug',
      blurb: 'Something is broken, slow, crashes, or behaves unexpectedly.',
      fields: [
        { id: 'kind', label: 'What is happening', kind: 'select', required: true, options: ['it is broken or wrong', 'it is slow or laggy', 'it crashes', 'it looks wrong', 'other'] },
        { id: 'severity', label: 'Severity', kind: 'select', required: true, options: ['cosmetic', 'minor', 'major', 'critical', 'breaks my account'] },
        { id: 'area', label: 'Area', kind: 'select', options: AREAS },
        { id: 'reproducible', label: 'Happens every time', kind: 'select', options: ['yes', 'no', 'only sometimes'] },
        { id: 'steps', label: 'Steps to reproduce', kind: 'textarea', max: 2500, placeholder: '1. Open…  2. Click…  3. See…' },
        { id: 'expected', label: 'Expected behaviour', kind: 'text', max: 600 },
        { id: 'actual', label: 'Actual behaviour', kind: 'text', max: 600 },
        { id: 'symptom', label: 'If it is slow, what is slow', kind: 'select', options: ['page load', 'input lag', 'frame rate', 'video playback', 'downloads', 'startup', 'other'] },
        { id: 'measurements', label: 'Timings, if you have them', kind: 'text', max: 500, placeholder: 'e.g. 12s to first paint on a 100 Mbps line' },
        { id: 'startedWhen', label: 'Started happening', kind: 'select', options: ['today', 'this week', 'this month', 'after an update', 'always'] },
        { id: 'region', label: 'Your region', kind: 'text', max: 120 },
        { id: 'evidence', label: 'Screenshot or link', kind: 'url', max: 500, placeholder: 'https://…' }
      ]
    },
    {
      id: 'feature', label: 'Request a feature', icon: 'fa-lightbulb',
      blurb: 'An idea, integration, or improvement you would like to see.',
      fields: [
        { id: 'problem', label: 'What problem would it solve', kind: 'textarea', required: true, max: 2000 },
        { id: 'area', label: 'Area', kind: 'select', options: AREAS.slice(0, -1).concat(['site-wide', 'other']) },
        { id: 'priority', label: 'How much would this help', kind: 'select', options: ['nice to have', 'would use it weekly', 'would use it daily', 'blocking me'] },
        { id: 'alternatives', label: 'Alternatives you tried', kind: 'text', max: 600 }
      ]
    },
    {
      id: 'account', label: 'Account', icon: 'fa-user-shield',
      blurb: 'Sign-in, profile changes, deletion, or billing.',
      fields: [
        { id: 'issue', label: 'What do you need', kind: 'select', required: true, options: ["can't sign in", 'sign-in link / reset broken', 'change or unlink a sign-in method', 'profile data wrong', 'export my data', 'delete my account', 'billing or donation', 'other'] },
        { id: 'accountEmail', label: 'Account email', kind: 'text', required: true, max: 254 },
        { id: 'since', label: 'When did it start', kind: 'text', max: 120 }
      ]
    },
    {
      id: 'abuse', label: 'Report abuse or content', icon: 'fa-triangle-exclamation',
      blurb: 'Harassment, malicious content, phishing, or illegal material.',
      fields: [
        { id: 'abuseType', label: 'Type of abuse', kind: 'select', required: true, options: ['harassment or threats', 'hate or extremism', 'sexual content involving minors', 'non-consensual intimate imagery', 'malware, phishing or scams', 'spam or ban evasion', 'copyright or impersonation', 'other'] },
        { id: 'location', label: 'Where it is', kind: 'text', required: true, max: 500, placeholder: 'URL, game id, profile, or Discord message link' },
        { id: 'evidence', label: 'Evidence link', kind: 'url', max: 500 },
        { id: 'urgent', label: 'There is an immediate risk to a person', kind: 'checkbox' },
        { id: 'relationship', label: 'Your relationship to it', kind: 'select', options: ['I am the target', 'I am a bystander', 'I am a parent or guardian', 'staff or moderator', 'other'] }
      ]
    },
    {
      id: 'dmca', label: 'Copyright / DMCA', icon: 'fa-scale-balanced',
      blurb: 'Takedown notice or counter-notice under the DMCA.',
      legal: 'A takedown notice is a legal declaration. Every field below is required and the notice has to include all of it to be actionable, so please fill it in exactly.',
      fields: [
        { id: 'noticeKind', label: 'This is a', kind: 'select', required: true, options: ['takedown notice', 'counter-notice'] },
        { id: 'legalName', label: 'Full legal name', kind: 'text', required: true, max: 160 },
        { id: 'organisation', label: 'Organisation (if any)', kind: 'text', max: 160 },
        { id: 'postalAddress', label: 'Postal address', kind: 'textarea', required: true, max: 600 },
        { id: 'phone', label: 'Telephone', kind: 'text', required: true, max: 40 },
        { id: 'workTitle', label: 'Copyrighted work', kind: 'text', required: true, max: 300, placeholder: 'Title, author, registration number if you have one' },
        { id: 'workDescription', label: 'Description of the work', kind: 'textarea', required: true, max: 1500 },
        { id: 'infringingUrls', label: 'Infringing material: exact URLs', kind: 'textarea', required: true, max: 2500, placeholder: 'One URL per line' },
        { id: 'goodFaith', label: 'I have a good-faith belief that the use described is not authorised by the copyright owner, its agent, or the law.', kind: 'checkbox', required: true },
        { id: 'accuracy', label: 'I swear, under penalty of perjury, that the information in this notice is accurate and that I am the owner or am authorised to act on the owner\u2019s behalf.', kind: 'checkbox', required: true },
        { id: 'signature', label: 'Electronic signature (type your full legal name)', kind: 'text', required: true, max: 160 }
      ]
    },
    {
      id: 'other', label: 'Something else', icon: 'fa-comment-dots',
      blurb: 'Partnerships, press, questions, or general feedback.',
      fields: [
        { id: 'topic', label: 'Topic', kind: 'select', options: ['partnership', 'press or media', 'job or volunteer', 'question', 'compliment', 'complaint', 'other'] },
        { id: 'organisation', label: 'Organisation', kind: 'text', max: 160 }
      ]
    }
  ];

  var state = {
    view: 'picker',
    type: null,
    openedAt: 0,
    sending: false,
    errors: {},
    values: {}
  };

  function el(id) { return document.getElementById(id); }

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function typeById(id) {
    for (var i = 0; i < TYPES.length; i += 1) {
      if (TYPES[i].id === id) return TYPES[i];
    }
    return null;
  }

  function currentUser() {
    try {
      if (window.PlutoniumStore && PlutoniumStore.currentUser) return PlutoniumStore.currentUser;
    } catch (err) { /* not loaded yet */ }
    return null;
  }

  function firstName(name) {
    var text = String(name || '').trim();
    if (!text) return '';
    return text.split(/\s+/)[0];
  }

  /* -------------------------------------------------------------- diagnostics */

  function readMeta(name) {
    var node = document.querySelector('meta[name="' + name + '"]');
    return node ? node.getAttribute('content') || '' : '';
  }

  function collectDiagnostics() {
    var diag = {};
    try { diag.url = location.href; } catch (err) { /* ignore */ }
    try { if (document.referrer) diag.referrer = document.referrer; } catch (err) { /* ignore */ }

    var engineBtn = document.querySelector('.engine-btn.active');
    var engine = engineBtn && engineBtn.getAttribute('data-engine');
    if (engine) diag.engine = engine;

    var relay = el('relay-switcher-current');
    if (relay && relay.textContent.trim()) diag.relay = relay.textContent.trim();

    var build = readMeta('plu-build');
    if (build) diag.build = build;

    if (window.innerWidth && window.innerHeight) diag.viewport = window.innerWidth + 'x' + window.innerHeight;
    if (navigator.userAgent) diag.platform = navigator.userAgent;
    if (navigator.language) diag.language = navigator.language;
    try {
      var zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (zone) diag.timezone = zone;
    } catch (err) { /* ignore */ }
    diag.online = navigator.onLine === false ? 'offline' : 'online';
    try {
      var theme = document.documentElement.getAttribute('data-theme');
      if (theme) diag.theme = theme;
    } catch (err) { /* ignore */ }

    Object.keys(diag).forEach(function (key) {
      if (typeof diag[key] === 'string' && diag[key].length > 200) diag[key] = diag[key].slice(0, 200);
    });
    return diag;
  }

  /* ------------------------------------------------------------------- drafts */

  function saveDraft() {
    try {
      sessionStorage.setItem(DRAFT_KEY, JSON.stringify({
        type: state.type ? state.type.id : null,
        values: state.values,
        at: Date.now()
      }));
    } catch (err) { /* private mode: drafts are a nicety */ }
  }

  function readDraft() {
    try {
      var raw = sessionStorage.getItem(DRAFT_KEY);
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || !parsed.values) return null;
      if (Date.now() - Number(parsed.at || 0) > 6 * 60 * 60 * 1000) return null;
      return parsed;
    } catch (err) { return null; }
  }

  function clearDraft() {
    try { sessionStorage.removeItem(DRAFT_KEY); } catch (err) { /* ignore */ }
  }

  /* -------------------------------------------------------------------- dialog */

  function ensureDialog() {
    if (el('feedback-dialog')) return;
    var scrim = document.createElement('div');
    scrim.className = 'feedback-scrim';
    scrim.id = 'feedback-scrim';
    scrim.hidden = true;
    var dialog = document.createElement('div');
    dialog.className = 'feedback-dialog glass';
    dialog.id = 'feedback-dialog';
    dialog.hidden = true;
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('aria-label', 'Send feedback');
    scrim.addEventListener('click', close);
    document.body.appendChild(scrim);
    document.body.appendChild(dialog);
  }

  function open(type, seedValues) {
    ensureDialog();
    var draft = readDraft();
    if (draft && draft.values) state.values = draft.values;
    if (seedValues && typeof seedValues === 'object') {
      Object.keys(seedValues).forEach(function (key) { state.values[key] = seedValues[key]; });
    }
    state.type = type ? typeById(type) : (draft && typeById(draft.type)) || null;
    state.view = state.type ? 'form' : 'picker';
    state.errors = {};
    state.sending = false;
    state.openedAt = Date.now();

    var scrim = el('feedback-scrim');
    var dialog = el('feedback-dialog');
    if (!scrim || !dialog) return;
    dialog.hidden = false;
    scrim.hidden = false;
    dialog.offsetHeight;
    dialog.style.opacity = '1';
    dialog.style.transform = 'translate(-50%,-50%) scale(1)';
    scrim.style.opacity = '1';
    render();
    document.addEventListener('keydown', onKeydown);
  }

  function close() {
    var scrim = el('feedback-scrim');
    var dialog = el('feedback-dialog');
    if (!scrim || !dialog) return;
    saveDraft();
    dialog.style.opacity = '0';
    dialog.style.transform = 'translate(-50%,-50%) scale(0.96)';
    scrim.style.opacity = '0';
    document.removeEventListener('keydown', onKeydown);
    setTimeout(function () { dialog.hidden = true; scrim.hidden = true; }, 200);
  }

  function onKeydown(event) {
    if (event.key === 'Escape' && !state.sending) close();
  }

  function head(title, backTo) {
    return '' +
      '<div class="feedback-dialog__head">' +
        (backTo ? '<button class="feedback-back" type="button" data-action="back" aria-label="Back"><i class="fa-solid fa-arrow-left"></i></button>' : '') +
        '<span class="feedback-dialog__title"><i class="fa-solid fa-comment-dots"></i>' + escapeHtml(title) + '</span>' +
        '<button class="feedback-dialog__close" type="button" data-action="close" aria-label="Close feedback"><i class="fa-solid fa-xmark"></i></button>' +
      '</div>';
  }

  function render() {
    var dialog = el('feedback-dialog');
    if (!dialog) return;
    if (state.view === 'picker') dialog.innerHTML = renderPicker();
    else if (state.view === 'done') dialog.innerHTML = renderDone();
    else dialog.innerHTML = renderForm();
    wire(dialog);
  }

  function renderPicker() {
    var cards = TYPES.map(function (type) {
      return '' +
        '<button class="feedback-type-card" type="button" data-action="pick" data-type="' + type.id + '">' +
          '<span class="feedback-type-card__icon"><i class="fa-solid ' + type.icon + '"></i></span>' +
          '<span class="feedback-type-card__body">' +
            '<span class="feedback-type-card__label">' + escapeHtml(type.label) + '</span>' +
            '<span class="feedback-type-card__blurb">' + escapeHtml(type.blurb) + '</span>' +
          '</span>' +
          '<i class="fa-solid fa-chevron-right feedback-type-card__go"></i>' +
        '</button>';
    }).join('');
    return head('Send feedback', false) + '<div class="feedback-dialog__body"><div class="feedback-type-grid">' + cards + '</div></div>';
  }

  function renderForm() {
    var type = state.type;
    if (!type) return renderPicker();
    var user = currentUser();
    var account = '';

    if (user && (user.email || user.displayName)) {
      account = '<div class="feedback-account feedback-account--verified">' +
        '<i class="fa-solid fa-circle-check"></i>' +
        '<span>Signed in as <strong>' + escapeHtml(user.displayName || user.email) + '</strong>' +
        (user.email && user.displayName ? ' &lt;' + escapeHtml(user.email) + '&gt;' : '') +
        ' This report will be filed to your account.</span>' +
        '</div>';
    } else {
      account = '<div class="feedback-account">' +
        '<i class="fa-solid fa-user-slash"></i>' +
        '<span>Not signed in. We can still file this, but a guest report cannot be matched to an account.</span>' +
        '</div>';
    }

    var notice = type.legal ? '<div class="feedback-legal">' + escapeHtml(type.legal) + '</div>' : '';
    var values = state.values;
    // A signed-in visitor rarely wants to retype what we already know. Only
    // seed a field the first time; after that state.values holds what they typed.
    var emailValue = values.email == null ? (user && user.email) || '' : values.email;
    var nameValue = values.name == null ? (user && user.displayName) || '' : values.name;

    var consentLabel = user
      ? 'I agree to the <a href="legal.html#privacy" target="_blank" rel="noopener noreferrer">privacy policy</a> and to staff contacting me about this report.'
      : 'I agree to the <a href="legal.html#privacy" target="_blank" rel="noopener noreferrer">privacy policy</a>.';
    var anonymousRow = user ? '' : checkHtml(
      { id: 'anonymous', label: 'Send anonymously (skip the contact email)' },
      values.anonymous,
      'Send anonymously (skip the contact email)');

    return head(type.label, true) +
      '<div class="feedback-dialog__body">' +
      account + notice +
      '<form class="feedback-form" novalidate>' +
        fieldHtml({ id: 'summary', label: 'One-line summary', kind: 'text', max: 200, required: true }, values.summary) +
        fieldHtml({ id: 'details', label: 'What is going on', kind: 'textarea', max: 6000, required: true }, values.details) +
        type.fields.map(function (extra) { return fieldHtml(extra, values[extra.id]); }).join('') +
        fieldHtml({ id: 'email', label: user ? 'Contact email (optional)' : 'Contact email', kind: 'text', max: 254, required: !values.anonymous && !user, placeholder: 'you@example.com' }, emailValue) +
        fieldHtml({ id: 'name', label: 'Your name', kind: 'text', max: 120, placeholder: 'Optional' }, nameValue) +
        anonymousRow +
        checkHtml({ id: 'consent', required: true }, values.consent, consentLabel) +
        '<input class="feedback-honeypot" type="text" tabindex="-1" autocomplete="off" aria-hidden="true" data-field="website" value="">' +
        '<div class="feedback-status" data-role="status"></div>' +
        '<div class="feedback-actions">' +
          '<button class="feedback-btn feedback-btn--ghost" type="button" data-action="back">Back</button>' +
          '<button class="feedback-btn feedback-btn--primary" type="submit" data-role="submit"><i class="fa-solid fa-paper-plane"></i> Send report</button>' +
        '</div>' +
      '</form>' +
      '</div>';
  }

  function fieldHtml(field, value) {
    var id = 'feedback-' + field.id;
    var error = state.errors[field.id];
    var cls = 'feedback-field' + (error ? ' feedback-field--invalid' : '');
    var safeValue = escapeHtml(value == null ? '' : value);
    var control;

    if (field.kind === 'textarea') {
      control = '<textarea class="feedback-input feedback-textarea" id="' + id + '" data-field="' + field.id + '" rows="4"' +
        (field.max ? ' maxlength="' + field.max + '"' : '') +
        (field.placeholder ? ' placeholder="' + escapeHtml(field.placeholder) + '"' : '') +
        '>' + safeValue + '</textarea>';
    } else if (field.kind === 'select') {
      var options = ['<option value="">Choose…</option>'].concat((field.options || []).map(function (option) {
        var selected = value === option ? ' selected' : '';
        return '<option value="' + escapeHtml(option) + '"' + selected + '>' + escapeHtml(option) + '</option>';
      })).join('');
      control = '<select class="feedback-input feedback-select" id="' + id + '" data-field="' + field.id + '">' + options + '</select>';
    } else if (field.kind === 'checkbox') {
      return checkHtml(field, value);
    } else {
      control = '<input class="feedback-input" id="' + id + '" type="text" data-field="' + field.id + '"' +
        (field.max ? ' maxlength="' + field.max + '"' : '') +
        (field.placeholder ? ' placeholder="' + escapeHtml(field.placeholder) + '"' : '') +
        ' value="' + safeValue + '">';
    }

    return '' +
      '<label class="' + cls + '" data-error-for="' + field.id + '">' +
        '<span class="feedback-field__label">' + escapeHtml(field.label) + (field.required ? ' <em class="feedback-required">required</em>' : '') + '</span>' +
        control +
        (error ? '<span class="feedback-error">' + escapeHtml(error) + '</span>' : '') +
      '</label>';
  }

  /*
   * A single checkbox row. `labelHtml` is passed in raw because the consent
   * line carries a link, so callers that need markup must escape it themselves.
   */
  function checkHtml(field, value, labelHtml) {
    var id = 'feedback-' + field.id;
    var error = state.errors[field.id];
    var cls = 'feedback-field feedback-check' + (error ? ' feedback-field--invalid' : '');
    var body = labelHtml !== undefined
      ? labelHtml
      : escapeHtml(field.label) + (field.required ? ' <em class="feedback-required">required</em>' : '');
    return '' +
      '<label class="' + cls + '" data-error-for="' + field.id + '">' +
        '<input type="checkbox" id="' + id + '" data-field="' + field.id + '"' + (value === true || value === 'true' ? ' checked' : '') + '>' +
        '<span>' + body + '</span>' +
        (error ? '<span class="feedback-error">' + escapeHtml(error) + '</span>' : '') +
      '</label>';
  }

  function renderDone(result) {
    var thread = result && result.threadUrl
      ? '<a class="feedback-btn feedback-btn--ghost" href="' + escapeHtml(result.threadUrl) + '" target="_blank" rel="noopener noreferrer"><i class="fa-solid fa-arrow-up-right-from-square"></i> Open the report thread</a>'
      : '';
    var attributed = result && result.attributedTo
      ? '<p class="feedback-done__note"><i class="fa-solid fa-circle-check"></i> Filed against your account, ' + escapeHtml(result.attributedTo) + '.</p>'
      : '';
    return head('Report sent', false) +
      '<div class="feedback-dialog__body feedback-done">' +
        '<div class="feedback-done__icon"><i class="fa-solid fa-check"></i></div>' +
        '<h3 class="feedback-done__title">Thanks, that is filed.</h3>' +
        '<p class="feedback-done__text">Your reference is <strong>' + escapeHtml(result && result.reference ? result.reference : 'unavailable') + '</strong>. ' +
        'A member of staff reads every report in the Discord server; keep the reference if you need to follow up.</p>' +
        attributed +
        '<div class="feedback-done__actions">' +
          thread +
          '<a class="feedback-btn feedback-btn--primary" href="' + DISCORD + '" target="_blank" rel="noopener noreferrer"><i class="fa-brands fa-discord"></i> Join the Discord</a>' +
          '<button class="feedback-btn feedback-btn--ghost" type="button" data-action="close">Close</button>' +
        '</div>' +
      '</div>';
  }

  function renderFailure(result, message) {
    var dialog = el('feedback-dialog');
    var status = dialog && dialog.querySelector('[data-role="status"]');
    if (!status) return;
    var detail = message || (result && result.message) || 'We could not file that just now.';
    status.className = 'feedback-status feedback-status--error';
    status.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> ' + escapeHtml(detail) +
      ' You can also <a href="' + DISCORD + '" target="_blank" rel="noopener noreferrer">tell us in the Discord server</a>' +
      ' or <button type="button" class="feedback-linkbtn" data-action="copy">copy the report</button> and send it yourself.';
  }

  function collect() {
    var dialog = el('feedback-dialog');
    if (!dialog) return null;
    var form = dialog.querySelector('.feedback-form');
    if (!form) return null;
    var payload = {
      type: state.type ? state.type.id : '',
      summary: '',
      details: '',
      email: '',
      name: '',
      anonymous: false,
      consent: false,
      website: '',
      fields: {},
      diagnostics: collectDiagnostics(),
      openedAt: state.openedAt
    };
    var nodes = form.querySelectorAll('[data-field]');
    for (var i = 0; i < nodes.length; i += 1) {
      var node = nodes[i];
      var key = node.getAttribute('data-field');
      var value = node.type === 'checkbox' ? node.checked : node.value;
      if (key === 'summary' || key === 'details' || key === 'email' || key === 'name' ||
          key === 'anonymous' || key === 'consent' || key === 'website') {
        payload[key] = key === 'email' ? String(value).trim() : value;
      } else {
        payload.fields[key] = value;
      }
    }
    // Remember what they typed so a rejected submit does not wipe the form.
    state.values = {
      summary: payload.summary,
      details: payload.details,
      email: payload.email,
      name: payload.name,
      anonymous: payload.anonymous,
      consent: payload.consent
    };
    Object.keys(payload.fields).forEach(function (key) { state.values[key] = payload.fields[key]; });
    return payload;
  }

  function setSending(sending) {
    state.sending = sending;
    var dialog = el('feedback-dialog');
    if (!dialog) return;
    var button = dialog.querySelector('[data-role="submit"]');
    var status = dialog.querySelector('[data-role="status"]');
    if (button) {
      button.disabled = sending;
      button.innerHTML = sending
        ? '<i class="fa-solid fa-circle-notch fa-spin"></i> Sending…'
        : '<i class="fa-solid fa-paper-plane"></i> Send report';
    }
    if (status) status.className = 'feedback-status';
    if (sending && status) {
      status.className = 'feedback-status feedback-status--working';
      status.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Filing your report…';
      setTimeout(function () {
        if (!state.sending || !status.parentNode) return;
        status.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Still working. The bot sleeps when idle, so the first report after a quiet spell can take up to a minute.';
      }, SLOW_HINT_MS);
    }
  }

  function submit(payload) {
    var headers = { 'Content-Type': 'application/json' };
    var user = currentUser();
    if (user && user.idToken) headers.Authorization = 'Bearer ' + user.idToken;

    var controller = typeof AbortController === 'function' ? new AbortController() : null;
    var timer = setTimeout(function () { if (controller) controller.abort(); }, TIMEOUT_MS);

    return fetch(ENDPOINT, {
      method: 'POST',
      mode: 'cors',
      credentials: 'omit',
      cache: 'no-store',
      headers: headers,
      body: JSON.stringify(payload),
      signal: controller ? controller.signal : undefined
    }).then(function (response) {
      return response.json().catch(function () { return null; }).then(function (body) {
        return { status: response.status, body: body };
      });
    }).finally(function () { clearTimeout(timer); });
  }

  function onSubmit(event) {
    event.preventDefault();
    if (state.sending) return;
    var dialog = el('feedback-dialog');
    var payload = collect();
    if (!payload) return;

    // Cheap local pass first so obvious mistakes never leave the browser.
    var localErrors = {};
    if (String(payload.summary).trim().length < 3) localErrors.summary = 'Give a one-line summary (at least 3 characters).';
    if (String(payload.details).trim().length < 10) localErrors.details = 'Describe it in at least 10 characters.';
    // A signed-in reporter is reachable through their verified account, so the
    // address is optional for them; the server applies the same rule.
    var signedIn = !!currentUser();
    if (!signedIn && !payload.anonymous && !EMAIL_RE.test(String(payload.email).trim())) {
      localErrors.email = 'Add a contact email, or tick “send anonymously”.';
    }
    if (!payload.consent) localErrors.consent = 'Please agree to the privacy policy.';
    if (Object.keys(localErrors).length > 0) {
      state.errors = localErrors;
      render();
      var first = dialog && dialog.querySelector('.feedback-field--invalid, [data-error-for] .feedback-error');
      if (first && first.scrollIntoView) first.scrollIntoView({ block: 'center' });
      return;
    }

    state.errors = {};
    setSending(true);
    submit(payload).then(function (result) {
      setSending(false);
      if (result.status === 200 && result.body && result.body.ok) {
        clearDraft();
        state.values = {};
        state.view = 'done';
        var dialogNow = el('feedback-dialog');
        if (dialogNow) { dialogNow.innerHTML = renderDone(result.body); wire(dialogNow); }
        return;
      }
      if (result.status === 422 && result.body && Array.isArray(result.body.fields)) {
        var mapped = {};
        result.body.fields.forEach(function (item) {
          if (item && item.field && !mapped[item.field]) mapped[item.field] = item.message;
        });
        state.errors = mapped;
        render();
        renderFailure(result, 'The server needs a couple of fields fixed.');
        return;
      }
      if (result.status === 429) {
        renderFailure(result, 'You have sent several reports already.');
        return;
      }
      if (result.status === 0 || result.body === null) {
        renderFailure(result, 'The feedback service did not answer. Check your connection and try again.');
        return;
      }
      renderFailure(result);
    }).catch(function (err) {
      setSending(false);
      renderFailure(null, err && err.name === 'AbortError'
        ? 'That took too long, so it was cancelled. Nothing was sent.'
        : 'We could not reach the feedback service.');
    });
  }

  function copyReport() {
    var payload = collect();
    if (!payload) return;
    var type = state.type ? state.type.label : 'Feedback';
    var lines = [type + ': ' + payload.summary, '', payload.details, ''];
    Object.keys(payload.fields).forEach(function (key) {
      if (payload.fields[key]) lines.push(key + ': ' + payload.fields[key]);
    });
    if (payload.email) lines.push('contact: ' + payload.email);
    lines.push('page: ' + (payload.diagnostics.url || ''));
    var text = lines.join('\n');
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () {
        var status = el('feedback-dialog').querySelector('[data-role="status"]');
        if (status) status.innerHTML = '<i class="fa-solid fa-check"></i> Copied. Paste it into the Discord server.';
      }).catch(function () { /* clipboard refused; the text is on screen anyway */ });
    }
  }

  function wire(dialog) {
    dialog.querySelectorAll('[data-action]').forEach(function (node) {
      node.addEventListener('click', function (event) {
        var action = node.getAttribute('data-action');
        if (action === 'close') { event.preventDefault(); close(); }
        else if (action === 'back') {
          event.preventDefault();
          state.view = 'picker';
          state.errors = {};
          render();
        } else if (action === 'pick') {
          event.preventDefault();
          var id = node.getAttribute('data-type');
          state.type = typeById(id);
          state.view = 'form';
          state.errors = {};
          render();
        } else if (action === 'copy') {
          event.preventDefault();
          copyReport();
        }
      });
    });

    var form = dialog.querySelector('.feedback-form');
    if (form) {
      form.addEventListener('submit', onSubmit);
      var anonymous = form.querySelector('[data-field="anonymous"]');
      if (anonymous) {
        anonymous.addEventListener('change', function () {
          if (!anonymous.checked) return;
          var email = form.querySelector('[data-field="email"]');
          if (email) email.value = '';
        });
      }
      var first = form.querySelector('.feedback-input:not(.feedback-honeypot)');
      if (first) setTimeout(function () { try { first.focus(); } catch (err) { /* ignore */ } }, 60);
    }
  }

  /* ---------------------------------------------------------------- openers */

  function wireOpeners() {
    var link = el('feedback-link');
    if (link) {
      link.addEventListener('click', function (event) {
        event.preventDefault();
        open();
      });
    }
    var menuItem = el('help-feedback');
    if (menuItem) {
      menuItem.addEventListener('click', function (event) {
        event.preventDefault();
        var wrap = el('help-wrap');
        if (wrap) wrap.classList.remove('is-open');
        var menu = el('help-menu');
        if (menu) { menu.hidden = true; menu.classList.remove('is-open'); }
        var btn = el('help-btn');
        if (btn) btn.setAttribute('aria-expanded', 'false');
        open();
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wireOpeners);
  } else {
    wireOpeners();
  }

  window.openFeedbackDialog = function (type) { open(type); };
  window.PlutoniumFeedback = {
    open: function (type) { open(type); },
    openType: function (id) { open(id); },
    types: TYPES.map(function (type) { return type.id; }),
    endpoint: ENDPOINT,
    catalogUrl: TYPES_URL
  };
})();
