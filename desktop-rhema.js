/* Desktop-only Rhema navigation. This file is not loaded by the phone site. */
(function () {
  function readerOpen() {
    return document.getElementById('rhemaModal')?.classList.contains('open');
  }

  async function read() {
    if (readerOpen()) return;
    if (typeof _rhemaMapsReturn !== 'undefined' && _rhemaMapsReturn) {
      _rhemaReturnFromMaps();
      return;
    }
    await showRhema();
  }

  function dismissAccount() {
    document.getElementById('desktopRhemaAccountPanel')?.classList.add('hidden');
    document.getElementById('desktopRhemaAccountBtn')?.setAttribute('aria-expanded', 'false');
  }

  function settleView(keep) {
    const panel = document.getElementById('rhemaReaderPanelOverlay');
    if (keep !== 'panel' && panel?.classList.contains('open')) {
      closeRhemaReaderPanel();
      panel.classList.remove('open');
    }
    const library = document.getElementById('wordLibraryOverlay');
    if (keep !== 'library' && library && !library.classList.contains('hidden')) {
      closeWordLibrary();
      library.classList.add('hidden');
    }
    const genealogy = document.getElementById('bibleGenealogyOverlay');
    if (keep !== 'genealogy' && genealogy) {
      window.BibleGenealogy?.close?.();
      genealogy.remove();
    }
    if (keep !== 'search' && document.getElementById('rhemaModal')?.classList.contains('rhema-search-open')) toggleRhemaSearch();
    if (!document.getElementById('rhemaCoachOverlay')?.classList.contains('hidden')) rhemaCoachSkip();
    if (!document.getElementById('appCoachOverlay')?.classList.contains('hidden') && typeof _endAppCoach === 'function') _endAppCoach();
  }

  function syncRail() {
    const atlasOpen = document.getElementById('atlasPage')?.classList.contains('active');
    const view = atlasOpen
      ? (document.getElementById('atlasTabPlaces')?.classList.contains('active') ? 'places' : 'journeys')
      : 'reader';
    document.querySelectorAll('#desktopShellNav [data-rhema-view]').forEach(button => {
      const current = button.dataset.rhemaView === view;
      button.classList.toggle('active', current);
      if (current) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
    });
  }

  window.syncDesktopRhemaLanguageUi = function () {
    const bar = document.getElementById('desktopRhemaLanguageBar');
    if (!bar || typeof _rhemaBook === 'undefined') return;
    const isOT = isRhemaOTBook(_rhemaBook);
    const active = _rhemaShowEnglish ? 'english' : isOT && _rhemaOTLayer === 'hebrew' ? 'hebrew' : 'greek';
    const hebrew = bar.querySelector('[data-rhema-language="hebrew"]');
    const greek = bar.querySelector('[data-rhema-language="greek"]');
    if (hebrew) hebrew.hidden = !isOT;
    if (greek) greek.title = isOT ? 'Greek Septuagint' : 'Greek New Testament';
    bar.querySelectorAll('button').forEach(button => {
      const selected = button.dataset.rhemaLanguage === active;
      button.classList.toggle('active', selected);
      button.setAttribute('aria-pressed', String(selected));
    });
  };

  window.desktopRhemaLanguagePick = function (language) {
    if (language === 'hebrew' && !isRhemaOTBook(_rhemaBook)) return;
    rhemaLanguagePick(language === 'greek' && isRhemaOTBook(_rhemaBook) ? 'lxx' : language);
    window.syncDesktopRhemaLanguageUi();
  };

  document.addEventListener('DOMContentLoaded', () => {
    const observer = new MutationObserver(syncRail);
    ['atlasPage', 'atlasTabPlaces', 'atlasTabJourneys', 'rhemaModal'].forEach(id => {
      const element = document.getElementById(id);
      if (element) observer.observe(element, { attributes: true, attributeFilter: ['class'] });
    });
    syncRail();
    window.syncDesktopRhemaLanguageUi();
  });

  window.desktopRhemaRead = async function () { settleView(); await read(); };
  window.desktopRhemaSearch = async function () {
    settleView('search');
    if (!readerOpen()) await read();
    requestAnimationFrame(() => {
      const modal = document.getElementById('rhemaModal');
      if (!modal?.classList.contains('rhema-search-open')) toggleRhemaSearch();
      document.getElementById('rhemaSearchInput')?.focus();
    });
  };
  window.desktopRhemaCrossRefs = async function () {
    settleView();
    await read();
    openRhemaCrossReferences();
  };
  window.desktopRhemaWordLibrary = async function () {
    settleView('library');
    await read();
    openWordLibrary();
  };
  window.desktopRhemaStudyTool = async function (tool) {
    settleView();
    await read();
    openStudyTool(tool);
  };
  window.desktopRhemaReaderTools = async function () {
    await read();
    if (document.getElementById('rhemaReaderPanelOverlay')?.classList.contains('open')) { closeRhemaReaderPanel(); return; }
    settleView('panel');
    openRhemaReaderPanel();
  };
  window.desktopRhemaAtlas = async function (tab) {
    settleView();
    if (typeof _rhemaMapsReturn !== 'undefined' && _rhemaMapsReturn) {
      if (document.getElementById('atlasPage')?.classList.contains('active')) setAtlasTab(tab);
      else { _rhemaReturnFromMaps(); await read(); _rhemaStashForMaps(); openBibleAtlasPage(); setAtlasTab(tab); }
      return;
    }
    await read();
    _rhemaStashForMaps();
    openBibleAtlasPage();
    setAtlasTab(tab);
    const icon = document.getElementById('atlasBackIcon');
    if (icon) icon.textContent = 'arrow_back';
    document.getElementById('atlasBackBtn')?.setAttribute('aria-label', 'Back to Rhēma');
  };
  window.desktopRhemaGenealogy = function () {
    settleView('genealogy');
    if (typeof openGenealogyMap === 'function') openGenealogyMap();
  };
  window.desktopRhemaAccount = function () {
    const panel = document.getElementById('desktopRhemaAccountPanel');
    const button = document.getElementById('desktopRhemaAccountBtn');
    if (!panel || !button) return;
    const opening = panel.classList.contains('hidden');
    if (!opening) { dismissAccount(); return; }
    const user = window.Auth?.getCurrentUser?.();
    const name = localStorage.getItem('authDisplayName') || localStorage.getItem('authUsername') || user?.email || 'Your Rhema account';
    document.getElementById('desktopRhemaAccountName').textContent = user ? name : 'Study with an account';
    document.getElementById('desktopRhemaAccountHint').textContent = user ? 'Your studies and saved work follow you across devices.' : 'Sign in to save and sync your studies.';
    document.getElementById('desktopRhemaAccountAction').textContent = user ? 'Sign out' : 'Sign in or create account';
    panel.classList.remove('hidden');
    button.setAttribute('aria-expanded', 'true');
  };
  window.desktopRhemaAccountAction = function () {
    dismissAccount();
    if (window.Auth?.getCurrentUser?.()) signOutAccount();
    else openGuestAccountPrompt();
  };

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') dismissAccount();
  });
  document.addEventListener('pointerdown', (event) => {
    if (!event.target.closest('#desktopRhemaAccountPanel, #desktopRhemaAccountBtn')) dismissAccount();
  });
})();
