// theme-engine.js — применение тем классом на <html>. Без React/зависимостей.
(function () {
  const ROOT = document.documentElement;
  const THEME_CLASSES = ['theme-vk-old', 'theme-telegram'];
  const STATE_CLASSES = ['is-dark', 'feed-reels'];

  const DEFAULTS = { theme: 'default', dark: true, reels: false };

  function applyState(cfg) {
    // theme
    THEME_CLASSES.forEach((c) => ROOT.classList.remove(c));
    if (cfg.theme && cfg.theme !== 'default') ROOT.classList.add('theme-' + cfg.theme);
    ROOT.dataset.ebloReskin = cfg.theme || 'default';

    // dark (актуально только для telegram)
    ROOT.classList.toggle('is-dark', cfg.theme === 'telegram' ? !!cfg.dark : false);

    // reels (актуально только для telegram)
    const reelsOn = cfg.theme === 'telegram' && !!cfg.reels;
    ROOT.classList.toggle('feed-reels', reelsOn);

    // сообщаем feed-swipe о смене режима
    window.dispatchEvent(new CustomEvent('eblo:reels', { detail: { on: reelsOn } }));
  }

  function load() {
    try {
      chrome.storage.sync.get(DEFAULTS, (cfg) => applyState({ ...DEFAULTS, ...cfg }));
    } catch (e) {
      applyState(DEFAULTS);
    }
  }

  // применяем как можно раньше (run_at document_start) — минимизируем FOUC
  load();

  try {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'sync') return;
      if (changes.theme || changes.dark || changes.reels) load();
    });
  } catch (e) {}

  globalThis.EBLO_applyState = applyState;
})();
