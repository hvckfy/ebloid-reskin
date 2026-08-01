const DEFAULTS = { theme: 'default', dark: true, reels: false };
const $ = (s) => document.querySelector(s);

function refreshTgOpts(theme) {
  $('#tg-opts').classList.toggle('disabled', theme !== 'telegram');
}

chrome.storage.sync.get(DEFAULTS, (cfg) => {
  const c = { ...DEFAULTS, ...cfg };
  const radio = document.querySelector(`input[name="theme"][value="${c.theme}"]`);
  if (radio) radio.checked = true;
  $('#dark').checked = !!c.dark;
  $('#reels').checked = !!c.reels;
  refreshTgOpts(c.theme);
});

document.querySelectorAll('input[name="theme"]').forEach((r) => {
  r.addEventListener('change', () => {
    chrome.storage.sync.set({ theme: r.value });
    refreshTgOpts(r.value);
  });
});
$('#dark').addEventListener('change', (e) => chrome.storage.sync.set({ dark: e.target.checked }));
$('#reels').addEventListener('change', (e) => chrome.storage.sync.set({ reels: e.target.checked }));
