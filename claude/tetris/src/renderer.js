// Draws a game state onto a 2D canvas context. Read-only with respect to state.

import { COLORS } from './config.js';
import { SHAPES } from './pieces.js';
import { activeCells, ghostY, hiddenRows, lockProgress } from './game.js';

// The side panels, in cells. Wide enough for a flat I in the preview with a
// little air on either side. They start at the top of the canvas, level with
// the buffer strip above the well, so that strip is not a band of dead space.
const SIDE = 4.4;
const GAP = 0.7;

/**
 * Where everything sits on the canvas for a given mino size: the hold panel on
 * the left, the well in the middle with a strip of buffer rows above it, the
 * next queue on the right.
 */
function computeLayout(config, cell) {
  const side = SIDE * cell;
  const gap = GAP * cell;
  const boardX = Math.round(side + gap);
  const boardY = config.bufferShown * cell;
  const boardWidth = config.cols * cell;
  const boardHeight = config.visibleRows * cell;
  return {
    cell,
    side,
    boardX,
    boardY,
    boardWidth,
    boardHeight,
    rightX: boardX + boardWidth + gap,
    width: Math.round(boardX + boardWidth + gap + side),
    // Two pixels of room for the well's outline below the last row.
    height: boardY + boardHeight + 2,
  };
}

/**
 * Picks the largest mino size, up to config.cell, at which the whole canvas and
 * the page around it fit the window. Sizing in whole pixels here, rather than
 * shrinking the canvas with CSS, keeps every mino edge sharp.
 */
function fitCell(config) {
  const rowsShown = config.visibleRows + config.bufferShown;
  const byHeight = (window.innerHeight - 250) / rowsShown;
  const byWidth = (Math.min(window.innerWidth, 900) - 40) / (config.cols + 2 * (SIDE + GAP));
  return Math.max(14, Math.min(config.cell, Math.floor(Math.min(byHeight, byWidth))));
}

/**
 * Sizes the canvas for the window and the display's pixel density, and returns
 * the layout to render with. setTransform (rather than scale) keeps repeated
 * calls from compounding.
 */
