// Draws a game state onto a 2D canvas context. Read-only with respect to state.

import { COLORS, POWER_UPS, POWER_UP_TYPES } from './config.js';
import { isEffectActive, effectTicks } from './game.js';

/**
 * Sizes the canvas for the display's pixel density. Without this the grid looks
 * soft on HiDPI and 4K monitors, because the backing store would be stretched.
 * setTransform (rather than scale) keeps repeated calls from compounding.
 */
export function resizeCanvas(canvas, ctx, config) {
  const dpr = window.devicePixelRatio || 1;
  const cssWidth = config.cols * config.cell;
  const cssHeight = config.rows * config.cell;

  canvas.style.width = `${cssWidth}px`;
  canvas.style.height = `${cssHeight}px`;
  canvas.width = Math.round(cssWidth * dpr);
  canvas.height = Math.round(cssHeight * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

// roundRect is available in current Chrome, Firefox and Safari, but falling back
// keeps the game playable on slightly older builds instead of throwing.
function fillCell(ctx, x, y, size, radius) {
  if (typeof ctx.roundRect === 'function') {
    ctx.beginPath();
    ctx.roundRect(x, y, size, size, radius);
    ctx.fill();
  } else {
    ctx.fillRect(x, y, size, size);
  }
}

function drawGrid(ctx, cols, rows, cell) {
  ctx.strokeStyle = COLORS.grid;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let c = 1; c < cols; c += 1) {
    // The half-pixel offset keeps 1px lines from straddling two device pixels.
    ctx.moveTo(c * cell + 0.5, 0);
    ctx.lineTo(c * cell + 0.5, rows * cell);
  }
  for (let r = 1; r < rows; r += 1) {
    ctx.moveTo(0, r * cell + 0.5);
    ctx.lineTo(cols * cell, r * cell + 0.5);
  }
  ctx.stroke();
}

function drawFood(ctx, food, cell) {
  const cx = food.x * cell + cell / 2;
  const cy = food.y * cell + cell / 2;
  ctx.fillStyle = COLORS.food;
  ctx.beginPath();
  ctx.arc(cx, cy, cell * 0.32, 0, Math.PI * 2);
  ctx.fill();
}

// ---------------------------------------------------------------------------
// Power-ups
//
// Each collectible gets its own silhouette rather than a recoloured dot: colour
// alone would be unreadable for the ~8% of players with a colour vision
// deficiency, and the shapes read instantly at 24px.
// ---------------------------------------------------------------------------

/** Hourglass: Slow. */
function drawSlowGlyph(ctx, cx, cy, r) {
  ctx.beginPath();
  ctx.moveTo(cx - r, cy - r);
  ctx.lineTo(cx + r, cy - r);
  ctx.lineTo(cx - r * 0.12, cy);
  ctx.lineTo(cx + r, cy + r);
  ctx.lineTo(cx - r, cy + r);
  ctx.lineTo(cx + r * 0.12, cy);
  ctx.closePath();
  ctx.fill();
}

/** Ghost: domed head, scalloped hem, two eyes knocked out of it. */
function drawGhostGlyph(ctx, cx, cy, r) {
  ctx.beginPath();
  ctx.arc(cx, cy - r * 0.15, r * 0.85, Math.PI, 0);
  ctx.lineTo(cx + r * 0.85, cy + r * 0.5);
  for (let i = 0; i < 3; i += 1) {
    const from = cx + r * 0.85 - (i * r * 0.567);
    ctx.quadraticCurveTo(from - r * 0.14, cy + r, from - r * 0.567, cy + r * 0.5);
  }
  ctx.closePath();
  ctx.fill();

  ctx.save();
  ctx.globalCompositeOperation = 'destination-out';
  for (const sign of [-1, 1]) {
    ctx.beginPath();
    ctx.arc(cx + sign * r * 0.33, cy - r * 0.2, r * 0.17, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** Horseshoe magnet: a thick arc with two legs. */
function drawMagnetGlyph(ctx, cx, cy, r, color) {
  const width = r * 0.42;
  ctx.lineWidth = width;
  ctx.strokeStyle = color;
  ctx.lineCap = 'butt';
  ctx.beginPath();
  ctx.arc(cx, cy + r * 0.05, r * 0.62, Math.PI, 0);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(cx - r * 0.62, cy + r * 0.05);
  ctx.lineTo(cx - r * 0.62, cy + r * 0.62);
  ctx.moveTo(cx + r * 0.62, cy + r * 0.05);
  ctx.lineTo(cx + r * 0.62, cy + r * 0.62);
  ctx.stroke();

  // Pole tips, so it reads as a magnet rather than an arch.
  ctx.fillStyle = COLORS.title;
  ctx.fillRect(cx - r * 0.62 - width / 2, cy + r * 0.45, width, r * 0.2);
  ctx.fillRect(cx + r * 0.62 - width / 2, cy + r * 0.45, width, r * 0.2);
}

function drawPowerUp(ctx, powerUp, cell, time) {
  const meta = POWER_UPS[powerUp.type];
  const cx = powerUp.x * cell + cell / 2;
  const cy = powerUp.y * cell + cell / 2;

  // A slow pulse says "collectible"; the last couple of seconds blink, which is
  // the only warning the player gets that it is about to vanish.
  const expiring = powerUp.ticksLeft <= 14;
  const pulse = 1 + Math.sin(time / 190) * (expiring ? 0.16 : 0.07);
  const alpha = expiring ? 0.45 + Math.abs(Math.sin(time / 140)) * 0.55 : 1;

  ctx.save();
  ctx.globalAlpha = alpha;

  // Halo, so the tile itself reads as charged.
  const halo = ctx.createRadialGradient(cx, cy, cell * 0.1, cx, cy, cell * 0.62);
  halo.addColorStop(0, `${meta.color}55`);
  halo.addColorStop(1, `${meta.color}00`);
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(cx, cy, cell * 0.62, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = meta.color;
  ctx.strokeStyle = meta.color;
  const r = cell * 0.3 * pulse;

  if (powerUp.type === 'slow') drawSlowGlyph(ctx, cx, cy, r);
  else if (powerUp.type === 'ghost') drawGhostGlyph(ctx, cx, cy, r);
  else drawMagnetGlyph(ctx, cx, cy, r, meta.color);

  ctx.restore();
}

/** Dotted tether from the food to the head while Magnet is pulling. */
function drawMagnetPull(ctx, state, cell) {
  const head = state.snake[0];
  const { food } = state;
  ctx.save();
  ctx.strokeStyle = POWER_UPS.magnet.color;
  ctx.globalAlpha = 0.5;
  ctx.lineWidth = 2;
  ctx.setLineDash([3, 5]);
  ctx.beginPath();
  ctx.moveTo(food.x * cell + cell / 2, food.y * cell + cell / 2);
  ctx.lineTo(head.x * cell + cell / 2, head.y * cell + cell / 2);
  ctx.stroke();
  ctx.restore();
}

function drawSnake(ctx, state, cell, time) {
  const { snake } = state;
  const ghost = isEffectActive(state, 'ghost');
  const slow = isEffectActive(state, 'slow');
  const inset = cell * 0.08;
  const size = cell - inset * 2;
  const radius = cell * 0.25;

  const bodyColor = ghost ? POWER_UPS.ghost.color : slow ? POWER_UPS.slow.color : COLORS.snake;
  const headColor = ghost || slow ? COLORS.title : COLORS.snakeHead;

  ctx.save();
  for (let i = snake.length - 1; i >= 0; i -= 1) {
    const seg = snake[i];
    // Body fades slightly toward the tail so the direction of travel reads at a glance.
    const base = i === 0 ? 1 : 0.95 - (i / snake.length) * 0.4;
    // Ghost mode makes the snake visibly insubstantial — that transparency *is*
    // the rule: this is exactly when it may overlap itself.
    ctx.globalAlpha = ghost ? base * 0.42 : base;
    ctx.fillStyle = i === 0 ? headColor : bodyColor;
    fillCell(ctx, seg.x * cell + inset, seg.y * cell + inset, size, radius);
  }

  if (ghost) {
    ctx.globalAlpha = 0.85;
    ctx.strokeStyle = POWER_UPS.ghost.color;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 3]);
    ctx.lineDashOffset = -time / 60;
    for (const seg of snake) {
      ctx.beginPath();
      if (typeof ctx.roundRect === 'function') {
        ctx.roundRect(seg.x * cell + inset, seg.y * cell + inset, size, size, radius);
      } else {
        ctx.rect(seg.x * cell + inset, seg.y * cell + inset, size, size);
      }
      ctx.stroke();
    }
  }
  ctx.restore();
}

/** One inset frame per running effect, so the board itself shows what is on. */
function drawEffectFrames(ctx, state, width, height) {
  let inset = 1.5;
  for (const type of POWER_UP_TYPES) {
    const ticks = effectTicks(state, type);
    if (ticks <= 0) continue;

    ctx.save();
    // Fade the frame out over the final ticks as an expiry warning.
    ctx.globalAlpha = Math.min(1, ticks / 12) * 0.75;
    ctx.strokeStyle = POWER_UPS[type].color;
    ctx.lineWidth = 3;
    ctx.strokeRect(inset, inset, width - inset * 2, height - inset * 2);
    ctx.restore();
    inset += 5;
  }
}

function overlayText(state) {
  switch (state.status) {
    case 'ready':
      return ['SNAKE', 'Press Space or an arrow key to start'];
    case 'paused':
      return ['PAUSED', 'Space or P to resume'];
    case 'over':
      return ['GAME OVER', `Score ${state.score} — Enter or R to play again`];
    case 'won':
      return ['BOARD CLEARED', `Perfect score ${state.score} — Enter or R to play again`];
    default:
      return null;
  }
}

function drawOverlay(ctx, state, width, height) {
  const lines = overlayText(state);
  if (!lines) return;

  ctx.fillStyle = COLORS.overlay;
  ctx.fillRect(0, 0, width, height);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  ctx.fillStyle = COLORS.title;
  ctx.font = '600 34px system-ui, sans-serif';
  ctx.fillText(lines[0], width / 2, height / 2 - 16);

  ctx.fillStyle = COLORS.subtitle;
  ctx.font = '15px system-ui, sans-serif';
  ctx.fillText(lines[1], width / 2, height / 2 + 22);
}

export function render(ctx, state, time = 0) {
  const { cols, rows, cell } = state.config;
  const width = cols * cell;
  const height = rows * cell;

  ctx.fillStyle = COLORS.background;
  ctx.fillRect(0, 0, width, height);

  drawGrid(ctx, cols, rows, cell);
  if (state.food && isEffectActive(state, 'magnet')) drawMagnetPull(ctx, state, cell);
  if (state.powerUp) drawPowerUp(ctx, state.powerUp, cell, time);
  if (state.food) drawFood(ctx, state.food, cell);
  drawSnake(ctx, state, cell, time);
  drawEffectFrames(ctx, state, width, height);
  drawOverlay(ctx, state, width, height);
}
