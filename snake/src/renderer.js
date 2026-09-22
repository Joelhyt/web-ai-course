// Draws a game state onto a 2D canvas context. Read-only with respect to state.

import { COLORS, POWER_UPS, POWER_UP_TYPES } from './config.js';
import { isEffectActive, effectMs } from './game.js';

/**
 * Sizes the canvas for the display's pixel density. Without this the grid looks
 * soft on HiDPI and 4K monitors, because the backing store would be stretched.
 * setTransform (rather than scale) keeps repeated calls from compounding.
 */
/** The window onto the world, in tiles. The whole grid unless a mode scrolls. */
export function viewSize(config) {
  return {
    cols: config.viewCols ?? config.cols,
    rows: config.viewRows ?? config.rows,
  };
}

export function resizeCanvas(canvas, ctx, config) {
  const dpr = window.devicePixelRatio || 1;
  const view = viewSize(config);
  const cssWidth = view.cols * config.cell;
  const cssHeight = view.rows * config.cell;

  canvas.style.width = `${cssWidth}px`;
  canvas.style.height = `${cssHeight}px`;
  // The surrounding column sizes itself from this, so the HUD and the footer
  // line up with the board instead of the board floating inside a column that
  // the legend text has stretched wider than it.
  canvas.style.setProperty('--board-width', `${cssWidth}px`);
  document.documentElement.style.setProperty('--board-width', `${cssWidth}px`);
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

// ---------------------------------------------------------------------------
// Adventure
// ---------------------------------------------------------------------------

/**
 * A cheap deterministic hash per tile. Rock needs to look like rubble rather
 * than graph paper, and a hash gives every tile a stable shade — no noise
 * texture to ship, and no flicker between frames from a random().
 */
function tileNoise(x, y) {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return n - Math.floor(n);
}

/**
 * The floor is painted light and the rock dark, rather than the other way
 * round: a room has to read as space carved out of the mass at a glance, while
 * the snake is moving through it.
 */
function drawDungeon(ctx, state, cell, bounds) {
  const { cols } = state.config;

  for (let y = bounds.top; y <= bounds.bottom; y += 1) {
    for (let x = bounds.left; x <= bounds.right; x += 1) {
      const shade = tileNoise(x, y);
      const left = x * cell;
      const top = y * cell;

      if (state.blocked.has(y * cols + x)) {
        ctx.fillStyle = shade > 0.62 ? COLORS.rockDeep : COLORS.rock;
        ctx.fillRect(left, top, cell, cell);

        // Only rock with open floor above it gets a lit face, which is what
        // gives the rooms an edge instead of a flat silhouette.
        if (y > 0 && !state.blocked.has((y - 1) * cols + x)) {
          ctx.fillStyle = COLORS.rockEdge;
          ctx.fillRect(left, top, cell, 2);
        }
      } else {
        ctx.fillStyle = shade > 0.7 ? COLORS.floorAlt : COLORS.floor;
        ctx.fillRect(left, top, cell, cell);
      }
    }
  }

  // Flagstone seams, on the floor only. Running the grid across the rock as
  // well is what made the first version read as graph paper with blobs on it.
  ctx.strokeStyle = COLORS.floorGrid;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let y = bounds.top; y <= bounds.bottom; y += 1) {
    for (let x = bounds.left; x <= bounds.right; x += 1) {
      if (state.blocked.has(y * cols + x)) continue;
      if (x + 1 < cols && !state.blocked.has(y * cols + x + 1)) {
        ctx.moveTo((x + 1) * cell + 0.5, y * cell);
        ctx.lineTo((x + 1) * cell + 0.5, (y + 1) * cell);
      }
      if (!state.blocked.has((y + 1) * cols + x)) {
        ctx.moveTo(x * cell, (y + 1) * cell + 0.5);
        ctx.lineTo((x + 1) * cell, (y + 1) * cell + 0.5);
      }
    }
  }
  ctx.stroke();
}

/**
 * Enemies. Every phase they can be in looks different on purpose: a dormant
 * sleeper has to read as scenery you may walk around, a waking one as a threat
 * that has not started yet, and a fading one as a threat that is nearly over.
 */