export function resizeCanvas(canvas, ctx, config) {
  const layout = computeLayout(config, fitCell(config));
  const dpr = window.devicePixelRatio || 1;
  canvas.style.width = `${layout.width}px`;
  canvas.style.height = `${layout.height}px`;
  // The page column sizes itself from this, so the HUD lines up with the board.
  document.documentElement.style.setProperty('--board-width', `${layout.width}px`);
  canvas.width = Math.round(layout.width * dpr);
  canvas.height = Math.round(layout.height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return layout;
}

/** m:ss.cc — Sprint times are compared to the hundredth. */
export function formatTime(ms) {
  const total = Math.max(0, Math.floor(ms / 10));
  const centis = total % 100;
  const seconds = Math.floor(total / 100) % 60;
  const minutes = Math.floor(total / 6000);
  return `${minutes}:${String(seconds).padStart(2, '0')}.${String(centis).padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

// roundRect is available in current Chrome, Firefox and Safari, but falling back
// keeps the game playable on slightly older builds instead of throwing.
function roundedRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  if (typeof ctx.roundRect === 'function') ctx.roundRect(x, y, w, h, r);
  else ctx.rect(x, y, w, h);
}

function drawMino(ctx, x, y, size, color, alpha = 1) {
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  roundedRect(ctx, x + 1, y + 1, size - 2, size - 2, Math.max(2, size * 0.14));
  ctx.fill();
  // A soft gleam along the top edge, so a stack of one colour still reads as
  // separate minos rather than a flat slab.
  ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
  ctx.fillRect(x + 3, y + 3, size - 6, Math.max(2, size * 0.13));
  ctx.globalAlpha = 1;
}

function drawGhostMino(ctx, x, y, size, color) {
  ctx.globalAlpha = 0.14;
  ctx.fillStyle = color;
  ctx.fillRect(x + 1, y + 1, size - 2, size - 2);
  ctx.globalAlpha = 0.55;
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  roundedRect(ctx, x + 1.75, y + 1.75, size - 3.5, size - 3.5, Math.max(2, size * 0.14));
  ctx.stroke();
  ctx.globalAlpha = 1;
}

/** A piece in its spawn orientation, centred in a box. For hold and next. */
function drawPreview(ctx, type, cx, cy, size, color) {
  const cells = SHAPES[type].rotations[0];
  const xs = cells.map((c) => c.x);
  const ys = cells.map((c) => c.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const width = (Math.max(...xs) - minX + 1) * size;
  const height = (Math.max(...ys) - minY + 1) * size;
  const left = Math.round(cx - width / 2);
  const top = Math.round(cy - height / 2);
  for (const c of cells) {
    drawMino(ctx, left + (c.x - minX) * size, top + (c.y - minY) * size, size, color);
  }
}

function drawLabel(ctx, text, x, y, align = 'left') {
  ctx.fillStyle = COLORS.label;
  ctx.font = '600 11px system-ui, sans-serif';
  ctx.textAlign = align;
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(text, x, y);
}

// ---------------------------------------------------------------------------
// Board
// ---------------------------------------------------------------------------

function drawWell(ctx, config, layout) {
  const { boardX, boardY, boardWidth, boardHeight, cell } = layout;
  ctx.fillStyle = COLORS.well;
  roundedRect(ctx, boardX - 1, boardY - 1, boardWidth + 2, boardHeight + 2, 6);
  ctx.fill();

  ctx.strokeStyle = COLORS.grid;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let c = 1; c < config.cols; c += 1) {
    // The half-pixel offset keeps 1px lines from straddling two device pixels.
    ctx.moveTo(boardX + c * cell + 0.5, boardY);
    ctx.lineTo(boardX + c * cell + 0.5, boardY + boardHeight);
  }
  for (let r = 1; r < config.visibleRows; r += 1) {
    ctx.moveTo(boardX, boardY + r * cell + 0.5);
    ctx.lineTo(boardX + boardWidth, boardY + r * cell + 0.5);
  }
  ctx.stroke();

  ctx.strokeStyle = COLORS.wellEdge;
  roundedRect(ctx, boardX - 1.5, boardY - 1.5, boardWidth + 3, boardHeight + 3, 6);
  ctx.stroke();
}

// Board row → canvas y. Rows above the buffer strip come out negative and are
// skipped by the callers.
function rowY(state, layout, row) {
  const firstShown = hiddenRows(state.config) - state.config.bufferShown;
  return (row - firstShown) * layout.cell;
}

function drawStack(ctx, state, layout) {
  const { cell, boardX } = layout;
  state.board.forEach((row, y) => {
    const top = rowY(state, layout, y);
    if (top < 0) return;
    row.forEach((type, x) => {
      if (type) drawMino(ctx, boardX + x * cell, top, cell, COLORS[type]);
    });
  });
}

// When a clear was first drawn, keyed by the clear itself. Popups and flashes
// run on the wall clock rather than the game's, so they still fade after the
// line that ends a round, when the game clock has stopped.
const firstSeen = new WeakMap();

function clearAge(clear, now) {
  if (!firstSeen.has(clear)) firstSeen.set(clear, now);
  return now - firstSeen.get(clear);
}

function drawClearFlash(ctx, state, layout, now) {
  const clear = state.lastClear;
  if (!clear || !clear.rows.length) return;
  const age = clearAge(clear, now);
  const duration = 240;
  if (age >= duration) return;
  ctx.globalAlpha = 0.75 * (1 - age / duration);
  ctx.fillStyle = COLORS.flash;
  for (const row of clear.rows) {
    const top = rowY(state, layout, row);
    if (top >= 0) ctx.fillRect(layout.boardX, top, layout.boardWidth, layout.cell);
  }
  ctx.globalAlpha = 1;
}

function drawActive(ctx, state, layout) {
  if (!state.active || state.status === 'ready' || state.status === 'countdown') return;
  const { cell, boardX } = layout;
  const color = COLORS[state.active.type];

  if (state.status === 'running' || state.status === 'paused') {
    const ghost = { ...state.active, y: ghostY(state) };
    for (const { x, y } of activeCells(state, ghost)) {
      const top = rowY(state, layout, y);
      if (top >= 0) drawGhostMino(ctx, boardX + x * cell, top, cell, color);
    }
  }

  // The piece dims as its lock delay runs out, so you can see how long is left
  // to slide it without watching a number.
  const alpha = 1 - 0.4 * lockProgress(state);
  for (const { x, y } of activeCells(state)) {
    const top = rowY(state, layout, y);
    if (top >= 0) drawMino(ctx, boardX + x * cell, top, cell, color, alpha);
  }
}

// ---------------------------------------------------------------------------
// Side panels
// ---------------------------------------------------------------------------

function drawHold(ctx, state, layout) {
  const { cell, side } = layout;
  drawLabel(ctx, 'HOLD', 2, 11);
  const boxY = 20;
  const boxH = cell * 2.8;
  ctx.fillStyle = COLORS.well;
  roundedRect(ctx, 0, boxY, side, boxH, 8);
  ctx.fill();
  if (state.hold) {
    const color = state.holdUsed ? COLORS.held : COLORS[state.hold];
    drawPreview(ctx, state.hold, side / 2, boxY + boxH / 2, Math.round(cell * 0.78), color);
  }
}

function drawNext(ctx, state, layout) {
  const { cell, side, rightX } = layout;
  drawLabel(ctx, 'NEXT', rightX + 2, 11);
  const boxY = 20;
  const slot = cell * 2.6;
  const count = state.config.previewCount;
  ctx.fillStyle = COLORS.well;
  roundedRect(ctx, rightX, boxY, side, slot * count + cell * 0.4, 8);
  ctx.fill();
  state.queue.slice(0, count).forEach((type, i) => {
    // The piece coming next is drawn larger than the ones behind it.
    const size = Math.round(cell * (i === 0 ? 0.78 : 0.62));
    drawPreview(ctx, type, rightX + side / 2, boxY + cell * 0.2 + slot * (i + 0.5), size, COLORS[type]);
  });
}

/** The name of the last clear, beside the board, fading out. */
function drawClearPopup(ctx, state, layout, now) {
  const clear = state.lastClear;
  if (!clear) return;
  const age = clearAge(clear, now);
  const duration = 1600;
  if (age >= duration) return;

  const lines = [];
  if (clear.backToBack) lines.push(['BACK-TO-BACK', COLORS.O]);
  if (clear.tspin) lines.push([clear.tspin === 'mini' ? 'T-SPIN MINI' : 'T-SPIN', COLORS.T]);
  const names = ['', 'SINGLE', 'DOUBLE', 'TRIPLE', 'TETRIS'];
  if (clear.lines) lines.push([names[clear.lines], clear.lines === 4 ? COLORS.I : COLORS.title]);
  if (clear.combo > 0) lines.push([`${clear.combo} COMBO`, COLORS.S]);
  if (clear.perfect) lines.push(['PERFECT CLEAR', COLORS.L]);
  if (!lines.length) return;

  // Hold for most of the time, then fade; rise a few pixels as it goes.
  const fade = Math.min(1, Math.max(0, (duration - age) / 400));
  const rise = (age / duration) * 6;
  const size = Math.max(11, Math.min(15, Math.round(layout.cell * 0.55)));
  let y = 20 + layout.cell * 2.8 + layout.cell * 1.4 - rise;

  ctx.globalAlpha = fade;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  for (const [text, color] of lines) {
    ctx.font = `700 ${size}px system-ui, sans-serif`;
    ctx.fillStyle = color;
    ctx.fillText(text, 2, y, layout.side);
    y += size + 6;
  }
  ctx.font = `600 ${size - 2}px system-ui, sans-serif`;
  ctx.fillStyle = COLORS.subtitle;
  ctx.fillText(`+${clear.points}`, 2, y, layout.side);
  ctx.globalAlpha = 1;
}

// ---------------------------------------------------------------------------
// Overlay
// ---------------------------------------------------------------------------

function overlayText(state) {
  const { mode, lineGoal } = state.config;
  const sprint = mode === 'sprint';
  switch (state.status) {
    case 'ready':
      return sprint
        ? ['SPRINT', `Clear ${lineGoal} lines as fast as you can`, 'Space or Enter to start']
        : ['MARATHON', `${lineGoal} lines, faster every ten`, 'Space or Enter to start'];
    case 'countdown':
      return state.countdown > 500 ? ['READY', null, null] : ['GO!', null, null];
    case 'paused':
      return ['PAUSED', 'P or Esc to resume', null];
    case 'over':
      return sprint
        ? ['TOP OUT', `${state.lines}/${lineGoal} lines`, 'Enter or R to retry']
        : ['TOP OUT', `Score ${state.score.toLocaleString()}`, 'Enter or R to play again'];
    case 'won':
      return sprint
        ? ['FINISHED', formatTime(state.elapsed), 'Enter or R to go again']
        : ['COMPLETE', `Score ${state.score.toLocaleString()}`, 'Enter or R to play again'];
    default:
      return null;
  }
}

function drawOverlay(ctx, state, layout) {
  const text = overlayText(state);
  if (!text) return;
  const [title, subtitle, hint] = text;
  const { boardX, boardY, boardWidth, boardHeight } = layout;
  const cx = boardX + boardWidth / 2;
  const cy = boardY + boardHeight / 2;

  // Paused covers the stack completely: a pause should not be free thinking
  // time on the next placement.
  ctx.fillStyle = state.status === 'paused' ? COLORS.well : COLORS.overlay;
  roundedRect(ctx, boardX - 1, boardY - 1, boardWidth + 2, boardHeight + 2, 6);
  ctx.fill();

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const countdown = state.status === 'countdown';
  ctx.fillStyle = countdown && title === 'GO!' ? COLORS.S : COLORS.title;
  ctx.font = `700 ${countdown ? 40 : 30}px system-ui, sans-serif`;
  ctx.fillText(title, cx, cy - (subtitle ? 22 : 0), boardWidth - 16);

  if (subtitle) {
    ctx.fillStyle = state.status === 'won' ? COLORS.accent : COLORS.title;
    ctx.font = `600 ${state.status === 'won' && state.config.mode === 'sprint' ? 24 : 15}px system-ui, sans-serif`;
    ctx.fillText(subtitle, cx, cy + 14, boardWidth - 16);
  }
  if (hint) {
    ctx.fillStyle = COLORS.subtitle;
    ctx.font = '13px system-ui, sans-serif';
    ctx.fillText(hint, cx, cy + 44, boardWidth - 16);
  }
}

// ---------------------------------------------------------------------------

export function render(ctx, state, layout, now) {
  ctx.clearRect(0, 0, layout.width, layout.height);
  drawWell(ctx, state.config, layout);
  drawStack(ctx, state, layout);
  drawClearFlash(ctx, state, layout, now);
  drawActive(ctx, state, layout);
  drawHold(ctx, state, layout);
  drawNext(ctx, state, layout);
  drawClearPopup(ctx, state, layout, now);
  drawOverlay(ctx, state, layout);
}
