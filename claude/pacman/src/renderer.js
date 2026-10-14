// Draws a game state onto a 2D canvas context. Read-only with respect to state.
// Everything is drawn with paths, so there are no sprite images to load and it
// stays sharp at any size.

import { COLORS, levelSpec } from './config.js';
import { FRUIT_SPOT, HOUSE, WIDTH, HEIGHT, wallSegments } from './maze.js';
import { deathMs, frightFlashing } from './game.js';

// Rows of space under the maze, for the lives and the level's fruit.
const FOOTER_ROWS = 2;

function computeLayout(cell) {
  return {
    cell,
    mazeWidth: WIDTH * cell,
    mazeHeight: HEIGHT * cell,
    width: WIDTH * cell,
    height: (HEIGHT + FOOTER_ROWS) * cell,
  };
}

/**
 * Picks the largest tile size, up to config.cell, at which the whole canvas and
 * the page around it fit the window. Sizing in whole pixels here, rather than
 * shrinking the canvas with CSS, keeps the walls crisp.
 */
function fitCell(config) {
  const byHeight = (window.innerHeight - 210) / (HEIGHT + FOOTER_ROWS);
  const byWidth = (Math.min(window.innerWidth, 900) - 40) / WIDTH;
  return Math.max(9, Math.min(config.cell, Math.floor(Math.min(byHeight, byWidth))));
}

/**
 * Sizes the canvas for the window and the display's pixel density, and returns
 * the layout to render with. setTransform (rather than scale) keeps repeated
 * calls from compounding.
 */
