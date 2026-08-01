// api-cache.js — перехватывает ответы /api/feed (сайт вызывает их сам при листании/фильтрах)
// и кэширует ПОЛНЫЕ данные поста по short_code: реальное описание без обрезки,
// прямой путь к видеофайлу (public_path), флаг альбома. DOM карточки этого не даёт —
// сайт сам обрезает текст и рендерит только превью-картинку.
//
// Также умеет один раз стянуть HTML самой страницы поста (/{short_code}) — там сервер
// уже отрисовывает ВСЕ фото альбома (.album-media), это нужно для листания фото в ленте.
(function () {
  const byCode = new Map();
  const albumCache = new Map();

  function ingest(json) {
    if (!json || !Array.isArray(json.files)) return;
    json.files.forEach((f) => {
      if (f && f.short_code) byCode.set(f.short_code, f);
    });
  }

  // --- fetch() ---
  const origFetch = window.fetch;
  window.fetch = function (input, init) {
    const url = typeof input === 'string' ? input : (input && input.url) || '';
    const p = origFetch.apply(this, arguments);
    if (url.indexOf('/api/feed') !== -1) {
      p.then((r) => r.clone().json()).then(ingest).catch(() => {});
    }
    return p;
  };

  // --- XHR (на случай, если где-то используется вместо fetch) ---
  const origOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url) {
    if (typeof url === 'string' && url.indexOf('/api/feed') !== -1) {
      this.addEventListener('load', function () {
        try { ingest(JSON.parse(this.responseText)); } catch (e) {}
      });
    }
    return origOpen.apply(this, arguments);
  };

  function getRecord(shortCode) {
    return byCode.get(shortCode) || null;
  }

  // Активные фильтры ленты сайта → параметры /api/feed. Кнопки .filter-option несут
  // точные API-значения в data-sort / data-type / data-time.
  function currentFeedParams() {
    const pick = (attr, def) => {
      const el = document.querySelector('.filter-option.active[data-' + attr + ']');
      return (el && el.getAttribute('data-' + attr)) || def;
    };
    return {
      sort: pick('sort', 'best'),
      type: pick('type', 'all'),
      time: pick('time', 'today')
    };
  }

  // Первые ~15 карточек рендерит сервер (SSR), их нет в кэше — сайт зовёт /api/feed
  // только при скролле/смене фильтра. Поэтому один раз догружаем offset=0 сами:
  // без этого полный текст поста для верхних карточек взять неоткуда.
  let warmed = null;
  function warm(force) {
    if (warmed && !force) return warmed;
    const p = currentFeedParams();
    const url = '/api/feed?sort=' + p.sort + '&type=' + p.type + '&time=' + p.time + '&offset=0&limit=30';
    warmed = fetch(url, { headers: { Accept: 'application/json' }, credentials: 'include' })
      .then((r) => r.clone().json())
      .then((j) => { ingest(j); return true; })
      .catch(() => false);
    return warmed;
  }

  // Список всех фото альбома — HTML страницы поста уже содержит их все (сервер рендерит сразу),
  // так что просто парсим .album-media, без доп. API.
  function fetchAlbumImages(shortCode) {
    if (albumCache.has(shortCode)) return albumCache.get(shortCode);
    const p = fetch('/' + shortCode, { headers: { Accept: 'text/html' }, credentials: 'include' })
      .then((r) => r.text())
      .then((html) => {
        const doc = new DOMParser().parseFromString(html, 'text/html');
        return [...doc.querySelectorAll('.album-media')]
          .map((img) => img.getAttribute('src'))
          .filter(Boolean);
      })
      .catch(() => []);
    albumCache.set(shortCode, p);
    return p;
  }

  globalThis.EBLO_API = { getRecord, fetchAlbumImages, warm, currentFeedParams };
})();
