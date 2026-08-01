// feed-swipe.js — режим «Лента с комментариями» (тема Telegram).
// Посты компактнее, скролл бесшовный (без snap), справа от каждого поста —
// подгруженные комментарии. Плюс точечные улучшения самой карточки:
//  - показ ПОЛНОГО текста поста (сайт в DOM обрезает описание, полный текст берём из /api/feed);
//  - видео проигрывается прямо в карточке (вместо статичного постера);
//  - альбомы (несколько фото) листаются на месте, без перехода на страницу поста;
//  - маленькая кнопка-иконка «открыть пост» — ведёт по той же ссылке, что и на сайте.
(function () {
  const S = globalThis.EBLO_SELECTORS;
  let enabled = false;
  let io = null;
  let mo = null;

  const isOn = () => document.documentElement.classList.contains('feed-reels');
  const posts = () => [...document.querySelectorAll('[data-eblo-post]')];

  // ---- утилиты ----
  function esc(s) {
    const d = document.createElement('div');
    d.textContent = s == null ? '' : String(s);
    return d.innerHTML;
  }
  function shortCodeOf(post) {
    const link = post.querySelector(S.cardLink);
    if (!link) return null;
    const href = link.getAttribute('href') || '';
    return href.split('/').filter(Boolean).pop() || null;
  }

  // ---- рендер комментариев ----
  function commentHTML(c, depth) {
    if (!c || c.is_deleted) return '';
    const a = c.author || {};
    const name = esc(a.name || a.login || 'аноним');
    const av = a.avatar
      ? '<img class="eblo-c-av" src="' + esc(a.avatar) + '" alt="" loading="lazy">'
      : '<span class="eblo-c-av eblo-c-av--ph"></span>';
    const replies =
      depth < 2 && c.replies && c.replies.length
        ? '<div class="eblo-c-replies">' + c.replies.map((r) => commentHTML(r, depth + 1)).join('') + '</div>'
        : '';
    return (
      '<div class="eblo-c-item">' +
      av +
      '<div class="eblo-c-b">' +
      '<div class="eblo-c-top"><span class="eblo-c-name">' + name + '</span>' +
      '<span class="eblo-c-score">♥ ' + esc(c.score || 0) + '</span></div>' +
      '<div class="eblo-c-txt">' + esc(c.content) + '</div>' +
      replies +
      '</div></div>'
    );
  }

  function renderComments(panel, j) {
    const head = panel.querySelector('.eblo-c-head');
    const list = panel.querySelector('.eblo-c-list');
    list.classList.remove('eblo-c-loading');
    const cs = (j && j.comments) || [];
    const total = j && j.total != null ? j.total : cs.length;
    head.textContent = total + ' ' + plural(total, ['комментарий', 'комментария', 'комментариев']);
    if (!cs.length) {
      list.innerHTML = '<div class="eblo-c-empty">Пока нет комментариев</div>';
      return;
    }
    list.innerHTML = cs.map((c) => commentHTML(c, 0)).join('');
  }

  function plural(n, forms) {
    const m10 = n % 10, m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return forms[0];
    if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return forms[1];
    return forms[2];
  }

  async function loadComments(post) {
    if (post.dataset.ebloC) return;
    post.dataset.ebloC = '1';
    const code = shortCodeOf(post);
    if (!code) { post.dataset.ebloC = ''; return; }

    const panel = document.createElement('div');
    panel.className = 'eblo-comments';
    panel.innerHTML =
      '<div class="eblo-c-head">Комментарии</div>' +
      '<div class="eblo-c-list eblo-c-loading">Загрузка…</div>';
    post.appendChild(panel);

    try {
      const r = await fetch('/api/post/' + code + '/comments?sort=new', {
        headers: { Accept: 'application/json' },
        credentials: 'include'
      });
      const j = await r.json();
      renderComments(panel, j);
    } catch (e) {
      panel.querySelector('.eblo-c-list').textContent = 'Не удалось загрузить комментарии';
    }
  }

  // ---- кнопка «открыть пост» (иконка, ведёт на ту же ссылку, что и карточка сайта) ----
  function addOpenButton(post, code) {
    if (post.querySelector('.eblo-open-btn')) return;
    const link = post.querySelector(S.cardLink);
    const btn = document.createElement('a');
    btn.className = 'eblo-open-btn';
    btn.href = link ? link.getAttribute('href') : '/' + code;
    btn.title = 'Открыть пост';
    btn.setAttribute('aria-label', 'Открыть пост');
    btn.innerHTML =
      '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round">' +
      '<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>' +
      '<polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>';
    btn.addEventListener('click', (e) => e.stopPropagation());
    post.appendChild(btn);
  }

  // ---- полный текст поста (сайт обрезает и заголовок, и описание — иногда прямо на сервере,
  //      напр. описание 41 симв. в DOM против 358 в /api/feed). Полный текст берём из кэша,
  //      CSS дополнительно снимает обрезание. ----
  function enhanceText(post, rec) {
    const titleEl = post.querySelector(S.cardTitle);
    if (titleEl && rec && rec.title && !titleEl.dataset.ebloFull) {
      titleEl.dataset.ebloFull = '1';
      titleEl.textContent = rec.title;
    }
    const descEl = post.querySelector(S.cardDesc);
    if (descEl && !descEl.dataset.ebloFull) {
      const full = rec && rec.description != null ? String(rec.description).trim() : '';
      if (full) {
        descEl.dataset.ebloFull = '1';
        descEl.textContent = full; // textContent → безопасно, теги не исполняются
        descEl.classList.add('eblo-desc-full');
      } else if (descEl.textContent.trim()) {
        // записи в кэше нет — хотя бы снимаем однострочное CSS-обрезание того, что есть в DOM
        descEl.classList.add('eblo-desc-full');
      }
    }
  }

  // Видео-карточка распознаётся по разметке самого сайта (.feed-video-poster),
  // прямой путь к файлу лежит в data-full-src превью — API для этого не нужен.
  function videoPosterImg(post) {
    const wrap = post.querySelector(S.cardPreview);
    if (!wrap) return null;
    const vp = wrap.querySelector('.feed-video-poster');
    if (!vp) return null;
    return vp.querySelector('img') || wrap.querySelector('img');
  }

  // ---- видео прямо в карточке (вместо статичного постера) ----
  function enhanceVideo(post) {
    const wrap = post.querySelector(S.cardPreview);
    if (!wrap || wrap.querySelector('.eblo-inline-video')) return;
    const img = videoPosterImg(post);
    const src = img && img.getAttribute('data-full-src');
    if (!src) return;
    const poster = img.getAttribute('data-lazy-src') || img.getAttribute('src') || '';
    if (!wrap.dataset.ebloOrig) wrap.dataset.ebloOrig = wrap.innerHTML;
    const video = document.createElement('video');
    video.className = 'eblo-inline-video';
    video.src = src;
    if (poster) video.poster = poster;
    video.muted = true;
    video.loop = true;
    video.playsInline = true;
    video.controls = true;
    video.preload = 'metadata';
    video.addEventListener('click', (e) => e.stopPropagation());
    wrap.innerHTML = '';
    wrap.appendChild(video);
  }

  // ---- листание фото альбома прямо в карточке ----
  async function enhanceAlbum(post, code) {
    const wrap = post.querySelector(S.cardPreview);
    if (!wrap || wrap.querySelector('.eblo-album-track')) return;
    const urls = await globalThis.EBLO_API.fetchAlbumImages(code);
    if (!urls || urls.length < 2) return; // один кадр — обычный рендер сайта и так ок

    if (!wrap.dataset.ebloOrig) wrap.dataset.ebloOrig = wrap.innerHTML;
    wrap.classList.add('eblo-album');
    wrap.innerHTML = '';

    const track = document.createElement('div');
    track.className = 'eblo-album-track';
    urls.forEach((src) => {
      const img = document.createElement('img');
      img.src = src;
      img.loading = 'lazy';
      img.className = 'eblo-album-slide';
      track.appendChild(img);
    });

    // Стрелки-«шевроны»: треугольник без основания (две линии углом), без подложки.
    const prev = document.createElement('button');
    prev.type = 'button';
    prev.className = 'eblo-album-btn eblo-album-prev';
    prev.setAttribute('aria-label', 'Предыдущее фото');
    prev.innerHTML = '<svg width="22" height="30" viewBox="0 0 22 30" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="16,3 5,15 16,27"/></svg>';

    const next = document.createElement('button');
    next.type = 'button';
    next.className = 'eblo-album-btn eblo-album-next';
    next.setAttribute('aria-label', 'Следующее фото');
    next.innerHTML = '<svg width="22" height="30" viewBox="0 0 22 30" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6,3 17,15 6,27"/></svg>';

    const dots = document.createElement('div');
    dots.className = 'eblo-album-dots';
    urls.forEach((_, i) => {
      const d = document.createElement('span');
      d.className = 'eblo-album-dot' + (i === 0 ? ' active' : '');
      dots.appendChild(d);
    });

    let idx = 0;
    function go(delta) {
      idx = Math.max(0, Math.min(urls.length - 1, idx + delta));
      track.style.transform = 'translateX(-' + idx * 100 + '%)';
      [...dots.children].forEach((d, i) => d.classList.toggle('active', i === idx));
      prev.classList.toggle('eblo-hidden', idx === 0);
      next.classList.toggle('eblo-hidden', idx === urls.length - 1);
    }
    prev.classList.add('eblo-hidden'); // на первом кадре «на��ад» скрыта
    [prev, next, dots].forEach((el) => el.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); }));
    prev.addEventListener('click', () => go(-1));
    next.addEventListener('click', () => go(1));

    wrap.appendChild(track);
    wrap.appendChild(prev);
    wrap.appendChild(next);
    wrap.appendChild(dots);
  }

  // ---- данные из API-кэша (могут прийти не сразу — ждём и повторяем попытку) ----
  function tryEnhanceData(post, code, attempt) {
    if (!isOn()) return;
    const rec = globalThis.EBLO_API && globalThis.EBLO_API.getRecord(code);
    if (!rec) {
      if (attempt < 8) setTimeout(() => tryEnhanceData(post, code, attempt + 1), 400);
      return;
    }
    enhanceText(post, rec);
    if (rec.type === 'video') enhanceVideo(post);
    else if (rec.is_album) enhanceAlbum(post, code);
  }

  function enhancePost(post) {
    const code = shortCodeOf(post);
    if (!code) return;
    addOpenButton(post, code);
    tryEnhanceData(post, code, 0);
  }

  function loadAllVisible() {
    posts().forEach((p) => { loadComments(p); enhancePost(p); });
  }

  // ---- автоплей активного видео/аудио ----
  function setupIO() {
    if (io) io.disconnect();
    io = new IntersectionObserver(
      (entries) => {
        entries.forEach((en) => {
          const media = en.target.querySelectorAll('video, audio');
          if (en.isIntersecting && en.intersectionRatio > 0.5) {
            media.forEach((m) => { if (m.tagName === 'VIDEO') m.muted = true; m.play?.().catch(() => {}); });
          } else {
            media.forEach((m) => m.pause?.());
          }
        });
      },
      { threshold: [0, 0.5, 1] }
    );
    posts().forEach((p) => io.observe(p));
  }

  // ---- вкл / выкл ----
  function enable() {
    if (enabled) return;
    enabled = true;
    // Верхние ~15 карточек рендерит сервер (SSR) — их нет в кэше /api/feed. Прогреваем кэш один раз,
    // затем повторяем дообогащение данными (полный текст, инлайн-видео, листание альбома).
    try {
      const api = globalThis.EBLO_API;
      if (api && api.warm) {
        api.warm().then(() => { if (isOn()) posts().forEach((p) => enhancePost(p)); });
      }
    } catch (e) {}
    loadAllVisible();
    setupIO();
    mo = new MutationObserver(() => { if (isOn()) { loadAllVisible(); setupIO(); } });
    mo.observe(document.querySelector(S.feedGrid) || document.body, { childList: true });
  }

  function disable() {
    if (!enabled) return;
    enabled = false;
    if (io) io.disconnect();
    if (mo) mo.disconnect();
    document.querySelectorAll('.eblo-comments').forEach((el) => el.remove());
    document.querySelectorAll('.eblo-open-btn').forEach((el) => el.remove());
    document.querySelectorAll('.eblo-desc-toggle').forEach((el) => el.remove());
    document.querySelectorAll('.feed-card-description.eblo-desc-full').forEach((el) => {
      el.classList.remove('eblo-desc-full', 'eblo-desc-clamped');
      delete el.dataset.ebloFull;
    });
    document.querySelectorAll('[data-eblo-orig]').forEach((el) => {
      el.innerHTML = el.dataset.ebloOrig;
      delete el.dataset.ebloOrig;
      el.classList.remove('eblo-album');
    });
    posts().forEach((p) => {
      p.dataset.ebloC = '';
    });
  }

  window.addEventListener('eblo:reels', (e) => {
    const on = e.detail && e.detail.on;
    if (on) {
      if (document.body) enable();
      else document.addEventListener('DOMContentLoaded', enable, { once: true });
    } else {
      disable();
    }
  });
})();