export function resizeCanvas(canvas, ctx, config) {
  const layout = computeLayout(fitCell(config));
  const dpr = window.devicePixelRatio || 1;
  canvas.style.width = `${layout.width}px`;
  canvas.style.height = `${layout.height}px`;
  // The page column sizes itself from this, so the HUD lines up with the maze.
  document.documentElement.style.setProperty('--board-width', `${layout.width}px`);
  canvas.width = Math.round(layout.width * dpr);
  canvas.height = Math.round(layout.height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return layout;
}

// Tile coordinates → canvas pixels, at the centre of the tile.
const px = (layout, v) => (v + 0.5) * layout.cell;

const DIR_ANGLE = { right: 0, down: Math.PI / 2, left: Math.PI, up: -Math.PI / 2 };

// ---------------------------------------------------------------------------
// Maze
// ---------------------------------------------------------------------------

// The walls never change, only the dots do, so their segments are worked out
// once per maze layout.
let wallCache = { template: null, segments: [] };

function segmentsFor(maze) {
  if (wallCache.template !== maze.template) {
    wallCache = { template: maze.template, segments: wallSegments(maze) };
  }
  return wallCache.segments;
}

function wallPath(ctx, maze, layout) {
  ctx.beginPath();
  for (const [x1, y1, x2, y2] of segmentsFor(maze)) {
    ctx.moveTo(px(layout, x1), px(layout, y1));
    ctx.lineTo(px(layout, x2), px(layout, y2));
  }
}

function drawWalls(ctx, state, layout) {
  const { cell } = layout;
  let color = COLORS.wall;
  // A cleared maze stands for a moment, then flashes.
  if (state.status === 'cleared' && state.timer > state.config.clearMs * 0.35) {
    if (Math.floor(state.timer / 220) % 2 === 0) color = COLORS.wallFlash;
  }

  // A wide stroke, then a narrower one in the background colour down its
  // middle, leaves the arcade's double outline around every block.
  const band = cell * 0.5;
  const line = Math.max(1.5, cell * 0.1);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  wallPath(ctx, state.maze, layout);
  ctx.strokeStyle = color;
  ctx.lineWidth = band;
  ctx.stroke();
  ctx.strokeStyle = COLORS.maze;
  ctx.lineWidth = band - 2 * line;
  ctx.stroke();

  // The door: a bar across the two door tiles, between the house walls.
  ctx.fillStyle = COLORS.door;
  const doorY = px(layout, 12) - cell * 0.1;
  ctx.fillRect(px(layout, 12.25), doorY, cell * 2.5, cell * 0.2);
}

function drawDots(ctx, state, layout, now) {
  const { cell } = layout;
  // Energizers blink while the game is on, and stay lit when it is not.
  const blinkOff = state.status === 'running' && Math.floor(now / 230) % 2 === 1;
  ctx.fillStyle = COLORS.dot;
  state.maze.dots.forEach((row, y) => {
    row.forEach((value, x) => {
      if (value === 1) {
        const size = Math.max(2, Math.round(cell * 0.22));
        ctx.fillRect(Math.round(px(layout, x) - size / 2), Math.round(px(layout, y) - size / 2), size, size);
      } else if (value === 2 && !blinkOff) {
        ctx.beginPath();
        ctx.arc(px(layout, x), px(layout, y), cell * 0.42, 0, Math.PI * 2);
        ctx.fill();
      }
    });
  });
}

// ---------------------------------------------------------------------------
// Characters
// ---------------------------------------------------------------------------

function drawPacShape(ctx, cx, cy, r, angle, open) {
  ctx.fillStyle = COLORS.pac;
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.arc(cx, cy, r, angle + open, angle + Math.PI * 2 - open);
  ctx.closePath();
  ctx.fill();
}

/** Mouth half-angle from how far he has walked, so he only chomps while moving. */
function chomp(pac) {
  const phase = (pac.travel * 2.2) % 1;
  return Math.PI * (0.02 + 0.24 * (1 - Math.abs(2 * phase - 1)));
}

function ghostColor(state, ghost) {
  if (!ghost.frightened) return COLORS[ghost.name];
  return frightFlashing(state) ? COLORS.flash : COLORS.frightened;
}

function drawGhostShape(ctx, ghost, cx, cy, r, state, now) {
  const showBody = ghost.state !== 'eyes' && ghost.state !== 'entering';
  if (showBody) {
    // A dome, straight sides and a skirt that ripples as the ghost moves.
    const top = cy - r * 0.1;
    const bottom = cy + r * 0.9;
    const ripple = Math.floor(now / 140) % 2;
    ctx.fillStyle = ghostColor(state, ghost);
    ctx.beginPath();
    ctx.arc(cx, top, r, Math.PI, 0);
    ctx.lineTo(cx + r, bottom);
    const points = 6;
    for (let i = 1; i <= points; i += 1) {
      const x = cx + r - (2 * r * i) / points;
      const up = (i + ripple) % 2 === 1;
      ctx.lineTo(x, up ? bottom - r * 0.32 : bottom);
    }
    ctx.closePath();
    ctx.fill();
  }

  if (ghost.frightened && showBody) {
    // The frightened face: two dots and a wobbly mouth.
    const face = frightFlashing(state) ? COLORS.flashFace : COLORS.frightenedFace;
    ctx.fillStyle = face;
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(cx + side * r * 0.35, cy - r * 0.2, r * 0.14, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.strokeStyle = face;
    ctx.lineWidth = Math.max(1, r * 0.1);
    ctx.beginPath();
    for (let i = 0; i <= 6; i += 1) {
      const x = cx - r * 0.6 + (r * 1.2 * i) / 6;
      const y = cy + r * 0.38 + (i % 2 ? -r * 0.12 : 0);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    return;
  }

  // Eyes look the way the ghost is going.
  const look = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[ghost.dir] ?? [0, 0];
  for (const side of [-1, 1]) {
    const ex = cx + side * r * 0.36 + look[0] * r * 0.08;
    const ey = cy - r * 0.18 + look[1] * r * 0.08;
    ctx.fillStyle = COLORS.eyeWhite;
    ctx.beginPath();
    ctx.ellipse(ex, ey, r * 0.27, r * 0.33, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = COLORS.pupil;
    ctx.beginPath();
    ctx.arc(ex + look[0] * r * 0.13, ey + look[1] * r * 0.15, r * 0.14, 0, Math.PI * 2);
    ctx.fill();
  }
}

/**
 * Draws something at an actor's position, and again a maze-width to either
 * side, all clipped to the maze. Whatever is half out of one side of the tunnel
 * is then already half in at the other.
 */
function drawWrapped(ctx, layout, x, y, draw) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, layout.mazeWidth, layout.mazeHeight);
  ctx.clip();
  for (const shift of [0, -WIDTH, WIDTH]) {
    const sx = x + shift;
    if (shift && (sx < -1.5 || sx > WIDTH + 0.5)) continue;
    draw(px(layout, sx), px(layout, y));
  }
  ctx.restore();
}

function drawPoints(ctx, layout, x, y, points, color) {
  ctx.fillStyle = color;
  ctx.font = `700 ${Math.round(layout.cell * 0.75)}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(points), px(layout, x), px(layout, y));
}

function drawGhosts(ctx, state, layout, now) {
  const r = layout.cell * 0.78;
  // Eyes go under the others, as they do in the arcade.
  const order = [...state.ghosts].sort((a, b) => (b.state === 'eyes') - (a.state === 'eyes'));
  for (const ghost of order) {
    if (state.freeze && state.freeze.ghost === ghost.name) {
      // The ghost just eaten shows its points in its place.
      drawPoints(ctx, layout, ghost.x, ghost.y, state.freeze.points, COLORS.ghostPoints);
      continue;
    }
    drawWrapped(ctx, layout, ghost.x, ghost.y, (cx, cy) => drawGhostShape(ctx, ghost, cx, cy, r, state, now));
  }
}

function drawPac(ctx, state, layout) {
  const pac = state.pac;
  const r = layout.cell * 0.78;
  if (state.status === 'dying') {
    // He faces up and folds away to nothing.
    const t = (state.timer - state.config.deathFreezeMs) / state.config.deathAnimMs;
    if (t < 0) {
      drawWrapped(ctx, layout, pac.x, pac.y, (cx, cy) => drawPacShape(ctx, cx, cy, r, DIR_ANGLE[pac.dir], chomp(pac)));
    } else if (t < 1) {
      const open = Math.PI * (0.05 + 0.95 * t);
      drawWrapped(ctx, layout, pac.x, pac.y, (cx, cy) => drawPacShape(ctx, cx, cy, r, DIR_ANGLE.up, open));
    }
    return;
  }
  drawWrapped(ctx, layout, pac.x, pac.y, (cx, cy) => drawPacShape(ctx, cx, cy, r, DIR_ANGLE[pac.dir], chomp(pac)));
}

// ---------------------------------------------------------------------------
// Fruit
// ---------------------------------------------------------------------------

function circle(ctx, x, y, r, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

/** One of the eight bonus symbols, about 2r across, centred on (cx, cy). */
export function drawFruit(ctx, name, cx, cy, r) {
  ctx.lineCap = 'round';
  switch (name) {
    case 'cherries':
      ctx.strokeStyle = '#a16207';
      ctx.lineWidth = Math.max(1, r * 0.12);
      ctx.beginPath();
      ctx.moveTo(cx - r * 0.45, cy + r * 0.3);
      ctx.quadraticCurveTo(cx, cy - r * 0.3, cx + r * 0.55, cy - r * 0.8);
      ctx.moveTo(cx + r * 0.35, cy + r * 0.45);
      ctx.quadraticCurveTo(cx + r * 0.3, cy - r * 0.2, cx + r * 0.55, cy - r * 0.8);
      ctx.stroke();
      circle(ctx, cx - r * 0.45, cy + r * 0.4, r * 0.4, '#ef4444');
      circle(ctx, cx + r * 0.35, cy + r * 0.55, r * 0.4, '#ef4444');
      circle(ctx, cx - r * 0.55, cy + r * 0.3, r * 0.1, '#fecaca');
      circle(ctx, cx + r * 0.25, cy + r * 0.45, r * 0.1, '#fecaca');
      break;
    case 'strawberry':
      ctx.fillStyle = '#ef4444';
      ctx.beginPath();
      ctx.moveTo(cx, cy + r * 0.95);
      ctx.bezierCurveTo(cx - r * 1.1, cy + r * 0.1, cx - r * 0.8, cy - r * 0.6, cx, cy - r * 0.45);
      ctx.bezierCurveTo(cx + r * 0.8, cy - r * 0.6, cx + r * 1.1, cy + r * 0.1, cx, cy + r * 0.95);
      ctx.fill();
      ctx.fillStyle = '#22c55e';
      ctx.fillRect(cx - r * 0.45, cy - r * 0.7, r * 0.9, r * 0.25);
      ctx.fillRect(cx - r * 0.08, cy - r * 0.9, r * 0.16, r * 0.3);
      for (const [dx, dy] of [[-0.35, -0.1], [0.3, -0.15], [0, 0.15], [-0.2, 0.45], [0.25, 0.4]]) {
        circle(ctx, cx + dx * r, cy + dy * r, r * 0.07, '#fef3c7');
      }
      break;
    case 'orange':
      circle(ctx, cx, cy + r * 0.15, r * 0.75, '#fb923c');
      ctx.fillStyle = '#22c55e';
      ctx.beginPath();
      ctx.ellipse(cx + r * 0.3, cy - r * 0.62, r * 0.35, r * 0.15, -0.4, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 'apple':
      ctx.fillStyle = '#dc2626';
      ctx.beginPath();
      ctx.ellipse(cx, cy + r * 0.15, r * 0.8, r * 0.7, 0, 0, Math.PI * 2);
      ctx.fill();
      circle(ctx, cx - r * 0.35, cy - r * 0.05, r * 0.15, '#fecaca');
      ctx.strokeStyle = '#a16207';
      ctx.lineWidth = Math.max(1, r * 0.12);
      ctx.beginPath();
      ctx.moveTo(cx, cy - r * 0.45);
      ctx.lineTo(cx + r * 0.1, cy - r * 0.9);
      ctx.stroke();
      ctx.fillStyle = '#22c55e';
      ctx.beginPath();
      ctx.ellipse(cx + r * 0.38, cy - r * 0.72, r * 0.28, r * 0.12, -0.5, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 'melon':
      circle(ctx, cx, cy + r * 0.1, r * 0.8, '#4ade80');
      ctx.strokeStyle = '#166534';
      ctx.lineWidth = Math.max(1, r * 0.1);
      ctx.beginPath();
      for (const dx of [-0.4, 0, 0.4]) {
        ctx.moveTo(cx + dx * r, cy - r * 0.6);
        ctx.quadraticCurveTo(cx + dx * r * 1.6, cy + r * 0.1, cx + dx * r, cy + r * 0.8);
      }
      ctx.stroke();
      break;
    case 'galaxian':
      ctx.fillStyle = '#3b82f6';
      ctx.beginPath();
      ctx.moveTo(cx - r, cy - r * 0.4);
      ctx.lineTo(cx, cy + r * 0.3);
      ctx.lineTo(cx + r, cy - r * 0.4);
      ctx.lineTo(cx + r * 0.8, cy + r * 0.2);
      ctx.lineTo(cx, cy + r * 0.95);
      ctx.lineTo(cx - r * 0.8, cy + r * 0.2);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#facc15';
      ctx.beginPath();
      ctx.moveTo(cx, cy - r * 0.6);
      ctx.lineTo(cx + r * 0.35, cy + r * 0.5);
      ctx.lineTo(cx - r * 0.35, cy + r * 0.5);
      ctx.closePath();
      ctx.fill();
      circle(ctx, cx, cy - r * 0.75, r * 0.18, '#ef4444');
      break;
    case 'bell':
      ctx.fillStyle = '#facc15';
      ctx.beginPath();
      ctx.moveTo(cx - r * 0.85, cy + r * 0.55);
      ctx.quadraticCurveTo(cx - r * 0.6, cy + r * 0.3, cx - r * 0.6, cy - r * 0.2);
      ctx.arc(cx, cy - r * 0.2, r * 0.6, Math.PI, 0);
      ctx.quadraticCurveTo(cx + r * 0.6, cy + r * 0.3, cx + r * 0.85, cy + r * 0.55);
      ctx.closePath();
      ctx.fill();
      circle(ctx, cx, cy + r * 0.7, r * 0.2, '#e2e8f0');
      break;
    case 'key':
      ctx.strokeStyle = '#22d3ee';
      ctx.lineWidth = Math.max(1.5, r * 0.22);
      ctx.beginPath();
      ctx.arc(cx, cy - r * 0.5, r * 0.35, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = '#e2e8f0';
      ctx.lineWidth = Math.max(1, r * 0.16);
      ctx.beginPath();
      ctx.moveTo(cx, cy - r * 0.15);
      ctx.lineTo(cx, cy + r * 0.95);
      ctx.moveTo(cx, cy + r * 0.5);
      ctx.lineTo(cx + r * 0.3, cy + r * 0.5);
      ctx.moveTo(cx, cy + r * 0.8);
      ctx.lineTo(cx + r * 0.3, cy + r * 0.8);
      ctx.stroke();
      break;
    default:
  }
}

function drawFruitAndPopups(ctx, state, layout) {
  if (state.fruit) {
    drawFruit(ctx, state.fruit.name, px(layout, FRUIT_SPOT.x), px(layout, FRUIT_SPOT.y), layout.cell * 0.8);
  }
  for (const popup of state.popups) {
    drawPoints(ctx, layout, popup.x, popup.y, popup.points, COLORS.fruitPoints);
  }
}

// ---------------------------------------------------------------------------
// Footer, texts and overlays
// ---------------------------------------------------------------------------

function drawFooter(ctx, state, layout) {
  const { cell } = layout;
  const y = layout.mazeHeight + cell;
  // Lives in reserve: the one being played is on the board.
  const reserve = Math.max(0, state.lives - (state.status === 'over' ? 0 : 1));
  for (let i = 0; i < Math.min(reserve, 6); i += 1) {
    drawPacShape(ctx, cell * (1.5 + i * 2), y, cell * 0.7, DIR_ANGLE.left, Math.PI * 0.22);
  }
  // The fruit of this level and up to six before it, newest on the right.
  const first = Math.max(1, state.level - 6);
  for (let level = state.level; level >= first; level -= 1) {
    const slot = state.level - level;
    drawFruit(ctx, levelSpec(level).fruit.name, layout.width - cell * (1.5 + slot * 2), y, cell * 0.75);
  }
}

function roundedRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  if (typeof ctx.roundRect === 'function') ctx.roundRect(x, y, w, h, r);
  else ctx.rect(x, y, w, h);
}

/** Text in the gap below the house, where the arcade writes READY! and GAME OVER. */
function drawMazeText(ctx, layout, text, color) {
  ctx.fillStyle = color;
  ctx.font = `700 ${Math.round(layout.cell * 1.05)}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, layout.mazeWidth / 2, px(layout, FRUIT_SPOT.y));
}

function overlayText(state) {
  switch (state.status) {
    case 'ready':
      return ['PAC-MAN', 'Clear the maze. Energizers turn the tables.', 'Enter or Space to start'];
    case 'paused':
      return ['PAUSED', 'P or Esc to resume', null];
    case 'over':
      return ['GAME OVER', `Score ${state.score.toLocaleString()} · level ${state.level}`, 'Enter or R to play again'];
    default:
      return null;
  }
}

function drawOverlay(ctx, state, layout) {
  const text = overlayText(state);
  if (!text) return;
  const [title, subtitle, hint] = text;
  const { cell, mazeWidth } = layout;
  const cx = mazeWidth / 2;
  // Over the house, where the panel hides the least of the maze that matters.
  const cy = px(layout, HOUSE.centreY);
  const w = Math.min(mazeWidth - cell * 2, cell * 22);
  const h = cell * 7.5;

  ctx.fillStyle = COLORS.overlay;
  roundedRect(ctx, cx - w / 2, cy - h / 2, w, h, 10);
  ctx.fill();

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = state.status === 'over' ? COLORS.gameOver : COLORS.pac;
  ctx.font = `800 ${Math.round(cell * 1.6)}px system-ui, sans-serif`;
  ctx.fillText(title, cx, cy - cell * 1.8, w - 16);
  if (subtitle) {
    ctx.fillStyle = COLORS.title;
    ctx.font = `600 ${Math.max(11, Math.round(cell * 0.7))}px system-ui, sans-serif`;
    ctx.fillText(subtitle, cx, cy + cell * 0.4, w - 16);
  }
  if (hint) {
    ctx.fillStyle = COLORS.subtitle;
    ctx.font = `${Math.max(11, Math.round(cell * 0.65))}px system-ui, sans-serif`;
    ctx.fillText(hint, cx, cy + cell * 2.2, w - 16);
  }
}

// ---------------------------------------------------------------------------

/** What is on the board in each phase, as the arcade shows it. */
function visible(state) {
  const { status, timer, config } = state;
  switch (status) {
    case 'dying':
      return { pac: timer < deathMs(config) - config.deathPauseMs, ghosts: timer < config.deathFreezeMs };
    case 'cleared':
      return { pac: true, ghosts: timer < config.clearMs * 0.35 };
    case 'over':
      return { pac: false, ghosts: false };
    default:
      // While an eaten ghost's points show, Pac-Man is hidden behind them.
      return { pac: !state.freeze, ghosts: true };
  }
}

export function render(ctx, state, layout, now) {
  ctx.fillStyle = COLORS.maze;
  ctx.fillRect(0, 0, layout.width, layout.height);
  drawWalls(ctx, state, layout);
  drawDots(ctx, state, layout, now);
  drawFruitAndPopups(ctx, state, layout);

  const show = visible(state);
  if (show.ghosts) drawGhosts(ctx, state, layout, now);
  if (show.pac) drawPac(ctx, state, layout);

  if (state.status === 'countdown') drawMazeText(ctx, layout, 'READY!', COLORS.ready);
  drawFooter(ctx, state, layout);
  drawOverlay(ctx, state, layout);
}
