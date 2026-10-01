// The seven tetrominoes and the Super Rotation System (SRS), in board
// coordinates: x grows to the right and y grows *down*, like the rows of the
// board array. Knows nothing about the board itself.

export const PIECE_TYPES = Object.freeze(['I', 'J', 'L', 'O', 'S', 'T', 'Z']);

// Spawn orientation of each piece inside its bounding box, exactly as the
// guideline draws them: everything but I and O spawns flat side down in a 3x3
// box, I lies across the second row of a 4x4 box.
const SPAWN_SHAPES = {
  I: ['....', 'IIII', '....', '....'],
  J: ['J..', 'JJJ', '...'],
  L: ['..L', 'LLL', '...'],
  O: ['OO', 'OO'],
  S: ['.SS', 'SS.', '...'],
  T: ['.T.', 'TTT', '...'],
  Z: ['ZZ.', '.ZZ', '...'],
};

function cellsOf(rows) {
  const cells = [];
  rows.forEach((row, y) => {
    [...row].forEach((char, x) => {
      if (char !== '.') cells.push(Object.freeze({ x, y }));
    });
  });
  return cells;
}

// A quarter turn clockwise about the centre of the bounding box. Rotating the
// box rather than the cells about a pivot is what makes SRS's four states come
// out right for every piece, including I, whose centre falls between cells.
function rotateClockwise(cells, size) {
  return cells.map(({ x, y }) => Object.freeze({ x: size - 1 - y, y: x }));
}

/**
 * type → { size, rotations }. rotations[r] lists the four cells of the piece in
 * rotation state r (0 = spawn, 1 = R, 2 = upside down, 3 = L), relative to the
 * top-left corner of its bounding box.
 */
export const SHAPES = Object.freeze(Object.fromEntries(PIECE_TYPES.map((type) => {
  const rows = SPAWN_SHAPES[type];
  const size = rows.length;
  const rotations = [cellsOf(rows)];
  for (let r = 1; r < 4; r += 1) rotations.push(rotateClockwise(rotations[r - 1], size));
  return [type, Object.freeze({ size, rotations: Object.freeze(rotations.map(Object.freeze)) })];
})));

export function pieceCells(type, rotation) {
  return SHAPES[type].rotations[rotation];
}

// Wall kicks, transcribed verbatim from the SRS tables. The published tables
// use y pointing *up*, so they are kept that way here, where they can be checked
// against the source line by line, and flipped once below. Each key is
// "from>to"; the offsets are tried in order and the first that fits wins.
const JLSTZ_KICKS_Y_UP = {
  '0>1': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  '1>0': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
  '1>2': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
  '2>1': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  '2>3': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
  '3>2': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  '3>0': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  '0>3': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
};

const I_KICKS_Y_UP = {
  '0>1': [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]],
  '1>0': [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]],
  '1>2': [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]],
  '2>1': [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]],
  '2>3': [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]],
  '3>2': [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]],
  '3>0': [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]],
  '0>3': [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]],
};

const flip = (table) => Object.freeze(Object.fromEntries(Object.entries(table).map(
  ([key, offsets]) => [key, Object.freeze(offsets.map(([x, y]) => Object.freeze({ x, y: 0 - y })))],
)));

const JLSTZ_KICKS = flip(JLSTZ_KICKS_Y_UP);
const I_KICKS = flip(I_KICKS_Y_UP);
const NO_KICKS = Object.freeze([Object.freeze({ x: 0, y: 0 })]);

/** The offsets to try, in order, when turning `type` from one state to another. */
export function kicksFor(type, from, to) {
  if (type === 'O') return NO_KICKS;
  const table = type === 'I' ? I_KICKS : JLSTZ_KICKS;
  return table[`${from}>${to}`];
}
