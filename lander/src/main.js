// Wires the pure game rules to the canvas, the keyboard and the HUD, and owns
// the animation loop.

import { createGame, start, advanceClock, setControls, togglePause } from './game.js';
import { render, resizeCanvas } from './renderer.js';
import { createCamera, updateCamera } from './camera.js';
import { attachKeyboard } from './input.js';
import { loadBest, saveBest } from './storage.js';
import { FUEL, LIMITS } from './config.js';

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');

const scoreEl = document.getElementById('score');
const bestEl = document.getElementById('best');
const fuelStatEl = document.getElementById('fuel-stat');
const fuelEl = document.getElementById('fuel');
const roundEl = document.getElementById('round');
const announcerEl = document.getElementById('announcer');

const { good } = LIMITS;
document.getElementById('rules').textContent =
  `Touch down on a pad slower than ${good.vertical} m/s down and ${good.horizontal} m/s across, ` +
  `within ${good.tilt}° of upright. Fuel is your lives: a crash costs ${FUEL.crashPenalty}, ` +
  `a clean landing gives ${FUEL.landingBonus} back.`;

let state = createGame();
let best = loadBest();
let layout = resizeCanvas(canvas, ctx);
// Zooms in near the ground. Presentation only: the rules never see it.
const camera = createCamera();
let lastFrame = performance.now();

/**
 * Keeps the best score. Called every frame and on restart, so points scored in
 * a game abandoned with R still count. Storage is written when the score can
 * no longer grow, not on every point.
 */
function recordResult() {
  if (state.score > best) best = state.score;
  if (state.status === 'over' && best > loadBest()) saveBest(best);
}

function restart() {
  recordResult();
  if (best > loadBest()) saveBest(best);
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

const keyboard = attachKeyboard({
  // Space starts from the ready screen, but never restarts a finished game,
  // where a burn held to the end would skip straight past the result.
  onStart() {
    if (state.status === 'ready') start(state);
  },
  onPause: () => togglePause(state),
  onRestart() {
    restart();
    start(state);
  },
  onConfirm: confirm,
});

// Coming back to a crater because the tab was in the background is miserable.
document.addEventListener('visibilitychange', () => {
  if (document.hidden && state.status === 'flying') togglePause(state);
});

// A best scored in a game still in progress is not lost to a closed tab.
window.addEventListener('pagehide', () => {
  if (best > loadBest()) saveBest(best);
});

window.addEventListener('resize', () => {
  layout = resizeCanvas(canvas, ctx);
});

// Screen readers hear each outcome, rather than nothing at all.
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
  fuelEl.textContent = Math.ceil(state.fuel).toLocaleString();
  fuelStatEl.classList.toggle('low', state.fuel < 150);
  roundEl.textContent = String(state.round);
}

function frame(now) {
  // Clamping stops a stalled tab from arriving with a huge delta and running
  // seconds of flight in one frame.
  const delta = Math.min(now - lastFrame, 250);
  lastFrame = now;

  setControls(state, keyboard.held);
  advanceClock(state, delta);
  recordResult();
  announce();
  updateHud();
  updateCamera(camera, state, delta);
  render(ctx, state, layout, now, camera);
  requestAnimationFrame(frame);
}

// Draw the ready screen at once rather than waiting on the first frame.
updateHud();
updateCamera(camera, state, 0);
render(ctx, state, layout, lastFrame, camera);
requestAnimationFrame(frame);
