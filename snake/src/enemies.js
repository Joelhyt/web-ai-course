// Adventure's enemies. Pure like the rest of the rules: state in, state out,
// an explicit millisecond delta, and an injectable rng.
//
// Two of them, and every rule below exists to keep them fair:
//
//   crawler — surfaces somewhere on the floor and hunts you down. It announces
//     itself before it moves, is always slower than you are, and expires.
//   sleeper — already coiled on the floor when you arrive, visible and asleep.
//     It only wakes if you come close, hunts for a shorter burst, then fades.
//
// What a worm does when it reaches you is the whole design. It *bites*: the
// tail behind the bite is severed, the worm stops to feed on it, and you are
// briefly untouchable. Only a head-on meeting costs a life. Killing on contact
// anywhere was unsurvivable, and for a structural reason rather than a numeric
// one — a long snake is a long hitbox, the worm paths to your head and so
// travels alongside your body, and being slower than you buys nothing when
// every segment you are dragging is lethal to touch.
//
// The three guarantees that make them fair rather than frustrating:
//
//   1. Nothing ever moves faster than the snake. Their pace is a multiple of
//      the snake's *current* interval, so it holds whether you are racing at
//      depth 20 or crawling under a Slow.
//   2. Nothing appears next to you or attacks the moment it appears. Crawlers
//      surface at least `enemySpawnDistance` tiles away and spend a motionless
//      moment surfacing; sleepers are on the map before you enter the room.
//   3. Nothing is permanent. Every hunt has a timer, and the last seconds of it
//      are spent visibly fading out.

const manhattan = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
const same = (a, b) => a.x === b.x && a.y === b.y;

/** Milliseconds between one enemy move. Always slower than the snake's. */
export function enemyInterval(state, interval) {
  return interval * state.config.enemySpeedFactor;
}

export function enemyCells(state) {
  return state.enemies.flatMap((enemy) => enemy.body);
}

/**
 * True when a cell is inside an enemy that can actually hurt you — which means
 * one that is hunting. A sleeper is scenery until it wakes, and a worm that is
 * still surfacing is a warning, not yet a threat: dashing past one in the
 * moment it announces itself is meant to work.
 */
export function enemyHits(state, cell) {
  return state.enemies.some(
    (enemy) => enemy.phase === 'hunting' && enemy.body.some((seg) => same(seg, cell)),
  );
}

/**
 * The bite. Everything behind the segment the worm's head landed on is severed
 * — never taking the snake below `minSnakeLength`, so a bite near the head is
 * survivable rather than fatal by another name — and the worm stops to feed on
 * what it took, which is the window you use to get clear.
 *
 * The severed segments are handed back as scraps: purely decorative, but a new
 * rule has to be legible in the moment it fires, and watching your own tail
 * dissolve says what happened better than any HUD counter.
 */
function bite(state, enemy, index) {
  const keep = Math.max(state.config.minSnakeLength, index);
  const severed = state.snake.slice(keep);
  state.snake = state.snake.slice(0, keep);

  for (const seg of severed) {
    state.scraps.push({ x: seg.x, y: seg.y, msLeft: state.config.scrapFadeMs });
  }

  // Anything still owed to a snake that just lost its tail is forfeit.
  state.growth = 0;
  state.invulnerable = state.config.biteImmunityMs;

  enemy.phase = 'feeding';
  enemy.phaseMs = state.config.enemyFeedMs;
  return severed.length;
}

function blockedFor(state, enemy) {
  const taken = new Set();
  const { cols } = state.config;
  for (const other of state.enemies) {
    if (other === enemy) continue;
    for (const seg of other.body) taken.add(seg.y * cols + seg.x);
  }
  // Its own body too, minus the tail it is about to vacate — the same rule the
  // player plays by.
  for (const seg of enemy.body.slice(0, -1)) taken.add(seg.y * cols + seg.x);
  return taken;
}

/**
 * One step of a breadth-first search from the enemy's head toward the snake,
 * through open floor only. Full pathfinding rather than a greedy step: a
 * greedy chaser gets wedged on the first wall between it and you, which reads
 * as a broken enemy rather than a beatable one.
 *
 * The search is capped by `limit` so a hunt across a large floor stays cheap.
 */
