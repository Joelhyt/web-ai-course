// The arcade maze and the geometry every actor moves by. No DOM.
//
// Coordinates are in tiles. Tile (col, row) has its centre at (col, row), so an
// actor standing on a tile has whole-number coordinates and one walking between
// two tiles has a fractional one along its lane.

// # wall   . dot   o energizer   - ghost house door   space: empty floor.
// Spaces outside the walls (beside the house, and around the tunnel) are never
// reached and are told apart from floor by a flood fill, not by a symbol.
export const MAZE_ROWS = Object.freeze([
  '############################',
  '#............##............#',
  '#.####.#####.##.#####.####.#',
  '#o####.#####.##.#####.####o#',
  '#.####.#####.##.#####.####.#',
  '#..........................#',
  '#.####.##.########.##.####.#',
  '#.####.##.########.##.####.#',
  '#......##....##....##......#',
  '######.##### ## #####.######',
  '     #.##### ## #####.#     ',
  '     #.##          ##.#     ',
  '     #.## ###--### ##.#     ',
  '######.## #      # ##.######',
  '      .   #      #   .      ',
  '######.## #      # ##.######',
  '     #.## ######## ##.#     ',
  '     #.##          ##.#     ',
  '     #.## ######## ##.#     ',
  '######.## ######## ##.######',
  '#............##............#',
  '#.####.#####.##.#####.####.#',
  '#.####.#####.##.#####.####.#',
  '#o..##.......  .......##..o#',
  '###.##.##.########.##.##.###',
  '###.##.##.########.##.##.###',
  '#......##....##....##......#',
  '#.##########.##.##########.#',
  '#.##########.##.##########.#',
  '#..........................#',
  '############################',
]);

export const WIDTH = 28;
export const HEIGHT = 31;

export const DIRS = Object.freeze({
  up: Object.freeze({ x: 0, y: -1 }),
  left: Object.freeze({ x: -1, y: 0 }),
  down: Object.freeze({ x: 0, y: 1 }),
  right: Object.freeze({ x: 1, y: 0 }),
});

// Also the ghosts' tie-break order: with two exits equally close to a target,
// the earlier one wins.
export const DIR_ORDER = Object.freeze(['up', 'left', 'down', 'right']);

export const OPPOSITE = Object.freeze({ up: 'down', down: 'up', left: 'right', right: 'left' });

// Where things are. Half-tile x positions sit between two tiles, as in the
// arcade, where Pac-Man and the ghosts start centred on the maze.
export const PAC_START = Object.freeze({ x: 13.5, y: 23 });
export const HOUSE = Object.freeze({
  doorX: 13.5, // the lane through the door
  exitY: 11, // the row above the door, where ghosts leave and eyes come back
  centreY: 14, // the middle of the house, where ghosts wait
});
export const FRUIT_SPOT = Object.freeze({ x: 13.5, y: 17 });

// The two tiles above the house and the two above Pac-Man's start. Ghosts in
// scatter or chase may not turn up into them, which makes those corridors safer.
export const NO_UP_TILES = Object.freeze(['12,11', '15,11', '12,23', '15,23']);
const NO_UP = new Set(NO_UP_TILES);

export function isNoUpTile(col, row) {
  return NO_UP.has(`${col},${row}`);
}

/** Columns wrap around through the side tunnel. */
export function wrapCol(col) {
  return ((col % WIDTH) + WIDTH) % WIDTH;
}

/** An actor's x, folded back into the maze after it walks off a side. */
export function wrapX(x) {
  if (x < 0) return x + WIDTH;
  if (x >= WIDTH) return x - WIDTH;
  return x;
}

export function tileAt(maze, col, row) {
  if (row < 0 || row >= HEIGHT) return '#';
  return maze.template[row][wrapCol(col)];
}

/** Whether actors steering through the maze may enter a tile. The door is shut to them. */
export function isOpen(maze, col, row) {
  const tile = tileAt(maze, col, row);
  return tile !== '#' && tile !== '-';
}

/** The tile an actor is standing on: the one its centre is nearest to. */
export function tileOf(actor) {
  return { col: wrapCol(Math.round(actor.x)), row: Math.round(actor.y) };
}

