// Fills in each game's personal bests on the picker. The keys are the ones the
// games themselves write; see snake/src/storage.js and tetris/src/storage.js.

// m:ss.cc, matching how Tetris shows a Sprint time.
function formatTime(ms) {
  const total = Math.floor(ms / 10);
  const seconds = Math.floor(total / 100) % 60;
  const minutes = Math.floor(total / 6000);
  return `${minutes}:${String(seconds).padStart(2, '0')}.${String(total % 100).padStart(2, '0')}`;
}

function read(key) {
  // localStorage throws in Safari private mode and under some privacy settings;
  // the picker then just shows no records.
  try {
    const value = Number.parseInt(window.localStorage.getItem(key) ?? '', 10);
    return Number.isFinite(value) && value > 0 ? value : 0;
  } catch {
    return 0;
  }
}

for (const el of document.querySelectorAll('[data-best]')) {
  const value = read(el.dataset.best);
  if (!value) continue;
  el.textContent = el.dataset.format === 'time' ? formatTime(value) : value.toLocaleString();
}