export function stepToward(state, enemy, target, limit = 900) {
  const { cols, rows } = state.config;
  const head = enemy.body[0];
  if (same(head, target)) return null;

  const taken = blockedFor(state, enemy);
  const start = head.y * cols + head.x;
  const cameFrom = new Map([[start, null]]);
  const queue = [head];
  let visited = 0;

  while (queue.length > 0 && visited < limit) {
    const cell = queue.shift();
    visited += 1;

    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const next = { x: cell.x + dx, y: cell.y + dy };
      if (next.x < 0 || next.y < 0 || next.x >= cols || next.y >= rows) continue;

      const index = next.y * cols + next.x;
      if (cameFrom.has(index)) continue;
      if (state.blocked.has(index)) continue;
      // The target square itself is never "blocked": catching the snake is the
      // whole point, and refusing to enter it would make an enemy harmless.
      if (taken.has(index) && !same(next, target)) continue;

      cameFrom.set(index, cell);
      if (same(next, target)) {
        // Walk the chain back to the first step out of the enemy's head.
        let step = next;
        let parent = cameFrom.get(step.y * cols + step.x);
        while (parent && !same(parent, head)) {
          step = parent;
          parent = cameFrom.get(step.y * cols + step.x);
        }
        return step;
      }
      queue.push(next);
    }
  }
  return null;
}

function moveEnemy(state, enemy) {
  const target = state.snake[0];
  const step = stepToward(state, enemy, target);
  if (!step) return;

  enemy.body.unshift(step);
  enemy.body.pop();
}

/** Where a crawler may surface: open floor, far enough away, and clear. */
export function crawlerSpot(state, rng) {
  const { cols, rows, enemySpawnDistance } = state.config;
  const head = state.snake[0];
  const occupied = new Set([
    ...state.snake.map((seg) => seg.y * cols + seg.x),
    ...enemyCells(state).map((seg) => seg.y * cols + seg.x),
  ]);

  const candidates = [];
  for (let i = 0; i < cols * rows; i += 1) {
    if (state.blocked.has(i) || occupied.has(i)) continue;
    const cell = { x: i % cols, y: Math.floor(i / cols) };
    if (manhattan(cell, head) < enemySpawnDistance) continue;
    candidates.push(cell);
  }
  if (candidates.length === 0) return null;
  return candidates[Math.min(candidates.length - 1, Math.floor(rng() * candidates.length))];
}

/**
 * A worm body laid out from a head cell, trailing through whatever open tiles
 * it can find. A body that overlaps rock would look like it is swimming through
 * the walls it is supposed to respect.
 */
function layBody(state, head, length) {
  const { cols, rows } = state.config;
  const body = [head];
  let cell = head;

  while (body.length < length) {
    const options = [[1, 0], [-1, 0], [0, 1], [0, -1]]
      .map(([dx, dy]) => ({ x: cell.x + dx, y: cell.y + dy }))
      .filter((next) => next.x >= 0 && next.y >= 0 && next.x < cols && next.y < rows)
      .filter((next) => !state.blocked.has(next.y * cols + next.x))
      .filter((next) => !body.some((seg) => same(seg, next)));

    if (options.length === 0) break;
    cell = options[0];
    body.push(cell);
  }
  return body;
}

export function spawnCrawler(state, rng = Math.random) {
  const spot = crawlerSpot(state, rng);
  if (!spot) return null;

  return {
    kind: 'crawler',
    body: layBody(state, spot, state.config.enemyLength),
    phase: 'waking',
    phaseMs: state.config.enemyWakeMs,
    msLeft: state.config.enemyLifetime,
    accumulator: 0,
  };
}

/**
 * The sleepers a floor is generated with. They are part of the level rather
 * than an event: you can see one from across a room and decide to go round it.
 */
