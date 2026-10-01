// Personal bests. Every access is guarded: localStorage throws in Safari
// private mode and under some privacy settings, and a blocked record should
// never stop someone from playing.
//
// Marathon's best is the highest score; Sprint's is the *lowest* time, in ms.
// Both keys are read by the game picker on the site's front page as well.

const KEYS = {
  marathon: 'tetris.best.marathon',
  sprint: 'tetris.best.sprint',
};

const fallback = { marathon: 0, sprint: 0 };

/** 0 means no record yet, in both modes. */
export function loadBest(mode) {
  try {
    const value = Number.parseInt(window.localStorage.getItem(KEYS[mode]) ?? '', 10);
    return Number.isFinite(value) && value > 0 ? value : 0;
  } catch {
    return fallback[mode] ?? 0;
  }
}

export function saveBest(mode, value) {
  fallback[mode] = value;
  try {
    window.localStorage.setItem(KEYS[mode], String(value));
  } catch {
    // Storage unavailable — the in-memory fallback keeps the session's best.
  }
}

/** Whether `result` beats `best` in this mode. */
export function isRecord(mode, result, best) {
  if (mode === 'sprint') return best === 0 || result < best;
  return result > best;
}
