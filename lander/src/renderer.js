// Draws a game state onto a 2D canvas context. Read-only with respect to state.
// Vector lines throughout, after the arcade's vector monitor.

import { COLORS, LIMITS, TERRAIN, WORLD } from './config.js';
import { groundHeight } from './terrain.js';
import { altitude } from './physics.js';
import { seeded } from './random.js';

/**
 * Picks the largest scale, in pixels per metre, at which the whole canvas and
 * the page around it fit the window.
 */
function fitScale() {
  const byWidth = (Math.min(window.innerWidth, 1000) - 40) / WORLD.width;
  const byHeight = (window.innerHeight - 210) / WORLD.height;
  return Math.max(0.8, Math.min(2, byWidth, byHeight));
}

/**
 * Sizes the canvas for the window and the display's pixel density, and returns
 * the layout to render with. setTransform (rather than scale) keeps repeated
 * calls from compounding.
 */
export function resizeCanvas(canvas, ctx) {
  const scale = fitScale();
  const layout = {
    scale,
    width: Math.round(WORLD.width * scale),
    height: Math.round(WORLD.height * scale),
  };
  const dpr = window.devicePixelRatio || 1;
  canvas.style.width = `${layout.width}px`;
  canvas.style.height = `${layout.height}px`;
  // The page column sizes itself from this, so the HUD lines up with the canvas.
  document.documentElement.style.setProperty('--board-width', `${layout.width}px`);
  canvas.width = Math.round(layout.width * dpr);
  canvas.height = Math.round(layout.height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return layout;
}

// World metres (y up) → canvas pixels (y down).
const sx = (layout, x) => x * layout.scale;
const sy = (layout, y) => (WORLD.height - y) * layout.scale;

// ---------------------------------------------------------------------------
// Scenery
// ---------------------------------------------------------------------------

// A fixed sky: the same stars every time, wherever the ground leaves room.
const STARS = (() => {
  const rng = seeded(42);
  return Array.from({ length: 90 }, () => ({
    x: rng() * WORLD.width,
    y: TERRAIN.minHeight + rng() * (WORLD.height - TERRAIN.minHeight),
    big: rng() < 0.15,
  }));
})();

function drawStars(ctx, state, layout) {
  ctx.fillStyle = COLORS.star;
  for (const star of STARS) {
    if (star.y < groundHeight(state.terrain, star.x) + 4) continue;
    const size = star.big ? 2 : 1;
    ctx.fillRect(Math.round(sx(layout, star.x)), Math.round(sy(layout, star.y)), size, size);
  }
}

function groundPath(ctx, state, layout) {
  const { heights, step } = state.terrain;
  ctx.beginPath();
  heights.forEach((h, i) => {
    if (i === 0) ctx.moveTo(sx(layout, 0), sy(layout, h));
    else ctx.lineTo(sx(layout, i * step), sy(layout, h));
  });
}

function drawTerrain(ctx, state, layout) {
  // The ends meet at one height, so the ground runs on seamlessly across the
  // wrap without any join.
  groundPath(ctx, state, layout);
  ctx.lineTo(layout.width, layout.height);
  ctx.lineTo(0, layout.height);
  ctx.closePath();
  ctx.fillStyle = COLORS.ground;
  ctx.fill();

  groundPath(ctx, state, layout);
  ctx.strokeStyle = COLORS.terrain;
  ctx.lineWidth = 1.5;
  ctx.lineJoin = 'round';
  ctx.stroke();

  // Pads: bright and thick, with their multiplier in the ground beneath.
  ctx.lineCap = 'round';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.font = `700 ${Math.max(11, Math.round(layout.scale * 7))}px system-ui, sans-serif`;
  for (const pad of state.terrain.pads) {
    ctx.strokeStyle = COLORS.pad;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(sx(layout, pad.x0), sy(layout, pad.height));
    ctx.lineTo(sx(layout, pad.x1), sy(layout, pad.height));
    ctx.stroke();
    ctx.fillStyle = COLORS.padLabel;
    ctx.fillText(`${pad.multiplier}×`, sx(layout, (pad.x0 + pad.x1) / 2), sy(layout, pad.height) + 6);
  }
}

// ---------------------------------------------------------------------------
// The lander
// ---------------------------------------------------------------------------

/** A cheap repeatable flicker for the flame, from the wall clock. */
function flicker(now) {
  const n = Math.floor(now / 45);
  const h = Math.sin(n * 12.9898) * 43758.5453;
  return h - Math.floor(h);
}

/** The outline in the lander's own metres, y up: cabin, descent stage, legs, feet, engine. */
function landerPath(ctx) {
  ctx.beginPath();
  // Cabin, an octagon.
  for (let i = 0; i <= 8; i += 1) {
    const a = ((i + 0.5) / 8) * Math.PI * 2;
    const x = Math.cos(a) * 2.9;
    const y = 4.4 + Math.sin(a) * 2.6;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  // Descent stage.
  ctx.rect(-4, -1, 8, 2.6);
  // Legs and feet.
  ctx.moveTo(-3, -1);
  ctx.lineTo(-5, -6);
  ctx.moveTo(-4, 0.6);
  ctx.lineTo(-5, -6);
  ctx.moveTo(3, -1);
  ctx.lineTo(5, -6);
  ctx.moveTo(4, 0.6);
  ctx.lineTo(5, -6);
  ctx.moveTo(-6.2, -6);
  ctx.lineTo(-3.8, -6);
  ctx.moveTo(3.8, -6);
  ctx.lineTo(6.2, -6);
  // Engine bell.
  ctx.moveTo(-1, -1);
  ctx.lineTo(-1.6, -2.4);
  ctx.lineTo(1.6, -2.4);
  ctx.lineTo(1, -1);
}

function drawLanderAt(ctx, lander, layout, x, y, now, showFlame) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate((lander.angle * Math.PI) / 180);
  ctx.scale(layout.scale, -layout.scale);
  ctx.lineWidth = 1.5 / layout.scale;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  if (showFlame) {
    const length = 4 + 3.5 * flicker(now);
    ctx.fillStyle = COLORS.flame;
    ctx.beginPath();
    ctx.moveTo(-1.4, -2.6);
    ctx.lineTo(0, -2.6 - length);
    ctx.lineTo(1.4, -2.6);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = COLORS.flameCore;
    ctx.beginPath();
    ctx.moveTo(-0.7, -2.6);
    ctx.lineTo(0, -2.6 - length * 0.55);
    ctx.lineTo(0.7, -2.6);
    ctx.closePath();
    ctx.fill();
  }

  // Filled in the sky colour first, so stars and ridges do not show through.
  landerPath(ctx);
  ctx.fillStyle = COLORS.space;
  ctx.fill();
  ctx.strokeStyle = COLORS.lander;
  ctx.stroke();
  ctx.restore();
}

/**
 * Draws at the lander's position and a world-width to either side, so near a
 * side it is already half in view at the other.
 */
function eachWrap(lander, layout, draw) {
  for (const shift of [0, -WORLD.width, WORLD.width]) {
    const x = lander.x + shift;
    if (shift && (x < -15 || x > WORLD.width + 15)) continue;
    draw(sx(layout, x), sy(layout, lander.y));
  }
}

function drawLander(ctx, state, layout, now) {
  if (state.status === 'crashed') return;
  const showFlame = state.lander.thrusting && state.status === 'flying';
  eachWrap(state.lander, layout, (x, y) => drawLanderAt(ctx, state.lander, layout, x, y, now, showFlame));
}

// When a crash was first drawn, keyed by its result. Debris flies on the wall
// clock, so it plays out the same however long the result shows.
const firstSeen = new WeakMap();

function drawDebris(ctx, state, layout, now) {
  if (state.status !== 'crashed' || !state.result) return;
  if (!firstSeen.has(state.result)) firstSeen.set(state.result, now);
  const t = (now - firstSeen.get(state.result)) / 1000;
  const fade = Math.max(0, 1 - t / 2);
  if (fade <= 0) return;

  eachWrap(state.lander, layout, (cx, cy) => {
    // A brief flash, then pieces of the outline thrown out and falling back.
    if (t < 0.35) {
      ctx.globalAlpha = 1 - t / 0.35;
      ctx.fillStyle = COLORS.flameCore;
      ctx.beginPath();
      ctx.arc(cx, cy, layout.scale * (4 + 30 * t), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = fade;
    ctx.strokeStyle = COLORS.lander;
    ctx.lineWidth = 1.5;
    const pieces = 10;
    for (let i = 0; i < pieces; i += 1) {
      const a = (i / pieces) * Math.PI * 2 + 0.3;
      const speed = 14 + (i % 3) * 7; // m/s
      const vx = Math.cos(a) * speed;
      const vy = Math.abs(Math.sin(a)) * speed + 6; // thrown up, mostly
      const x = cx + vx * t * layout.scale;
      const y = cy - (vy * t - 0.5 * 9 * t * t) * layout.scale;
      const spin = t * (3 + i);
      const half = layout.scale * (1.5 + (i % 4) * 0.6);
      ctx.beginPath();
      ctx.moveTo(x - Math.cos(spin) * half, y - Math.sin(spin) * half);
      ctx.lineTo(x + Math.cos(spin) * half, y + Math.sin(spin) * half);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  });
}

// ---------------------------------------------------------------------------
// Readouts and overlays
// ---------------------------------------------------------------------------

/** Altitude, speeds and tilt in the top-left corner; each turns green once it is safe to land. */
function drawReadouts(ctx, state, layout, now) {
  const { lander } = state;
  const good = LIMITS.good;
  const rows = [
    ['ALTITUDE', `${Math.max(0, altitude(state.terrain, lander)).toFixed(0)} m`, null],
    [
      'HORIZONTAL',
      `${lander.vx >= 0 ? '→' : '←'} ${Math.abs(lander.vx).toFixed(1)} m/s`,
      Math.abs(lander.vx) <= good.horizontal,
    ],
    [
      'VERTICAL',
      `${lander.vy > 0 ? '↑' : '↓'} ${Math.abs(lander.vy).toFixed(1)} m/s`,
      -lander.vy <= good.vertical,
    ],
    ['TILT', `${Math.abs(lander.angle).toFixed(0)}°`, Math.abs(lander.angle) <= good.tilt],
  ];

  const size = Math.max(10, Math.round(layout.scale * 6));
  ctx.textBaseline = 'top';
  rows.forEach(([label, value, safe], i) => {
    const y = 10 + i * (size + 6);
    ctx.font = `600 ${size - 1}px system-ui, sans-serif`;
    ctx.textAlign = 'left';
    ctx.fillStyle = COLORS.label;
    ctx.fillText(label, 10, y);
    ctx.font = `600 ${size}px ui-monospace, "SF Mono", Menlo, monospace`;
    ctx.fillStyle = safe === null ? COLORS.unsafe : safe ? COLORS.safe : COLORS.unsafe;
    ctx.fillText(value, 10 + size * 7.2, y);
  });

  // Fuel warnings, top right.
  if (state.status !== 'flying' && state.status !== 'paused') return;
  let warning = null;
  if (state.fuel <= 0) warning = 'OUT OF FUEL';
  else if (state.fuel < 150 && Math.floor(now / 400) % 2 === 0) warning = 'LOW FUEL';
  if (warning) {
    ctx.font = `700 ${size}px system-ui, sans-serif`;
    ctx.textAlign = 'right';
    ctx.fillStyle = COLORS.warning;
    ctx.fillText(warning, layout.width - 10, 10);
  }
}

function roundedRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  if (typeof ctx.roundRect === 'function') ctx.roundRect(x, y, w, h, r);
  else ctx.rect(x, y, w, h);
}

const OUTCOME_TITLES = {
  good: ['THE EAGLE HAS LANDED', COLORS.good],
  hard: ['HARD LANDING', COLORS.hard],
  crash: ['CRASHED', COLORS.crash],
};

/** [title, colour, subtitle, hint] for the panel, or null for none. */
function overlayText(state) {
  switch (state.status) {
    case 'ready':
      return ['LUNAR LANDER', COLORS.title, 'Land gently on a pad. The narrow ones score more.', 'Space or Enter to start'];
    case 'paused':
      return ['PAUSED', COLORS.title, 'P or Esc to resume', null];
    case 'landed':
    case 'crashed': {
      const { outcome, points, multiplier, fuelChange } = state.result;
      const [title, color] = OUTCOME_TITLES[outcome];
      const parts = [`+${points} points`];
      if (multiplier) parts.push(`${multiplier}× pad`);
      if (fuelChange > 0) parts.push(`+${fuelChange} fuel`);
      if (fuelChange < 0) parts.push(`−${-fuelChange} fuel`);
      return [title, color, parts.join(' · '), null];
    }
    case 'over':
      return [
        'OUT OF FUEL',
        COLORS.crash,
        `Score ${state.score.toLocaleString()} · ${state.landings} landed in ${state.round} rounds`,
        'Enter or R to play again',
      ];
    default:
      return null;
  }
}

function drawOverlay(ctx, state, layout) {
  const text = overlayText(state);
  if (!text) return;
  const [title, color, subtitle, hint] = text;
  const cx = layout.width / 2;
  // In the sky, above where the landing happens.
  const cy = layout.height * 0.3;
  const w = Math.min(layout.width - 40, 440);
  const h = hint ? 112 : 84;

  ctx.fillStyle = COLORS.overlay;
  roundedRect(ctx, cx - w / 2, cy - h / 2, w, h, 10);
  ctx.fill();

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const top = cy - h / 2;
  ctx.fillStyle = color;
  ctx.font = '800 24px system-ui, sans-serif';
  ctx.fillText(title, cx, top + 30, w - 20);
  ctx.fillStyle = COLORS.title;
  ctx.font = '600 13px system-ui, sans-serif';
  ctx.fillText(subtitle, cx, top + 60, w - 20);
  if (hint) {
    ctx.fillStyle = COLORS.subtitle;
    ctx.font = '13px system-ui, sans-serif';
    ctx.fillText(hint, cx, top + 88, w - 20);
  }
}

// ---------------------------------------------------------------------------

export function render(ctx, state, layout, now) {
  ctx.fillStyle = COLORS.space;
  ctx.fillRect(0, 0, layout.width, layout.height);
  drawStars(ctx, state, layout);
  drawTerrain(ctx, state, layout);
  drawLander(ctx, state, layout, now);
  drawDebris(ctx, state, layout, now);
  drawReadouts(ctx, state, layout, now);
  drawOverlay(ctx, state, layout);
}
