// content.js — маркировка DOM для тем и reels, FAB-переключатель, first-run подсказка.
(function () {
  const S = globalThis.EBLO_SELECTORS;

  function tagFeed() {
    const grid = document.querySelector(S.feedGrid);
    if (grid && !grid.hasAttribute('data-eblo-feed')) grid.setAttribute('data-eblo-feed', '');
    document.querySelectorAll(S.feedCard).forEach((c) => {
      if (!c.hasAttribute('data-eblo-post')) c.setAttribute('data-eblo-post', '');
    });
  }

  // FAB — быстрый тумблер режима листания (виден только в теме Telegram, см. CSS)
  function injectFab() {
    if (document.getElementById('eblo-reels-fab')) return;
    const fab = document.createElement('button');
    fab.id = 'eblo-reels-fab';
    fab.type = 'button';
    fab.title = 'Лента с комментариями (Telegram)';
    fab.setAttribute('aria-label', 'Лента с комментариями');
    fab.innerHTML =
      '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="7" y="3" width="10" height="18" rx="2"/><path d="M12 7v0"/><path d="M9 12h6"/></svg>';
    fab.addEventListener('click', () => {
      try {
        chrome.storage.sync.get({ reels: false }, (c) => {
          chrome.storage.sync.set({ reels: !c.reels });
        });
      } catch (e) {}
    });
    document.body.appendChild(fab);
  }

  function onReady() {
    tagFeed();
    injectFab();
    const obs = new MutationObserver(() => tagFeed());
    obs.observe(document.body, { childList: true, subtree: true });
  }

  if (document.body) onReady();
  else document.addEventListener('DOMContentLoaded', onReady, { once: true });
})();
