// The rules of Lunar Lander as a pure state machine. No DOM, no canvas, no
// storage and no clock of its own: time arrives as an explicit delta in
// advanceClock, and randomness (the terrain and where each round starts)
// through the rng passed to createGame, so every rule can be run from Node.

import { FEET, FUEL, ROUND, SCORING, TICK_MS, WORLD } from './config.js';
import { generateTerrain } from './terrain.js';
import { contact, judge, landerPoints, stepLander, wrapLander } from './physics.js';

/** A new game, waiting on `start`. `settings` overrides ROUND and the starting fuel. */
export function createGame(settings = {}, rng = Math.random) {
  const config = Object.freeze({ ...ROUND, fuel: FUEL.start, ...settings });
  const state = {
    config,
    rng,
    status: 'ready', // ready → flying ⇄ paused → landed | crashed → flying … → over
    round: 1,
    score: 0,
    fuel: config.fuel, // the game's lives: it ends when a round finishes with none left
    landings: 0,
    controls: { left: false, right: false, thrust: false },
    timer: 0, // ms the current outcome has been showing
    acc: 0, // ms not yet simulated, less than one tick
    result: null, // the last touchdown: { outcome, points, multiplier, fuelChange }
    lastEvent: null, // the latest thing worth announcing: { text }
  };
  startRound(state);
  return state;
}

/** New terrain, and the lander high up near one side, drifting toward the other. */
function startRound(state) {
  const { rng, config } = state;
  state.terrain = generateTerrain(rng, state.round);
  const fromLeft = rng() < 0.5;
  const [slow, fast] = config.startDrift;
  const drift = slow + rng() * (fast - slow);
  state.lander = {
    x: fromLeft ? config.startInset : WORLD.width - config.startInset,
    y: config.startAltitude,
    vx: fromLeft ? drift : -drift,
    vy: 0,
    angle: 0,
    thrusting: false,
  };
  state.result = null;
  state.timer = 0;
  state.acc = 0;
}

export function start(state) {
  if (state.status === 'ready') state.status = 'flying';
}

export function togglePause(state) {
  if (state.status === 'flying') state.status = 'paused';
  else if (state.status === 'paused') state.status = 'flying';
}

/** The keys held right now: { left, right, thrust }. */
export function setControls(state, controls) {
  Object.assign(state.controls, controls);
}

const MESSAGES = {
  good: 'Landed',
  hard: 'Hard landing',
  crash: 'Crashed',
};

function touchdown(state, touch) {
  const { lander } = state;
  const { outcome, pad } = judge(state.terrain, lander, touch);
  lander.thrusting = false;

  let points;
  let fuelChange;
  if (outcome === 'good') {
    points = SCORING.good * pad.multiplier + Math.floor(state.fuel / SCORING.fuelPerPoint);
    fuelChange = FUEL.landingBonus;
    state.landings += 1;
  } else if (outcome === 'hard') {
    points = SCORING.hard * pad.multiplier;
    fuelChange = 0;
    state.landings += 1;
  } else {
    points = SCORING.crash;
    fuelChange = -Math.min(state.fuel, FUEL.crashPenalty);
  }

  if (pad) {
    // Settle onto the pad: the step that touched may have put a foot slightly
    // into it.
    const feet = landerPoints(lander).slice(0, FEET);
    lander.y += pad.height - Math.min(...feet.map((p) => p.y));
    lander.vx = 0;
    lander.vy = 0;
  }

  state.score += points;
  state.fuel += fuelChange;
  state.status = outcome === 'crash' ? 'crashed' : 'landed';
  state.timer = 0;
  state.result = { outcome, points, multiplier: pad?.multiplier ?? null, fuelChange };
  const where = pad ? ` on the ${pad.multiplier}× pad` : '';
  state.lastEvent = { text: `${MESSAGES[outcome]}${where}, ${points} points` };
}

/** One 1/60 s step of flight. */
function tick(state) {
  const { lander } = state;
  const before = { ...lander };
  const burnt = stepLander(lander, state.controls, state.fuel, TICK_MS / 1000);
  state.fuel = Math.max(0, state.fuel - burnt);
  // Contact is checked on the unwrapped path, so a lander crossing the seam
  // does not appear to sweep the whole world in one step.
  const touch = contact(state.terrain, before, lander);
  if (touch) touchdown(state, touch);
  wrapLander(lander);
}

/**
 * Advances everything measured in real time. Flight runs in fixed 1/60 s
 * ticks; the outcome screen runs on the raw delta. Pausing is simply not
 * calling this.
 */
export function advanceClock(state, dt) {
  if (state.status === 'flying') {
    state.acc += dt;
    while (state.acc >= TICK_MS && state.status === 'flying') {
      state.acc -= TICK_MS;
      tick(state);
    }
    return;
  }
  if (state.status !== 'landed' && state.status !== 'crashed') return;

  state.timer += dt;
  if (state.timer < state.config.resultMs) return;
  if (state.fuel <= 0) {
    state.status = 'over';
    state.lastEvent = { text: `Out of fuel. Game over, ${state.score} points` };
    return;
  }
  state.round += 1;
  startRound(state);
  state.status = 'flying';
}
