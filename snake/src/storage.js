// High score persistence. Every access is guarded: localStorage throws in
// Safari private mode and under some privacy settings, and a blocked high
// score should never stop someone from playing.

// Each mode keeps its own best — a 60 second sprint and an open-ended round are
// not comparable scores. Classic keeps the original key so existing bests survive.
const KEYS = {
  classic: 'snake.highScore',
  time: 'snake.highScore.time',
};

const fallback = { classic: 0, time: 0 };

export function loadHighScore(mode = 'classic') {
  const key = KEYS[mode] ?? KEYS.classic;
  try {
    const raw = window.localStorage.getItem(key);
    const value = Number.parseInt(raw ?? '', 10);
    return Number.isFinite(value) && value > 0 ? value : 0;
  } catch {
    return fallback[mode] ?? 0;
  }
}

export function saveHighScore(mode, score) {
  fallback[mode] = score;
  try {
    window.localStorage.setItem(KEYS[mode] ?? KEYS.classic, String(score));
  } catch {
    // Storage unavailable — the in-memory fallback keeps the session's best score.
  }
}