export function placeSleepers(state, depth, rng = Math.random) {
  const { cols, rows, enemyFromDepth, enemySpawnDistance } = state.config;
  if (depth < enemyFromDepth) return [];

  const count = Math.min(
    state.config.maxSleepers,
    Math.floor((depth - enemyFromDepth) / 2) + 1,
  );
  const head = state.snake[0];
  const sleepers = [];

  for (let i = 0; i < count; i += 1) {
    const occupied = new Set(
      [...state.snake, ...sleepers.flatMap((s) => s.body)].map((c) => c.y * cols + c.x),
    );
    const candidates = [];
    for (let index = 0; index < cols * rows; index += 1) {
      if (state.blocked.has(index) || occupied.has(index)) continue;
      const cell = { x: index % cols, y: Math.floor(index / cols) };
      // Never asleep on your doorstep, and never within waking distance of the
      // shard or portal you are forced to walk onto.
      if (manhattan(cell, head) < enemySpawnDistance) continue;
      if (state.portal && manhattan(cell, state.portal) <= state.config.sleeperWakeRadius) continue;
      candidates.push(cell);
    }
    if (candidates.length === 0) break;

    const spot = candidates[Math.min(candidates.length - 1, Math.floor(rng() * candidates.length))];
    sleepers.push({
      kind: 'sleeper',
      body: layBody(state, spot, state.config.enemyLength),
      phase: 'dormant',
      phaseMs: 0,
      msLeft: state.config.sleeperHuntMs,
      accumulator: 0,
    });
  }
  return sleepers;
}

/**
 * Advances every enemy by `dt` milliseconds and rolls for new arrivals.
 * Returns true when an enemy has caught the snake, which the caller turns into
 * the end of the run — the enemies themselves never touch `status`.
 */
export function advanceEnemies(state, dt, interval, rng = Math.random) {
  if (state.depth === null) return false;

  const step = enemyInterval(state, interval);
  let caught = false;

  for (const enemy of state.enemies) {
    if (enemy.phase === 'dormant') {
      const distance = manhattan(enemy.body[0], state.snake[0]);
      if (distance <= state.config.sleeperWakeRadius) {
        enemy.phase = 'waking';
        enemy.phaseMs = state.config.sleeperWakeMs;
      }
      continue;
    }

    if (enemy.phase === 'waking') {
      // Surfacing: visible, animated, and completely harmless to walk past.
      enemy.phaseMs -= dt;
      if (enemy.phaseMs <= 0) enemy.phase = 'hunting';
      continue;
    }

    if (enemy.phase === 'feeding') {
      // Busy with what it bit off: motionless, and harmless to brush past.
      // The hunt timer keeps running, so a bite costs it part of its own life.
      enemy.msLeft -= dt;
      enemy.phaseMs -= dt;
      if (enemy.phaseMs <= 0) enemy.phase = 'hunting';
      continue;
    }

    enemy.msLeft -= dt;
    enemy.accumulator += dt;
    while (enemy.accumulator >= step && enemy.msLeft > 0 && enemy.phase === 'hunting') {
      enemy.accumulator -= step;
      moveEnemy(state, enemy);

      // Only the worm's head does anything, and only to the snake it lands on:
      // its body dragging over your tail is just a worm in the way.
      if (state.invulnerable > 0) continue;
      const index = state.snake.findIndex((part) => same(part, enemy.body[0]));
      if (index === 0) caught = true;
      else if (index > 0) bite(state, enemy, index);
    }
  }

  state.enemies = state.enemies.filter((enemy) => enemy.phase === 'dormant' || enemy.msLeft > 0);

  // New arrivals. Never during the landing grace — the floor gets to be quiet
  // while you work out where you are.
  if (state.depth >= state.config.enemyFromDepth && state.grace <= 0) {
    const hunters = state.enemies.filter((enemy) => enemy.kind === 'crawler').length;
    const allowed = Math.min(state.config.maxHunters, Math.floor(state.depth / 3));

    if (hunters < allowed && state.enemyCooldown > 0) {
      state.enemyCooldown -= dt;
    } else if (hunters < allowed && rng() < state.config.enemyChance * (dt / 1000)) {
      const crawler = spawnCrawler(state, rng);
      if (crawler) {
        state.enemies.push(crawler);
        state.enemyCooldown = state.config.enemyCooldown;
      }
    }
  }

  return caught;
}
