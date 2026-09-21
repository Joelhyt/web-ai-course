// High score persistence. Every access is guarded: localStorage throws in
// Safari private mode and under some privacy settings, and a blocked high
// score should never stop someone from playing.

const KEY = 'snake.highScore';

let fallback = 0;

export function loadHighScore() {
  try {
    const raw = window.localStorage.getItem(KEY);
    const value = Number.parseInt(raw ?? '', 10);
    return Number.isFinite(value) && value > 0 ? value : 0;
  } catch {
    return fallback;
  }
}

export function saveHighScore(score) {
  fallback = score;
  try {
    window.localStorage.setItem(KEY, String(score));
  } catch {
    // Storage unavailable — the in-memory fallback keeps the session's best score.
  }
}
