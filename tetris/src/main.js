// Wires the pure game rules to the canvas, the keyboard and the HUD, and owns
// the animation loop.

import {
  createGame,
  start,
  advanceClock,
  shift,
  rotate,
  hardDrop,
  holdPiece,
  setSoftDrop,
  togglePause,
  clearLabel,
} from './game.js';
import { render, resizeCanvas, formatTime } from './renderer.js';
import { attachKeyboard } from './input.js';
import { loadBest, saveBest, isRecord } from './storage.js';
import { INPUT } from './config.js';

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');

const modeEl = document.getElementById('mode');
const scoreStatEl = document.getElementById('score-stat');
const scoreEl = document.getElementById('score');
const timeStatEl = document.getElementById('time-stat');
const timeEl = document.getElementById('time');
const bestEl = document.getElementById('best');
const levelStatEl = document.getElementById('level-stat');
const levelEl = document.getElementById('level');
const linesEl = document.getElementById('lines');
const announcerEl = document.getElementById('announcer');

let state = createGame({ mode: modeEl.value });
let best = loadBest(state.config.mode);
let recorded = false; // whether this round's result has been checked against the best
let layout = resizeCanvas(canvas, ctx, state.config);
let lastFrame = performance.now();

function restart() {
  recordResult(); // a result is kept even if R comes before the next frame
  state = createGame({ mode: modeEl.value });
  best = loadBest(state.config.mode);
  recorded = false;
}

/** Enter: start from the ready screen, or go again once a round is over. */
function confirm() {
  if (state.status === 'ready') start(state);
  else if (state.status === 'over' || state.status === 'won') {
    restart();
    start(state);
  }
}

const keyboard = attachKeyboard({
  onShift: (dx) => shift(state, dx),
  onRotate: (direction) => rotate(state, direction),
  onSoftDrop: (on) => setSoftDrop(state, on),
  onHold: () => holdPiece(state),
  // Space starts the round from the ready screen — it is where the thumb
  // already rests — but never restarts a finished one, where a hard drop
  // mashed in the last moment would skip straight past the result.
  onHardDrop() {
    if (state.status === 'ready') start(state);
    else hardDrop(state);
  },
  onPause: () => togglePause(state),
  // R is instant retry, as in every modern Sprint: straight into the countdown.
  onRestart() {
    restart();
    start(state);
  },
  onConfirm: confirm,
}, INPUT);

// Switching mode mid-round would be ambiguous, so it starts a fresh one. Focus
// goes back to the page, or the arrow keys would keep changing the select.
modeEl.addEventListener('change', () => {
  restart();
  modeEl.blur();
});

// Coming back to a topped-out stack because the tab was in the background is
// miserable.
document.addEventListener('visibilitychange', () => {
  if (document.hidden && state.status === 'running') togglePause(state);
});

// Both the window size and the device pixel ratio decide the mino size.
window.addEventListener('resize', () => {
  layout = resizeCanvas(canvas, ctx, state.config);
});

function recordResult() {
  if (recorded || (state.status !== 'over' && state.status !== 'won')) return;
  recorded = true;
  const sprint = state.config.mode === 'sprint';
  // A Sprint only has a time if it was finished.
  if (sprint && state.status !== 'won') return;
  const result = sprint ? Math.round(state.elapsed) : state.score;
  if (isRecord(state.config.mode, result, best)) {
    best = result;
    saveBest(state.config.mode, best);
  }
}

// Screen readers hear the clears rather than nothing at all.
let announced = null;
function announce() {
  const clear = state.lastClear;
  if (!clear || clear === announced) return;
  announced = clear;
  const parts = [clear.backToBack ? 'Back-to-back' : '', clearLabel(clear).toLowerCase()];
  if (clear.perfect) parts.push('perfect clear');
  announcerEl.textContent = parts.filter(Boolean).join(' ');
}

function updateHud() {
  const sprint = state.config.mode === 'sprint';
  scoreStatEl.hidden = sprint;
  levelStatEl.hidden = sprint;
  timeStatEl.hidden = !sprint;

  if (sprint) {
    timeEl.textContent = formatTime(state.elapsed);
    bestEl.textContent = best ? formatTime(best) : '—';
  } else {
    scoreEl.textContent = state.score.toLocaleString();
    levelEl.textContent = String(state.level);
    bestEl.textContent = best.toLocaleString();
  }
  linesEl.textContent = `${state.lines}/${state.config.lineGoal}`;
}

function frame(now) {
  // Clamping stops a stalled tab from arriving with a huge delta and dropping
  // the piece a dozen rows in one frame.
  const delta = Math.min(now - lastFrame, 250);
  lastFrame = now;

  // Auto-repeat runs during the countdown too, so a direction held through
  // READY is already charged at GO, as in the games this follows.
  keyboard.update(delta);
  advanceClock(state, delta);

  recordResult();
  announce();
  updateHud();
  render(ctx, state, layout, now);
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