function drawEnemies(ctx, state, cell, time) {
  for (const enemy of state.enemies) {
    const dormant = enemy.phase === 'dormant';
    const waking = enemy.phase === 'waking';
    const fading = enemy.phase === 'hunting' && enemy.msLeft <= state.config.enemyFadeMs;

    const base = enemy.kind === 'sleeper' ? COLORS.sleeper : COLORS.crawler;
    const color = dormant ? COLORS.sleeperDormant : base;

    ctx.save();
    if (dormant) {
      ctx.globalAlpha = 0.72 + Math.sin(time / 700) * 0.08; // a slow, sleeping breath
    } else if (waking) {
      ctx.globalAlpha = 0.45 + Math.abs(Math.sin(time / 130)) * 0.55; // surfacing
    } else if (fading) {
      ctx.globalAlpha = Math.max(0.12, enemy.msLeft / state.config.enemyFadeMs) * 0.9;
    }

    const inset = cell * 0.14;
    const size = cell - inset * 2;

    for (let i = enemy.body.length - 1; i >= 0; i -= 1) {
      const seg = enemy.body[i];
      const taper = 1 - (i / enemy.body.length) * 0.45;
      const pad = (size * (1 - taper)) / 2;
      ctx.fillStyle = i === 0 && !dormant ? COLORS.crawlerHead : color;
      ctx.beginPath();
      ctx.arc(
        seg.x * cell + cell / 2,
        seg.y * cell + cell / 2,
        (size / 2) * taper + pad * 0,
        0,
        Math.PI * 2,
      );
      ctx.fill();
    }

    const head = enemy.body[0];
    const hx = head.x * cell + cell / 2;
    const hy = head.y * cell + cell / 2;

    if (dormant) {
      // A coil mark, so a sleeping worm reads as asleep rather than as dead.
      ctx.strokeStyle = COLORS.sleeper;
      ctx.globalAlpha *= 0.7;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(hx, hy, cell * 0.22, 0, Math.PI * 1.6);
      ctx.stroke();
    } else {
      ctx.fillStyle = COLORS.background;
      for (const sign of [-1, 1]) {
        ctx.beginPath();
        ctx.arc(hx + sign * cell * 0.13, hy - cell * 0.06, cell * 0.07, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    if (waking) {
      // An expanding ring: the tell that something is about to start moving.
      const pulse = (time % 900) / 900;
      ctx.strokeStyle = base;
      ctx.globalAlpha = (1 - pulse) * 0.7;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(hx, hy, cell * (0.3 + pulse * 0.9), 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }
}

/** Shards: slowly spinning diamonds, the thing a floor is actually about. */
function drawShards(ctx, state, cell, time) {
  for (const shard of state.shards) {
    const cx = shard.x * cell + cell / 2;
    const cy = shard.y * cell + cell / 2;
    const r = cell * (0.34 + Math.sin(time / 320 + shard.x + shard.y) * 0.035);

    ctx.save();
    const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, cell * 0.72);
    glow.addColorStop(0, `${COLORS.shard}55`);
    glow.addColorStop(1, `${COLORS.shard}00`);
    ctx.fillStyle = glow;
    ctx.fillRect(cx - cell, cy - cell, cell * 2, cell * 2);

    // Rotating about the tile centre, undone by the restore below, so the
    // canvas transform the caller set up (devicePixelRatio) survives.
    ctx.translate(cx, cy);
    ctx.rotate(time / 900 + shard.x);

    ctx.fillStyle = COLORS.shard;
    ctx.beginPath();
    ctx.moveTo(0, -r);
    ctx.lineTo(r * 0.62, 0);
    ctx.lineTo(0, r);
    ctx.lineTo(-r * 0.62, 0);
    ctx.closePath();
    ctx.fill();

    // A facet highlight, so the diamond has a front face while it turns.
    ctx.fillStyle = COLORS.title;
    ctx.globalAlpha = 0.5;
    ctx.beginPath();
    ctx.moveTo(0, -r);
    ctx.lineTo(r * 0.62, 0);
    ctx.lineTo(0, 0);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}

/**
 * The way down. Locked it is inert grey; with the last shard taken it turns
 * green and starts pulling its rings inward, which is the only prompt the
 * player gets that the floor is done.
 */
function drawPortal(ctx, state, cell, time) {
  const { portal, portalOpen } = state;
  const cx = portal.x * cell + cell / 2;
  const cy = portal.y * cell + cell / 2;
  const color = portalOpen ? COLORS.portalOpen : COLORS.portalLocked;

  ctx.save();
  if (portalOpen) {
    const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, cell * 1.1);
    glow.addColorStop(0, `${color}55`);
    glow.addColorStop(1, `${color}00`);
    ctx.fillStyle = glow;
    ctx.fillRect(cx - cell * 1.2, cy - cell * 1.2, cell * 2.4, cell * 2.4);
  }

  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  for (let ring = 0; ring < 3; ring += 1) {
    // Open, the rings drift inward; locked, they just sit there.
    const phase = portalOpen ? ((time / 1100 + ring / 3) % 1) : ring / 3;
    const r = cell * (0.12 + (1 - phase) * 0.34);
    ctx.globalAlpha = portalOpen ? 0.35 + phase * 0.5 : 0.5;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
  }

  if (!portalOpen) {
    // A keyhole bar, to say "locked" without a word of UI.
    ctx.globalAlpha = 0.75;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(cx - cell * 0.2, cy);
    ctx.lineTo(cx + cell * 0.2, cy);
    ctx.stroke();
  }
  ctx.restore();
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

/** A cluster of crumbs: Feast. */
function drawFeastGlyph(ctx, cx, cy, r) {
  const offsets = [
    [0, -r * 0.5, r * 0.4],
    [-r * 0.52, r * 0.34, r * 0.36],
    [r * 0.52, r * 0.34, r * 0.36],
  ];
  for (const [dx, dy, radius] of offsets) {
    ctx.beginPath();
    ctx.arc(cx + dx, cy + dy, radius, 0, Math.PI * 2);
    ctx.fill();
  }
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
  const expiring = powerUp.msLeft <= 2000;
  const pulse = 1 + Math.sin(time / 190) * (expiring ? 0.16 : 0.07);
  const alpha = expiring ? 0.45 + Math.abs(Math.sin(time / 140)) * 0.55 : 1;

  ctx.save();
  ctx.globalAlpha = alpha;

  // Halo, so the tile itself reads as charged.
  const halo = ctx.createRadialGradient(cx, cy, cell * 0.1, cx, cy, cell * 0.62);
  halo.addColorStop(0, `${meta.color}66`);
  halo.addColorStop(1, `${meta.color}00`);
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(cx, cy, cell * 0.62, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = meta.color;
  ctx.strokeStyle = meta.color;
  const r = cell * 0.34 * pulse;

  if (powerUp.type === 'slow') drawSlowGlyph(ctx, cx, cy, r);
  else if (powerUp.type === 'ghost') drawGhostGlyph(ctx, cx, cy, r);
  else if (powerUp.type === 'feast') drawFeastGlyph(ctx, cx, cy, r);
  else drawMagnetGlyph(ctx, cx, cy, r, meta.color);

  ctx.restore();
}

/**
 * On-loan food from Feast. Drawn smaller than the real thing and inside a
 * dashed ring — the broken outline is the tell that it is temporary — and it
 * blinks out in step with the effect's last ticks.
 */
function drawBonusFood(ctx, food, cell, msLeft, time) {
  const cx = food.x * cell + cell / 2;
  const cy = food.y * cell + cell / 2;
  const expiring = msLeft <= 2000;

  ctx.save();
  ctx.globalAlpha = expiring ? 0.35 + Math.abs(Math.sin(time / 130)) * 0.65 : 1;
  ctx.fillStyle = COLORS.bonusFood;
  ctx.beginPath();
  ctx.arc(cx, cy, cell * 0.22, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = COLORS.bonusFood;
  ctx.globalAlpha *= 0.75;
  ctx.lineWidth = 1.5;
  ctx.setLineDash([3, 3]);
  ctx.lineDashOffset = time / 90;
  ctx.beginPath();
  ctx.arc(cx, cy, cell * 0.37, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

/** Dotted tethers from every food item to the head while Magnet is pulling. */
function drawMagnetPull(ctx, state, cell) {
  const head = state.snake[0];
  const items = state.food ? [state.food, ...state.bonusFood] : state.bonusFood;
  if (items.length === 0) return;

  ctx.save();
  ctx.strokeStyle = POWER_UPS.magnet.color;
  ctx.globalAlpha = 0.5;
  ctx.lineWidth = 2;
  ctx.setLineDash([3, 5]);
  ctx.beginPath();
  for (const food of items) {
    ctx.moveTo(food.x * cell + cell / 2, food.y * cell + cell / 2);
    ctx.lineTo(head.x * cell + cell / 2, head.y * cell + cell / 2);
  }
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
  // Ghost and Slow already recolour the snake; Feast deliberately does not, so
  // the crumbs stay the thing that changed.
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
    const ms = effectMs(state, type);
    if (ms <= 0) continue;

    ctx.save();
    // Fade the frame out over the last second as an expiry warning.
    ctx.globalAlpha = Math.min(1, ms / 1000) * 0.75;
    ctx.strokeStyle = POWER_UPS[type].color;
    ctx.lineWidth = 3;
    ctx.strokeRect(inset, inset, width - inset * 2, height - inset * 2);
    ctx.restore();
    inset += 5;
  }
}

/**
 * A drain bar across the very top of the board in time attack. The clock also
 * sits in the HUD, but the player's eyes are on the snake, not on the header.
 */
function drawTimeBar(ctx, state, width) {
  if (state.timeLeft === null) return;

  const fraction = state.timeLeft / state.config.timeLimit;
  const urgent = state.timeLeft <= 10_000;

  ctx.save();
  ctx.fillStyle = 'rgba(148, 163, 184, 0.22)';
  ctx.fillRect(0, 0, width, 5);
  ctx.fillStyle = urgent ? COLORS.food : COLORS.snake;
  ctx.fillRect(0, 0, width * fraction, 5);
  ctx.restore();
}

/**
 * The depth announcement on arrival. It fades out over the same window as the
 * landing grace, so the banner *is* the explanation for why the snake is
 * crawling — the moment it clears, you are back at full pace.
 */
function drawArrivalBanner(ctx, state, width, height) {
  if (state.grace <= 0 || state.status !== 'running') return;

  const progress = state.grace / state.config.graceMs;
  ctx.save();
  ctx.globalAlpha = Math.min(1, progress * 1.6);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  ctx.fillStyle = COLORS.title;
  ctx.font = '600 30px system-ui, sans-serif';
  ctx.fillText(`DEPTH ${state.depth}`, width / 2, height / 2 - 12);

  ctx.fillStyle = COLORS.subtitle;
  ctx.font = '13px system-ui, sans-serif';
  ctx.fillText('take a breath — the floor is new', width / 2, height / 2 + 16);
  ctx.restore();
}

function overlayText(state) {
  const timed = state.config.mode === 'time';
  const adventure = state.config.mode === 'adventure';
  switch (state.status) {
    case 'ready':
      if (adventure) {
        return ['THE DESCENT', 'Take every shard to open the way down'];
      }
      return timed
        ? ['TIME ATTACK', `${Math.round(state.config.timeLimit / 1000)} seconds — press Space or an arrow key`]
        : ['SNAKE', 'Press Space or an arrow key to start'];
    case 'paused':
      return ['PAUSED', 'Space or P to resume'];
    case 'over':
      return adventure
        ? ['LOST IN THE DEPTHS', `Depth ${state.depth} · score ${state.score} — Enter or R to dive again`]
        : ['GAME OVER', `Score ${state.score} — Enter or R to play again`];
    case 'timeup':
      return ["TIME'S UP", `Score ${state.score} — Enter or R to play again`];
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

/**
 * Chevrons pinned to the edge of the window, pointing at the shards and the
 * portal while they are off screen. The minimap says where things are on the
 * floor; these say which way to turn without looking away from the snake.
 */
function drawOffscreenMarkers(ctx, state, camera, view, cell) {
  const width = view.cols * cell;
  const height = view.rows * cell;
  const margin = 11;

  const targets = state.shards.map((shard) => ({ cell: shard, color: COLORS.shard }));
  if (state.portal) {
    targets.push({
      cell: state.portal,
      color: state.portalOpen ? COLORS.portalOpen : COLORS.portalLocked,
    });
  }
  // Only enemies that are actually hunting: a chevron for a sleeper you have
  // not woken would be a warning about nothing.
  for (const enemy of state.enemies) {
    if (enemy.phase !== 'hunting') continue;
    targets.push({
      cell: enemy.body[0],
      color: enemy.kind === 'sleeper' ? COLORS.sleeper : COLORS.crawler,
    });
  }

  for (const target of targets) {
    const x = (target.cell.x - camera.x) * cell + cell / 2;
    const y = (target.cell.y - camera.y) * cell + cell / 2;
    if (x >= 0 && y >= 0 && x <= width && y <= height) continue;

    const px = Math.min(Math.max(x, margin), width - margin);
    const py = Math.min(Math.max(y, margin), height - margin);
    const angle = Math.atan2(y - py, x - px);

    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(angle);
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = target.color;
    ctx.beginPath();
    ctx.moveTo(7, 0);
    ctx.lineTo(-4, 5);
    ctx.lineTo(-4, -5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}

/**
 * A corner map of the whole floor. With a world four times the size of the
 * window, the player needs to see the shape of the place they are in — without
 * it, exploring a scrolling dungeon is guesswork.
 */
function drawMinimap(ctx, state, camera, view, cell) {
  const { cols, rows } = state.config;
  const scale = Math.max(1, Math.round(110 / cols));
  const mapW = cols * scale;
  const mapH = rows * scale;
  const pad = 5;
  const left = view.cols * cell - mapW - pad * 2 - 8;
  const top = view.rows * cell - mapH - pad * 2 - 8;

  ctx.save();
  ctx.globalAlpha = 0.86;
  ctx.fillStyle = 'rgba(6, 9, 14, 0.9)';
  ctx.strokeStyle = COLORS.grid;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.rect(left + 0.5, top + 0.5, mapW + pad * 2, mapH + pad * 2);
  ctx.fill();
  ctx.stroke();

  const ox = left + pad;
  const oy = top + pad;

  // Open floor only: drawing the rock as well would just fill the panel in.
  ctx.fillStyle = '#243141';
  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < cols; x += 1) {
      if (state.blocked.has(y * cols + x)) continue;
      ctx.fillRect(ox + x * scale, oy + y * scale, scale, scale);
    }
  }

  const dot = (cellPos, color, size = scale + 1) => {
    ctx.fillStyle = color;
    ctx.fillRect(ox + cellPos.x * scale - (size - scale) / 2, oy + cellPos.y * scale - (size - scale) / 2, size, size);
  };

  for (const enemy of state.enemies) {
    const color = enemy.phase === 'dormant'
      ? COLORS.sleeperDormant
      : (enemy.kind === 'sleeper' ? COLORS.sleeper : COLORS.crawler);
    for (const seg of enemy.body) dot(seg, color, scale);
    dot(enemy.body[0], color, scale + 2);
  }
  for (const shard of state.shards) dot(shard, COLORS.shard, scale + 2);
  if (state.portal) dot(state.portal, state.portalOpen ? COLORS.portalOpen : COLORS.portalLocked, scale + 2);
  for (const seg of state.snake) dot(seg, COLORS.snake, scale);
  dot(state.snake[0], COLORS.title, scale + 2);

  // The window itself, so the map and the board can be read against each other.
  ctx.strokeStyle = 'rgba(226, 232, 240, 0.5)';
  ctx.strokeRect(
    ox + camera.x * scale + 0.5,
    oy + camera.y * scale + 0.5,
    view.cols * scale,
    view.rows * scale,
  );
  ctx.restore();
}

export function render(ctx, state, time = 0, camera = { x: 0, y: 0 }) {
  const { cols, rows, cell } = state.config;
  const view = viewSize(state.config);
  const width = view.cols * cell;
  const height = view.rows * cell;
  const scrolls = view.cols < cols || view.rows < rows;

  ctx.fillStyle = COLORS.background;
  ctx.fillRect(0, 0, width, height);

  // Whole pixels: a camera parked on a fraction of a tile blurs every wall edge
  // and makes the 1px floor seams shimmer as it moves.
  const offsetX = Math.round(camera.x * cell);
  const offsetY = Math.round(camera.y * cell);

  ctx.save();
  ctx.translate(-offsetX, -offsetY);

  const bounds = {
    left: Math.max(0, Math.floor(camera.x) - 1),
    right: Math.min(cols - 1, Math.ceil(camera.x + view.cols) + 1),
    top: Math.max(0, Math.floor(camera.y) - 1),
    bottom: Math.min(rows - 1, Math.ceil(camera.y + view.rows) + 1),
  };

  // Adventure paints its own floor, seams included, so the plain grid would
  // only show through the rock.
  if (state.blocked.size > 0) drawDungeon(ctx, state, cell, bounds);
  else drawGrid(ctx, cols, rows, cell);
  if (state.portal) drawPortal(ctx, state, cell, time);
  drawShards(ctx, state, cell, time);
  if (isEffectActive(state, 'magnet')) drawMagnetPull(ctx, state, cell);
  if (state.powerUp) drawPowerUp(ctx, state.powerUp, cell, time);
  for (const crumb of state.bonusFood) {
    drawBonusFood(ctx, crumb, cell, effectMs(state, 'feast'), time);
  }
  if (state.food) drawFood(ctx, state.food, cell);
  drawEnemies(ctx, state, cell, time);
  drawSnake(ctx, state, cell, time);

  ctx.restore();

  // Everything from here is pinned to the window, not to the world.
  if (scrolls) {
    // Markers first: the minimap is an opaque panel and should cover a chevron
    // that happens to land under it, not the other way round.
    drawOffscreenMarkers(ctx, state, camera, view, cell);
    drawMinimap(ctx, state, camera, view, cell);
  }
  drawEffectFrames(ctx, state, width, height);
  drawTimeBar(ctx, state, width);
  drawArrivalBanner(ctx, state, width, height);
  drawOverlay(ctx, state, width, height);
}
