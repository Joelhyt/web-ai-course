// Procedural dungeon floors for Adventure mode.
//
// Pure like game.js: it takes a size, a depth and an rng, and returns plain
// data. Nothing here knows about canvases or ticks, so a floor can be generated
// and inspected — connectivity included — from a plain Node test.
//
// The generator is rooms-and-corridors rather than a cave automaton. Rectangles
// joined by 1-tile passages give a snake something an organic cave does not:
// long straight runs to build up speed in, and corners that are genuinely
// committing. Connectivity is guaranteed by construction — every room is
// carved, then joined to the previous one — rather than checked and retried.

export const ROCK = 1;

const key = (cols, x, y) => y * cols + x;

function randomInt(rng, min, max) {
  return min + Math.floor(rng() * (max - min + 1));
}

// Rooms are padded so two of them never share a wall, which would read as one
// lumpy room instead of two. Two tiles, because corridors are two wide and a
// single-tile gap would let one cut through a neighbouring room's wall.
const ROOM_GAP = 2;

function overlaps(a, b) {
  return (
    a.x - ROOM_GAP <= b.x + b.w
    && a.x + a.w + ROOM_GAP >= b.x
    && a.y - ROOM_GAP <= b.y + b.h
    && a.y + a.h + ROOM_GAP >= b.y
  );
}

const center = (room) => ({
  x: room.x + Math.floor(room.w / 2),
  y: room.y + Math.floor(room.h / 2),
});

const manhattan = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

/** Floors get a little bigger and busier as the run goes on. */
function floorPlan(depth) {
  return {
    maxRooms: Math.min(16, 8 + depth),
    shards: Math.min(7, 3 + Math.floor(depth / 2)),
  };
}

function placeRooms(cols, rows, plan, rng) {
  const rooms = [];
  // Fixed attempt budget: placement fails by running out of tries, never by
  // looping forever on a board that is already full.
  for (let attempt = 0; attempt < 400 && rooms.length < plan.maxRooms; attempt += 1) {
    const w = randomInt(rng, 6, 12);
    const h = randomInt(rng, 5, 9);
    const room = {
      x: randomInt(rng, 1, Math.max(1, cols - w - 2)),
      y: randomInt(rng, 1, Math.max(1, rows - h - 2)),
      w,
      h,
    };
    if (room.x + room.w >= cols - 1 || room.y + room.h >= rows - 1) continue;
    if (rooms.some((other) => overlaps(room, other))) continue;
    rooms.push(room);
  }

  // A board too small for even one room still has to produce a playable floor
  // rather than an exception, so it becomes a single room of whatever interior
  // it has.
  if (rooms.length === 0) {
    rooms.push({ x: 1, y: 1, w: Math.max(1, cols - 2), h: Math.max(1, rows - 2) });
  }
  return rooms;
}

function carveRoom(floor, cols, room) {
  for (let y = room.y; y < room.y + room.h; y += 1) {
    for (let x = room.x; x < room.x + room.w; x += 1) floor.add(key(cols, x, y));
  }
}

// Corridors are carved with a 2x2 brush rather than a single tile. A one-wide
// passage is a commitment with no way out of it — the snake cannot turn round
// in one — and a whole floor of them is what made the first version of
// Adventure punishing rather than tense.
export const CORRIDOR_WIDTH = 2;

function brush(floor, cols, rows, x, y, width) {
  for (let dy = 0; dy < width; dy += 1) {
    for (let dx = 0; dx < width; dx += 1) {
      const bx = Math.min(cols - 2, x + dx);
      const by = Math.min(rows - 2, y + dy);
      if (bx < 1 || by < 1) continue;
      floor.add(key(cols, bx, by));
    }
  }
}

// A minority of passages are carved as single-tile cracks instead. They are the
// tense stretch of a floor — no room to turn around, and a bad place to meet a
// worm — but a whole dungeon of them is punishing rather than tense, so most
// corridors stay wide.
export const NARROW_CHANCE = 0.25;

function carveCorridor(floor, cols, rows, from, to, rng) {
  // An L in a random order: always turning the same way makes every floor read
  // like the same floor.
  const horizontalFirst = rng() < 0.5;
  const corner = horizontalFirst ? { x: to.x, y: from.y } : { x: from.x, y: to.y };
  const width = rng() < NARROW_CHANCE ? 1 : CORRIDOR_WIDTH;

  for (const [a, b] of [[from, corner], [corner, to]]) {
    const stepX = Math.sign(b.x - a.x);
    const stepY = Math.sign(b.y - a.y);
    let { x, y } = a;
    brush(floor, cols, rows, x, y, width);
    while (x !== b.x || y !== b.y) {
      x += stepX;
      y += stepY;
      brush(floor, cols, rows, x, y, width);
    }
  }
}

