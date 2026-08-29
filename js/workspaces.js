/* Single-document workspace registry. Every feature view is mounted from JS. */
(function () {
  'use strict';

  const root = document.getElementById('workspace-root');
  const loadedScripts = new Set();
  let activeKey = '';
  let activeStyle = null;
  let activeWorkspaceStyle = null;
  let sharedGlassStyle = null;

  const views = {
    games: `<section class="workspace-view workspace-games" data-workspace="games">
      <div class="games-page plu-page">
        <h1 class="games-page__title plu-page__title">Games</h1>
        <p class="games-page__subtitle plu-page__subtitle">Browse and play games from multiple sources</p>
        <div class="source-tabs">
          <button class="source-tab active" data-panel="pgcdn">Plutonium-GCDN</button>
          <button class="source-tab" data-panel="lumin">LuminSDK</button>
          <button class="source-tab" data-panel="mygames">My Games</button>
          <button class="source-tab" data-panel="history">History</button>
        </div>
        <div class="source-panel active" id="panel-pgcdn">
          <div class="pgcdn-sync-badge" id="pgcdn-sync-badge"></div>
          <div class="pgcdn-shelf" id="pgcdn-shelf-recent" style="display:none"><div class="pgcdn-shelf__header"><i class="fa-solid fa-clock-rotate-left"></i> Recent</div><div class="pgcdn-shelf__row" id="pgcdn-recent-row"></div></div>
          <div class="pgcdn-toolbar"><input class="pgcdn-search" id="pgcdn-search" type="search" placeholder="Search games..." /><span class="pgcdn-count" id="pgcdn-count"></span></div>
          <div id="pgcdn-grid-wrap"><div class="pgcdn-status"><div class="pgcdn-spinner"></div><span>Loading games...</span></div></div>
        </div>
        <div class="source-panel" id="panel-lumin"><div id="lumin-container"></div></div>
        <div class="source-panel" id="panel-mygames">
          <div class="pg-panel-toolbar"><span class="pgcdn-count" id="pg-personal-count"></span><span id="pg-cloud-badge" class="pg-cloud-badge"></span><div class="pg-add-btns"><button class="pg-add-btn" id="pg-add-file-btn"><i class="fa-solid fa-file-arrow-up"></i> Add HTML File</button></div></div>
          <div class="pgcdn-grid" id="pg-personal-grid"></div>
          <div class="pgcdn-status" id="pg-personal-empty" style="display:none"><i class="fa-solid fa-gamepad"></i><span>No personal games yet. Add an HTML file above (max 1 MiB)</span></div>
        </div>
        <div class="source-panel" id="panel-history">
          <div class="history-toolbar"><input class="history-search" id="history-search" type="search" placeholder="Search history..." /><div class="history-sort-group"><button class="history-sort-btn active" data-sort="recent" title="Most recent"><i class="fa-solid fa-clock"></i></button><button class="history-sort-btn" data-sort="plays" title="Most played"><i class="fa-solid fa-fire"></i></button><button class="history-sort-btn" data-sort="az" title="A to Z"><i class="fa-solid fa-arrow-down-a-z"></i></button></div><span class="history-count" id="history-count"></span><button class="history-clear-btn" id="history-clear"><i class="fa-solid fa-trash"></i></button></div>
          <div id="history-list"><div class="pgcdn-status"><i class="fa-solid fa-clock-rotate-left"></i><span>No history yet</span></div></div>
        </div>
      </div>
      <div id="games-preload-overlay"><div class="games-preload-spinner"></div><span class="games-preload-label" id="games-preload-label" aria-live="polite">Preloading Images...</span></div>
      <div id="pg-modal-overlay">
        <div class="pg-modal glass" id="pg-modal-file"><div class="pg-modal__header"><span class="pg-modal__title"><i class="fa-solid fa-file-code"></i> Add HTML Game</span><button class="pg-modal__close" aria-label="Close"><i class="fa-solid fa-xmark"></i></button></div><div class="pg-modal__body"><div class="pg-drop-zone" id="pg-file-drop"><i class="fa-solid fa-file-arrow-up pg-drop-zone__icon"></i><span class="pg-drop-zone__label" id="pg-file-drop-label">Click or drag an HTML file here</span><input type="file" id="pg-file-input" accept=".html,.htm" style="display:none" /></div><div class="pg-field-group"><label class="pg-field-label">Game name</label><input class="pg-field-input" id="pg-file-name" type="text" placeholder="Leave blank to use filename" /></div><div class="pg-field-group"><label class="pg-field-label">Import from GitHub</label><input class="pg-field-input" id="pg-github-url" type="url" placeholder="https://github.com/owner/repo" /><div style="margin-top:8px"><button class="pg-btn pg-btn--secondary" id="pg-github-import" type="button"><i class="fa-solid fa-magnifying-glass"></i> Scan GitHub</button></div><div id="pg-github-picker" class="pg-github-picker" style="display:none"></div></div></div><div class="pg-modal__footer"><button class="pg-btn pg-btn--ghost" id="pg-file-cancel">Cancel</button><button class="pg-btn pg-btn--primary" id="pg-file-save">Add Game</button></div></div>
        <div class="pg-modal glass" id="pg-modal-edit"><div class="pg-modal__header"><span class="pg-modal__title"><i class="fa-solid fa-pencil"></i> Edit Game</span><button class="pg-modal__close" aria-label="Close"><i class="fa-solid fa-xmark"></i></button></div><div class="pg-modal__body"><div class="pg-field-group"><label class="pg-field-label">Game name</label><input class="pg-field-input" id="pg-edit-name" type="text" placeholder="Game name" /></div></div><div class="pg-modal__footer"><button class="pg-btn pg-btn--ghost" id="pg-edit-cancel">Cancel</button><button class="pg-btn pg-btn--primary" id="pg-edit-save">Save</button></div></div>
      </div>
      <div id="pgcdn-ctx-menu" class="hidden"></div>
      <div id="pgcdn-toast"><span class="toast-msg" id="pgcdn-toast-msg"></span><div class="toast-actions" id="pgcdn-toast-actions"></div></div>
      <div id="game-viewer" class="glass"><iframe id="game-iframe" allowfullscreen allow="autoplay; fullscreen"></iframe><div id="game-restore-overlay"><div class="game-restore-spinner"></div><span class="game-restore-label">Restoring saves...</span></div></div>
      <div id="viewer-bar" class="bar-hidden"><button class="viewer-btn" id="vbtn-back" title="Back to games" aria-label="Back"><i class="fa-solid fa-arrow-left"></i></button><div class="viewer-bar__sep"></div><span class="viewer-bar__title" id="viewer-title"></span><div class="viewer-bar__sep"></div><button class="viewer-btn" id="vbtn-fav" title="Favourite" aria-label="Favourite"><i class="fa-regular fa-heart"></i></button><button class="viewer-btn" id="vbtn-reload" title="Reload game" aria-label="Reload"><i class="fa-solid fa-rotate-right"></i></button><button class="viewer-btn" id="vbtn-fullscreen" title="Fullscreen" aria-label="Fullscreen"><i class="fa-solid fa-expand"></i></button><button class="viewer-btn" id="vbtn-hide" title="Hide bar" aria-label="Hide bar"><i class="fa-solid fa-chevron-down"></i></button></div><div id="viewer-bar-ghost"></div>
    </section>`,

    ai: `<section class="workspace-view workspace-ai" data-workspace="ai">
      <aside class="ai-sidebar" id="aiSidebar">
        <button class="ai-new-chat" id="aiNewChat" type="button"><i class="fa-solid fa-plus"></i>New chat</button>
        <div class="ai-chat-list" id="aiChatList"></div>
      </aside>
      <main id="main-content">
        <header class="ai-header">
          <div class="ai-brand">
            <div class="ai-brand__logo"><img id="ai-logo" src="img/logos/stelena.svg" alt="Stelena" /></div>
            <div class="ai-brand__copy"><div class="ai-brand__name">Stelena AI</div><div class="ai-brand__sub">Plutonium Network's assistant</div></div>
          </div>
          <div class="ai-header__actions">
            <button class="model-pill" id="modelPill" type="button" aria-haspopup="listbox" aria-expanded="false"><i class="fas fa-microchip"></i><span id="selectedModelName">GPT OSS 120B</span><i class="fas fa-chevron-down model-pill__caret"></i></button>
            <button class="ai-clear-btn" id="ai-clear-btn" title="Clear conversation"><i class="fas fa-trash"></i></button>
          </div>
        </header>
        <div class="chat-panel"><div class="chat-panel-inner"><div id="chatContainer"><div class="welcome-screen" id="welcomeScreen">
          <div class="welcome-icon"><img id="welcome-logo" src="img/logos/stelena.svg" alt="Stelena" /></div>
          <div class="welcome-title">How can I help you?</div>
          <div class="welcome-sub">Ask Stelena anything — coding, research, writing, or just brainstorm ideas.</div>
          <div class="suggestion-grid">
            <button class="suggestion-card" onclick="useSuggestion('Write a Python script to analyze CSV data')"><span class="suggestion-card-label">Code</span><span class="suggestion-card-text">Write a Python script to analyze CSV data</span></button>
            <button class="suggestion-card" onclick="useSuggestion('Explain quantum computing in simple terms')"><span class="suggestion-card-label">Learn</span><span class="suggestion-card-text">Explain quantum computing in simple terms</span></button>
            <button class="suggestion-card" onclick="useSuggestion('Create a creative story about time travel')"><span class="suggestion-card-label">Creative</span><span class="suggestion-card-text">Create a creative story about time travel</span></button>
            <button class="suggestion-card" onclick="useSuggestion('Help me plan a productive daily routine')"><span class="suggestion-card-label">Productivity</span><span class="suggestion-card-text">Help me plan a productive daily routine</span></button>
          </div>
        </div></div></div></div>
      </main>
      <div class="composer" id="composer" role="form">
        <textarea id="userInput" rows="1" placeholder="Message Stelena..." onkeydown="handleKey(event)" oninput="autoResize(this)"></textarea>
        <button class="composer__btn" id="stopBtn" title="Stop generating" style="display:none"><i class="fas fa-stop"></i></button>
        <button class="composer__btn composer__btn--voice" id="voiceBtn" title="Voice input" onclick="toggleVoice()"><i class="fas fa-microphone"></i></button>
        <button class="composer__btn composer__btn--send" id="sendBtn" title="Send" onclick="sendMessage()"><i class="fas fa-paper-plane"></i></button>
      </div>
      <div class="model-menu" id="modelMenu" role="listbox"><div class="model-menu__head">Choose a model</div><div class="model-menu__list" id="model-menu-list"></div></div>
    </section>`,

    cloud: `<section class="workspace-view workspace-cloud" data-workspace="cloud">
      <div class="cg-page"><h1 class="cg-heading">Cloud Gaming</h1><div class="cg-toolbar"><input class="cg-search" id="cg-search" type="search" placeholder="Search games..." autocomplete="off" /><span class="cg-count" id="cg-count"></span></div><div class="cg-tags"><span class="cg-tags__label">Genre</span><div class="cg-tags__row" id="cg-tags"></div></div><div class="cg-tags cg-tags--secondary"><span class="cg-tags__label">Tags</span><div class="cg-tags__row" id="cg-tags-sub"></div></div><div class="cg-grid" id="cg-grid"></div></div><div class="cg-ctx-menu hidden" id="cg-ctx-menu"></div>
    </section>`,

    media: `<section class="workspace-view workspace-media" data-workspace="media">
      <div class="stream-hero"><div class="stream-hero__inner"><h1 class="stream-hero__title" id="hero-title">Watch <em>Cinema</em></h1><p class="stream-hero__sub" id="hero-sub">Thousands of films, instantly</p></div></div>
      <div class="stream-page"><div class="media-tabs"><button class="media-tab active" data-type="movie"><i class="fas fa-film"></i> Movies</button><button class="media-tab" data-type="tv"><i class="fas fa-tv"></i> TV Shows</button><button class="media-tab" data-type="anime"><i class="fas fa-dragon"></i> Anime</button></div><div class="stream-controls"><input class="stream-search" id="game-search" type="search" placeholder="Search..." autocomplete="off" /><div class="stream-filters"><div class="stream-select-wrap" id="age-sort-wrap"><button class="stream-select" id="age-sort-btn" type="button" title="Age rating filter" aria-haspopup="listbox" aria-expanded="false"><span id="age-sort-label">All ratings</span><i class="fa-solid fa-chevron-down stream-select-caret"></i></button><div class="stream-dropdown" id="age-sort-menu" role="listbox"><button class="stream-dropdown__item active" data-value="all">All ratings</button><button class="stream-dropdown__item" data-value="G">G</button><button class="stream-dropdown__item" data-value="PG">PG</button><button class="stream-dropdown__item" data-value="PG-13">PG-13</button><button class="stream-dropdown__item" data-value="R">R</button><button class="stream-dropdown__item" data-value="MA">MA / 18+</button></div></div><button class="adult-toggle" id="adult-toggle" aria-pressed="false" title="Toggle adult content"><i class="fas fa-eye"></i><span id="adult-toggle-text">Off</span></button></div></div><div class="tags-section"><div class="tags-bar" id="tags-bar"></div></div><div class="section-header"><button class="special-view-back" id="special-view-back" style="display:none"><i class="fas fa-arrow-left"></i> Back</button><span class="section-label" id="section-label">Popular Films</span><span class="count-badge" id="count-badge"></span></div><div class="shelf-section" id="continue-watching-section" style="display:none"><div class="shelf-section__header"><span><i class="fas fa-play-circle"></i> Continue Watching</span><button class="shelf-see-all" id="continue-see-all">See all</button></div><div class="shelf-row" id="continue-row"></div></div><div class="shelf-section" id="favorites-section" style="display:none"><div class="shelf-section__header"><span><i class="fas fa-heart"></i> My Favourites</span><button class="shelf-see-all" id="favorites-see-all">See all</button></div><div class="shelf-row" id="favorites-row"></div></div><div class="stream-grid" id="games-container"><div class="no-results" id="no-results" style="display:none"><i class="fas fa-film"></i><p>No results found</p></div></div><div id="scroll-sentinel"></div><div class="scroll-spinner" id="scroll-spinner"></div></div>
      <div class="section-toast" id="section-toast"><div class="section-toast__body"><strong id="toast-title"></strong><span id="toast-msg"></span></div><button class="section-toast__switch" id="toast-switch"></button><button class="section-toast__close" onclick="document.getElementById('section-toast').classList.remove('visible')"><i class="fas fa-xmark"></i></button></div><div class="fb-toast" id="fb-toast"><i id="fb-toast-icon" class="fas fa-heart"></i><span id="fb-toast-text"></span></div>
      <div class="modal-backdrop age-verify-backdrop" id="age-verify-backdrop" onclick="denyAgeVerify()"></div><div class="age-verify" id="age-verify"><div class="age-verify__box"><div class="age-verify__icon"><i class="fas fa-cake-candles"></i></div><h2 class="age-verify__title">Age Verification</h2><p class="age-verify__desc">Adult content includes titles rated MA, NC-17, TV-MA, and similar. You must be 18 or of legal age in your region to enable this.</p><p class="age-verify__question">Are you 18 or older?</p><div class="age-verify__btns"><button class="age-verify__deny" onclick="denyAgeVerify()">No, I'm under 18</button><button class="age-verify__confirm" onclick="confirmAgeVerify()">Yes, I'm 18 or older</button></div></div></div>
      <div class="modal-backdrop" id="details-backdrop" onclick="closeOverlayStack()"></div><div class="adult-gate" id="adult-gate"><div class="adult-gate__box"><div class="adult-gate__icon"><i class="fas fa-shield-halved"></i></div><h2 class="adult-gate__title">Mature Content</h2><p class="adult-gate__desc">This title is flagged as adult content. Enable adult content to view it.</p><div class="adult-gate__btns"><button class="adult-gate__deny" onclick="denyAdultGate()">Cancel</button><button class="adult-gate__confirm" onclick="confirmAdultGate()">Enable &amp; Watch</button></div></div></div>
      <div class="details-modal" id="details-modal"><div class="details-modal__inner"><button class="details-modal__close" onclick="closeDetailsModal()"><i class="fas fa-xmark"></i></button><div class="details-layout"><img class="details-poster" id="details-poster" src="" alt="" /><div class="details-info"><div class="details-chips"><span class="details-chip" id="details-type-chip">Film</span><span class="details-chip details-chip--age" id="details-age-rating">NR</span><span class="details-chip details-chip--rating"><i class="fas fa-star"></i> <span id="details-rating">N/A</span></span></div><h2 class="details-title" id="details-title"></h2><p class="details-subtitle" id="details-subtitle"></p><p class="details-overview" id="details-overview"></p><div class="details-tv-controls" id="details-tv-controls"><div class="detail-dropdown" id="detail-season-dropdown"><button class="detail-dropdown__btn" onclick="toggleDetailDropdown('season')"><span id="detail-season-value">Season 1</span><i class="fas fa-chevron-down"></i></button><div class="detail-dropdown__menu" id="detail-season-menu"></div></div><div class="detail-dropdown" id="detail-episode-dropdown"><button class="detail-dropdown__btn" onclick="toggleDetailDropdown('episode')"><span id="detail-episode-value">Episode 1</span><i class="fas fa-chevron-down"></i></button><div class="detail-dropdown__menu" id="detail-episode-menu"></div></div></div><div class="details-actions"><button class="details-watch-btn" onclick="watchSelectedTitle()"><i class="fas fa-play"></i> Watch Now</button><button class="details-fav-btn" id="details-fav-btn"><i class="far fa-heart"></i> Favourite</button></div></div></div></div></div>
      <div class="player-backdrop" id="player-backdrop" onclick="closePlayer()"></div><div class="player" id="player"><div class="player__bar"><button class="player__btn" onclick="closePlayer()" title="Close"><i class="fas fa-arrow-left"></i></button><span class="player__title" id="player-title"></span><div class="player__spacer"></div><div class="ep-controls" id="ep-controls"><select id="season-select" onchange="onSeasonChange()" title="Season"></select><select id="episode-select" onchange="onEpisodeChange()" title="Episode"></select></div><div class="source-toggle" id="source-toggle" title="Switch player source"><button class="source-toggle__btn active" data-source="videasy" onclick="setPlayerSource('videasy')">Videasy</button><button class="source-toggle__btn" data-source="vidcore" onclick="setPlayerSource('vidcore')">VidCore</button></div><button class="player__btn" onclick="toggleFullscreen()" title="Fullscreen"><i class="fa-solid fa-expand" id="fs-icon"></i></button></div><iframe id="player-frame" allowfullscreen allow="autoplay; fullscreen; encrypted-media; picture-in-picture"></iframe><div id="player-bar-ghost" class="player-bar-ghost"></div></div>
    </section>`,

    vms: `<section class="workspace-view workspace-vms" data-workspace="vms">
      <main id="main-content"><header class="page-header"><div class="page-header-left"><div class="page-header-icon"><i class="fa-solid fa-desktop"></i></div><div><h1 class="page-title">Virtual Machines</h1><p class="page-subtitle">Launch a temporary cloud browser session directly inside Plutonium Network.</p></div></div><div class="page-header-right"><button class="vm-pin-btn" id="vm-pin-btn" title="Pin a quick-launch to your home screen"><i class="fa-solid fa-thumbtack"></i><span>Pin to Home</span></button></div></header><section class="vm-layout"><aside class="vm-sidebar"><div class="vm-panel vm-panel-hero glass"><div class="vm-panel-label">Session</div><div class="vm-status-card"><div class="vm-status-dot"></div><div class="vm-status-copy"><div class="vm-status-title">Current Status</div><div class="vm-status" id="status">No active session</div></div></div><div class="vm-timer" id="timer" style="display:none"><i class="fa-solid fa-clock"></i><span>Time remaining: 15:00</span></div></div><div class="vm-panel glass"><div class="vm-panel-label">Controls</div><div class="vm-controls"><button class="vm-btn vm-btn-primary" id="startBtn"><i class="fas fa-play"></i><span>Start Session</span></button><button class="vm-btn" id="endBtn" disabled><i class="fas fa-stop"></i><span>End Session</span></button><button class="vm-btn" id="fullscreenBtn" style="display:none"><i class="fas fa-expand"></i><span>Fullscreen</span></button></div></div><div class="vm-panel glass"><div class="vm-panel-label">How It Works</div><div class="vm-note-list"><div class="vm-note"><i class="fa-solid fa-cloud"></i><span>Each session runs in the cloud and expires automatically after 15 minutes.</span></div><div class="vm-note"><i class="fa-solid fa-shield"></i><span>Use fullscreen when you want a cleaner browsing workspace.</span></div><div class="vm-note"><i class="fa-solid fa-rotate"></i><span>Ending the session destroys the temporary browser instance.</span></div></div></div></aside><section class="vm-stage"><div class="vm-frame-shell glass"><div id="hyperbeam-container"><div id="containerMessage"><div class="vm-empty-state"><div class="vm-empty-icon"><i class="fa-solid fa-window-maximize"></i></div><div class="vm-empty-title">No browser session running</div><div class="vm-empty-subtitle">Start a session from the left to load your virtual machine here.</div></div></div></div></div></section></section></main>
    </section>`
  };

  const bundles = {
    games: { css: 'css/games.css', scripts: ['https://cdn.jsdelivr.net/gh/luminsdk/script@latest/lumin.min.js', 'js/games.js', 'js/personal-games.js'] },
    ai: { css: 'css/ai.css', scripts: ['js/ai.js'] },
    cloud: { css: 'css/cloud.css', scripts: ['js/cloud.js'] },
    media: { css: 'css/stream.css', scripts: ['js/stream.js?v=20260825'] },
    vms: { css: 'css/vms.css', scripts: ['js/vms.js'], module: true }
  };

  function build() {
    if (!root || root.dataset.built) return;
    root.innerHTML = Object.values(views).join('');
    root.dataset.built = 'true';
    root.hidden = true;
  }

  function setStyle(key) {
    const bundle = bundles[key];
    if (!bundle || activeStyle?.dataset.workspace === key) return;
    if (activeStyle) activeStyle.remove();
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = bundle.css;
    link.dataset.workspace = key;
    document.head.appendChild(link);
    activeStyle = link;
  }

  function loadScript(src, module) {
    if (loadedScripts.has(src)) return Promise.resolve();
    loadedScripts.add(src);
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      if (module) script.type = 'module';
      script.onload = resolve;
      script.onerror = () => reject(new Error('Failed to load ' + src));
      document.body.appendChild(script);
    });
  }

  async function loadBundle(key) {
    const bundle = bundles[key];
    if (!bundle) return;
    setStyle(key);
    for (const src of bundle.scripts) await loadScript(src, bundle.module && src === bundle.scripts[bundle.scripts.length - 1]);
  }

  async function activate(key, suffix = '') {
    if (!views[key] || !root) return false;
    build();
    root.hidden = false;
    root.querySelectorAll('.workspace-view').forEach(view => { view.hidden = view.dataset.workspace !== key; });
    activeKey = key;
    root.dataset.activeWorkspace = key;
    window.PluWorkspaceRouteSuffix = suffix || '';
    await loadBundle(key);
    if (activeWorkspaceStyle) activeWorkspaceStyle.remove();
    activeWorkspaceStyle = document.createElement('link');
    activeWorkspaceStyle.rel = 'stylesheet';
    activeWorkspaceStyle.href = 'css/workspace.css';
    activeWorkspaceStyle.dataset.workspaceShared = 'true';
    document.head.appendChild(activeWorkspaceStyle);
    if (!sharedGlassStyle) {
      sharedGlassStyle = document.createElement('link');
      sharedGlassStyle.rel = 'stylesheet';
      sharedGlassStyle.href = 'css/glass.css';
      sharedGlassStyle.dataset.workspaceGlass = 'true';
      document.head.appendChild(sharedGlassStyle);
    }
    return true;
  }

  function deactivate() {
    if (!root) return;
    root.hidden = true;
    root.querySelectorAll('.workspace-view').forEach(view => { view.hidden = true; });
    activeKey = '';
    root.dataset.activeWorkspace = '';
    if (activeStyle) { activeStyle.remove(); activeStyle = null; }
    if (activeWorkspaceStyle) { activeWorkspaceStyle.remove(); activeWorkspaceStyle = null; }
    if (sharedGlassStyle) { sharedGlassStyle.remove(); sharedGlassStyle = null; }
    window.PluWorkspaceRouteSuffix = '';
  }

  window.Workspaces = { activate, deactivate, build, has: key => !!views[key], get active() { return activeKey; } };
})();
