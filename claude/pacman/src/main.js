// Wires the pure game rules to the canvas, the keyboard and the HUD, and owns
// the animation loop.

import { createGame, start, advanceClock, steer, togglePause } from './game.js';
import { render, resizeCanvas } from './renderer.js';
import { attachKeyboard } from './input.js';
import { loadBest, saveBest } from './storage.js';

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');

const scoreEl = document.getElementById('score');
const bestEl = document.getElementById('best');
const levelEl = document.getElementById('level');
const announcerEl = document.getElementById('announcer');

let state = createGame();
let best = loadBest();
let layout = resizeCanvas(canvas, ctx, state.config);
let lastFrame = performance.now();

/**
 * Keeps the best score. Called every frame and on restart, so points scored in
 * a game abandoned with R still count.
 */
function recordResult() {
  if (state.score > best) {
    best = state.score;
    // Writing on every point would hit storage dozens of times a second; the
    // record is saved when it can no longer grow.
    if (state.status === 'over') saveBest(best);
  }
}

function restart() {
  recordResult();
  saveBest(best);
  state = createGame();
}

/** Enter: start from the ready screen, or go again once the game is over. */
function confirm() {
  if (state.status === 'ready') start(state);
  else if (state.status === 'over') {
    restart();
    start(state);
  }
}

attachKeyboard({
  onSteer: (dir) => steer(state, dir),
  onPause: () => togglePause(state),
  onRestart() {
    restart();
    start(state);
  },
  onConfirm: confirm,
  // Space only starts: on the game-over screen a stray press should not skip
  // past the result.
  onStart() {
    if (state.status === 'ready') start(state);
  },
});

// Coming back to a lost life because the tab was in the background is
// miserable.
document.addEventListener('visibilitychange', () => {
  if (document.hidden && state.status === 'running') togglePause(state);
});

// A best scored in a game still in progress is not lost to a closed tab.
window.addEventListener('pagehide', () => {
  if (best > loadBest()) saveBest(best);
});

// Both the window size and the device pixel ratio decide the tile size.
window.addEventListener('resize', () => {
  layout = resizeCanvas(canvas, ctx, state.config);
});

// Screen readers hear what happens, rather than nothing at all.
let announced = null;
function announce() {
  const event = state.lastEvent;
  if (!event || event === announced) return;
  announced = event;
  announcerEl.textContent = event.text;
}

function updateHud() {
  scoreEl.textContent = state.score.toLocaleString();
  bestEl.textContent = best.toLocaleString();
  levelEl.textContent = String(state.level);
}

function frame(now) {
  // Clamping stops a stalled tab from arriving with a huge delta and running
  // seconds of play in one frame.
  const delta = Math.min(now - lastFrame, 250);
  lastFrame = now;

  advanceClock(state, delta);
  recordResult();
  announce();
  updateHud();
  render(ctx, state, layout, now);
  requestAnimationFrame(frame);
}

// Draw the ready screen at once rather than waiting on the first frame.
updateHud();
render(ctx, state, layout, lastFrame);
requestAnimationFrame(frame);
