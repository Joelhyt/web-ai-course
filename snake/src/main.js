// Wires the pure game rules to the canvas, the keyboard and the HUD,
// and owns the animation loop.

import { createGame, tick, queueDirection } from './game.js';
import { render, resizeCanvas } from './renderer.js';
import { attachKeyboard } from './input.js';
import { loadHighScore, saveHighScore } from './storage.js';

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');

const scoreEl = document.getElementById('score');
const highScoreEl = document.getElementById('high-score');
const statusEl = document.getElementById('status');
const wallsEl = document.getElementById('walls');

let highScore = loadHighScore();
let state = createGame({ walls: wallsEl.value });
let lastFrame = performance.now();
let accumulator = 0;

resizeCanvas(canvas, ctx, state.config);

function restart() {
  state = createGame({ walls: wallsEl.value });
  accumulator = 0;
}

function togglePause() {
  if (state.status === 'ready' || state.status === 'paused') {
    state.status = 'running';
  } else if (state.status === 'running') {
    state.status = 'paused';
  } else {
    restart();
  }
}

attachKeyboard({
  onDirection(direction) {
    if (state.status === 'ready') state.status = 'running';
    if (state.status === 'running') queueDirection(state, direction);
  },
  onTogglePause: togglePause,
  onRestart: restart,
});

// Switching wall behaviour mid-round would be ambiguous, so it starts a fresh one.
wallsEl.addEventListener('change', restart);

// Coming back to a dead snake because the tab was in the background is miserable.
document.addEventListener('visibilitychange', () => {
  if (document.hidden && state.status === 'running') state.status = 'paused';
});

// The device pixel ratio changes when a window moves between monitors.
window.addEventListener('resize', () => resizeCanvas(canvas, ctx, state.config));

const STATUS_LABEL = {
  ready: 'Ready',
  running: 'Playing',
  paused: 'Paused',
  over: 'Game over',
  won: 'Cleared!',
};

function updateHud() {
  scoreEl.textContent = String(state.score);
  highScoreEl.textContent = String(highScore);
  statusEl.textContent = STATUS_LABEL[state.status];
}

function frame(now) {
  // Clamping stops a stalled or backgrounded tab from accumulating a huge delta
  // and then firing a burst of catch-up ticks the player never sees coming.
  const delta = Math.min(now - lastFrame, 250);
  lastFrame = now;

  if (state.status === 'running') {
    accumulator += delta;
    // A fixed timestep keeps the snake moving at the same speed regardless of
    // whether the display refreshes at 60Hz, 120Hz or 144Hz.
    while (accumulator >= state.tickInterval && state.status === 'running') {
      accumulator -= state.tickInterval;
      tick(state);
    }

    if (state.status !== 'running') {
      accumulator = 0;
      if (state.score > highScore) {
        highScore = state.score;
        saveHighScore(highScore);
      }
    }
  } else {
    accumulator = 0;
  }

  updateHud();
  render(ctx, state);
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