/**
 * Picks spread-out floor tiles, relaxing the spacing rule rather than failing
 * if the floor is too cramped to honour it. A floor that generates *something*
 * every time is worth more than a perfectly spaced one that sometimes cannot.
 */
function scatter(candidates, count, spacing, rng) {
  const chosen = [];
  for (let relax = spacing; relax >= 0 && chosen.length < count; relax -= 1) {
    const pool = candidates.filter(
      (cell) => !chosen.some((taken) => manhattan(taken, cell) < relax),
    );
    while (pool.length > 0 && chosen.length < count) {
      const cell = pool.splice(Math.floor(rng() * pool.length), 1)[0];
      if (chosen.some((taken) => manhattan(taken, cell) < relax)) continue;
      chosen.push(cell);
    }
  }
  return chosen;
}

/**
 * Builds one floor.
 *
 * Returns the rock tiles as a Set of `y * cols + x` indices (the same
 * addressing `freeCells` uses), the snake's starting body and heading, the
 * shards that unlock the portal, and the portal itself.
 */
export function generateLevel(config, depth, rng = Math.random) {
  const { cols, rows } = config;
  const plan = floorPlan(depth);

  const rooms = placeRooms(cols, rows, plan, rng);
  const floor = new Set();

  for (const room of rooms) carveRoom(floor, cols, room);
  for (let i = 1; i < rooms.length; i += 1) {
    carveCorridor(floor, cols, rows, center(rooms[i - 1]), center(rooms[i]), rng);
  }

  // The snake needs a straight run to be laid out in *and* room to move into,
  // so it starts in the widest room, heading right with its body trailing
  // behind it. In a minimum-width room the head would have a single tile of
  // warning before the far wall, which is not a fair way to open a floor.
  const home = rooms.reduce((best, room) => (room.w > best.w ? room : best), rooms[0]);
  const start = { x: home.x + 2, y: center(home).y };
  const snake = [
    { x: start.x, y: start.y },
    { x: start.x - 1, y: start.y },
    { x: start.x - 2, y: start.y },
  ];

  const open = [];
  for (const index of floor) open.push({ x: index % cols, y: Math.floor(index / cols) });

  // The portal goes in the room whose centre is furthest from the start, so
  // clearing a floor always means crossing it.
  const exitRoom = rooms.reduce(
    (best, room) => (manhattan(center(room), start) > manhattan(center(best), start) ? room : best),
    rooms[0],
  );
  const portal = center(exitRoom);

  // Shards want to be a walk away from the start, but a floor with no shards
  // would unlock its portal on arrival, so a board too cramped to honour the
  // distance drops it rather than going empty.
  const taken = (cell) => snake.some((seg) => manhattan(seg, cell) === 0)
    || manhattan(cell, portal) === 0;
  // Distances scale with the world: a six-tile walk is a long way on one screen
  // and nothing at all across a 60x45 dungeon.
  const reach = Math.max(6, Math.round((cols + rows) / 8));
  const roomy = open.filter(
    (cell) => !taken(cell) && manhattan(cell, start) >= reach && manhattan(cell, portal) >= 2,
  );
  const candidates = roomy.length >= plan.shards ? roomy : open.filter((cell) => !taken(cell));
  const shards = scatter(candidates, plan.shards, reach, rng);

  const blocked = new Set();
  for (let i = 0; i < cols * rows; i += 1) {
    if (!floor.has(i)) blocked.add(i);
  }

  return { blocked, rooms, snake, direction: { x: 1, y: 0 }, shards, portal, depth };
}

/**
 * Flood fill from the snake's head across open tiles. Used by the tests to
 * prove every shard and the portal are actually reachable — the one property a
 * generated floor absolutely must have.
 */
export function reachableFrom(level, config, from) {
  const { cols, rows } = config;
  const seen = new Set([key(cols, from.x, from.y)]);
  const queue = [from];

  while (queue.length > 0) {
    const { x, y } = queue.shift();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
      const index = key(cols, nx, ny);
      if (seen.has(index) || level.blocked.has(index)) continue;
      seen.add(index);
      queue.push({ x: nx, y: ny });
    }
  }
  return seen;
}