/** The tunnel's slow stretch: the side corridors of the middle row. */
export function isTunnel(col, row) {
  const c = wrapCol(col);
  return row === 14 && (c <= 5 || c >= 22);
}

/** A fresh maze with every dot in place. */
export function createMaze(rows = MAZE_ROWS) {
  const template = rows.map((row) => [...row]);
  // 1 a dot, 2 an energizer, 0 nothing (left) to eat.
  const dots = template.map((row) => row.map((tile) => (tile === '.' ? 1 : tile === 'o' ? 2 : 0)));
  return { template, dots, reachable: reachableTiles(template) };
}

export function countDots(maze) {
  let dots = 0;
  let energizers = 0;
  for (const row of maze.dots) {
    for (const value of row) {
      if (value === 1) dots += 1;
      else if (value === 2) energizers += 1;
    }
  }
  return { dots, energizers, total: dots + energizers };
}

/**
 * Every tile that is not wall and can be reached from Pac-Man's start, through
 * the door and the tunnel included, as a grid of booleans. What is left over is
 * the dead space outside the walls.
 */
function reachableTiles(template) {
  const seen = template.map((row) => row.map(() => false));
  const stack = [[Math.floor(PAC_START.x), PAC_START.y]];
  while (stack.length) {
    const [col, row] = stack.pop();
    if (row < 0 || row >= template.length) continue;
    const c = wrapCol(col);
    if (seen[row][c] || template[row][c] === '#') continue;
    seen[row][c] = true;
    for (const d of Object.values(DIRS)) stack.push([c + d.x, row + d.y]);
  }
  return seen;
}

/**
 * The maze's walls as line segments between wall-tile centres, in tile
 * coordinates. A segment joins two neighbouring wall tiles when either of them
 * faces floor on the same side. Drawn with a wide stroke, that traces each
 * block of wall half a tile in from its edge, which is how the arcade's walls
 * sit: a two-tile-thick block becomes a rounded outline, not a filled slab.
 * The door is not wall here; the renderer draws it on its own.
 */
export function wallSegments(maze) {
  const { template, reachable } = maze;
  const isWall = (col, row) => template[row]?.[col] === '#';
  const isFloor = (col, row) => Boolean(reachable[row]?.[col]);
  const segments = [];
  for (let row = 0; row < HEIGHT; row += 1) {
    for (let col = 0; col < WIDTH; col += 1) {
      if (!isWall(col, row)) continue;
      if (isWall(col + 1, row)) {
        const above = isFloor(col, row - 1) || isFloor(col + 1, row - 1);
        const below = isFloor(col, row + 1) || isFloor(col + 1, row + 1);
        if (above || below) segments.push([col, row, col + 1, row]);
      }
      if (isWall(col, row + 1)) {
        const left = isFloor(col - 1, row) || isFloor(col - 1, row + 1);
        const right = isFloor(col + 1, row) || isFloor(col + 1, row + 1);
        if (left || right) segments.push([col, row, col, row + 1]);
      }
    }
  }
  return segments;
}

/**
 * Moves an actor along its direction by up to `dist` tiles, but never past the
 * next tile centre, where it may need to turn or stop. Any offset across the
 * lane (left by a cornering turn) shrinks at the same rate. Returns how far it
 * went and whether it reached the centre.
 */
export function stepToCentre(actor, dist) {
  const d = DIRS[actor.dir];
  const axis = d.x ? 'x' : 'y';
  const across = d.x ? 'y' : 'x';
  const sign = d.x || d.y;
  const along = actor[axis];
  let next;
  if (Number.isInteger(along)) next = along + sign;
  else next = sign > 0 ? Math.ceil(along) : Math.floor(along);
  const gap = Math.abs(next - along);
  const reached = dist >= gap;
  const used = reached ? gap : dist;
  actor[axis] = reached ? next : along + sign * dist;

  const lane = Math.round(actor[across]);
  const off = lane - actor[across];
  if (Math.abs(off) <= used) actor[across] = lane;
  else actor[across] += Math.sign(off) * used;

  if (reached) actor.x = wrapX(actor.x);
  return { used, reached };
}
