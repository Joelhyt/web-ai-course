// The best score. Every access is guarded: localStorage throws in Safari
// private mode and under some privacy settings, and a blocked record should
// never stop someone from playing. The game picker on the site's front page
// reads the same key.

const KEY = 'lander.best';

let fallback = 0;

/** 0 means no record yet. */
export function loadBest() {
  try {
    const value = Number.parseInt(window.localStorage.getItem(KEY) ?? '', 10);
    return Number.isFinite(value) && value > 0 ? value : 0;
  } catch {
    return fallback;
  }
}

export function saveBest(value) {
  fallback = value;
  try {
    window.localStorage.setItem(KEY, String(value));
  } catch {
    // Storage unavailable — the in-memory fallback keeps the session's best.
  }
}
