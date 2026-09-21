// Draws a game state onto a 2D canvas context. Read-only with respect to state.

import { COLORS } from './config.js';

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

function drawSnake(ctx, snake, cell) {
  const inset = cell * 0.08;
  const size = cell - inset * 2;
  const radius = cell * 0.25;

  for (let i = snake.length - 1; i >= 0; i -= 1) {
    const seg = snake[i];
    // Body fades slightly toward the tail so the direction of travel reads at a glance.
    ctx.globalAlpha = i === 0 ? 1 : 0.95 - (i / snake.length) * 0.4;
    ctx.fillStyle = i === 0 ? COLORS.snakeHead : COLORS.snake;
    fillCell(ctx, seg.x * cell + inset, seg.y * cell + inset, size, radius);
  }
  ctx.globalAlpha = 1;
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

export function render(ctx, state) {
  const { cols, rows, cell } = state.config;
  const width = cols * cell;
  const height = rows * cell;

  ctx.fillStyle = COLORS.background;
  ctx.fillRect(0, 0, width, height);

  drawGrid(ctx, cols, rows, cell);
  if (state.food) drawFood(ctx, state.food, cell);
  drawSnake(ctx, state.snake, cell);
  drawOverlay(ctx, state, width, height);
}
