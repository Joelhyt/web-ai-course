import {
  TETRIS_BOARD_HEIGHT,
  TETRIS_BOARD_WIDTH,
  TETROMINO_TYPES,
  type ActivePiece,
  type BoardMatrix,
  type CellValue,
  type CreateInitialTetrisStateOptions,
  type HorizontalMoveDirection,
  type Point,
  type RotationState,
  type TetrisState,
  type TetrominoType
} from "./types";

export const DEFAULT_RANDOM_SEED = 0x12345678;
export const BASE_GRAVITY_INTERVAL_MS = 1000;
export const MIN_GRAVITY_INTERVAL_MS = 75;

const LINE_CLEAR_SCORE: Readonly<Record<number, number>> = {
  1: 100,
  2: 300,
  3: 500,
  4: 800
};

const SPAWN_X = 3;

const TETROMINO_ROTATIONS: Readonly<
  Record<TetrominoType, readonly (readonly Point[])[]>
> = {
  I: [
    [
      { x: 0, y: 1 },
      { x: 1, y: 1 },
      { x: 2, y: 1 },
      { x: 3, y: 1 }
    ],
    [
      { x: 2, y: 0 },
      { x: 2, y: 1 },
      { x: 2, y: 2 },
      { x: 2, y: 3 }
    ],
    [
      { x: 0, y: 2 },
      { x: 1, y: 2 },
      { x: 2, y: 2 },
      { x: 3, y: 2 }
    ],
    [
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 1, y: 2 },
      { x: 1, y: 3 }
    ]
  ],
  O: [
    [
      { x: 1, y: 0 },
      { x: 2, y: 0 },
      { x: 1, y: 1 },
      { x: 2, y: 1 }
    ],
    [
      { x: 1, y: 0 },
      { x: 2, y: 0 },
      { x: 1, y: 1 },
      { x: 2, y: 1 }
    ],
    [
      { x: 1, y: 0 },
      { x: 2, y: 0 },
      { x: 1, y: 1 },
      { x: 2, y: 1 }
    ],
    [
      { x: 1, y: 0 },
      { x: 2, y: 0 },
      { x: 1, y: 1 },
      { x: 2, y: 1 }
    ]
  ],
  T: [
    [
      { x: 1, y: 0 },
      { x: 0, y: 1 },
      { x: 1, y: 1 },
      { x: 2, y: 1 }
    ],
    [
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 2, y: 1 },
      { x: 1, y: 2 }
    ],
    [
      { x: 0, y: 1 },
      { x: 1, y: 1 },
      { x: 2, y: 1 },
      { x: 1, y: 2 }
    ],
    [
      { x: 1, y: 0 },
      { x: 0, y: 1 },
      { x: 1, y: 1 },
      { x: 1, y: 2 }
    ]
  ],
  S: [
    [
      { x: 1, y: 0 },
      { x: 2, y: 0 },
      { x: 0, y: 1 },
      { x: 1, y: 1 }
    ],
    [
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 2, y: 1 },
      { x: 2, y: 2 }
    ],
    [
      { x: 1, y: 1 },
      { x: 2, y: 1 },
      { x: 0, y: 2 },
      { x: 1, y: 2 }
    ],
    [
      { x: 0, y: 0 },
      { x: 0, y: 1 },
      { x: 1, y: 1 },
      { x: 1, y: 2 }
    ]
  ],
  Z: [
    [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 2, y: 1 }
    ],
    [
      { x: 2, y: 0 },
      { x: 1, y: 1 },
      { x: 2, y: 1 },
      { x: 1, y: 2 }
    ],
    [
      { x: 0, y: 1 },
      { x: 1, y: 1 },
      { x: 1, y: 2 },
      { x: 2, y: 2 }
    ],
    [
      { x: 1, y: 0 },
      { x: 0, y: 1 },
      { x: 1, y: 1 },
      { x: 0, y: 2 }
    ]
  ],
  J: [
    [
      { x: 0, y: 0 },
      { x: 0, y: 1 },
      { x: 1, y: 1 },
      { x: 2, y: 1 }
    ],
    [
      { x: 1, y: 0 },
      { x: 2, y: 0 },
      { x: 1, y: 1 },
      { x: 1, y: 2 }
    ],
    [
      { x: 0, y: 1 },
      { x: 1, y: 1 },
      { x: 2, y: 1 },
      { x: 2, y: 2 }
    ],
    [
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 0, y: 2 },
      { x: 1, y: 2 }
    ]
  ],
  L: [
    [
      { x: 2, y: 0 },
      { x: 0, y: 1 },
      { x: 1, y: 1 },
      { x: 2, y: 1 }
    ],
    [
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 1, y: 2 },
      { x: 2, y: 2 }
    ],
    [
      { x: 0, y: 1 },
      { x: 1, y: 1 },
      { x: 2, y: 1 },
      { x: 0, y: 2 }
    ],
    [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 1, y: 2 }
    ]
  ]
};

export const TETROMINO_ROTATION_STATES = TETROMINO_ROTATIONS;

const JLSTZ_CLOCKWISE_KICKS: Readonly<Record<RotationState, readonly Point[]>> = {
  0: [
    { x: 0, y: 0 },
    { x: -1, y: 0 },
    { x: -1, y: -1 },
    { x: 0, y: 2 },
    { x: -1, y: 2 }
  ],
  1: [
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    { x: 1, y: 1 },
    { x: 0, y: -2 },
    { x: 1, y: -2 }
  ],
  2: [
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    { x: 1, y: -1 },
    { x: 0, y: 2 },
    { x: 1, y: 2 }
  ],
  3: [
    { x: 0, y: 0 },
    { x: -1, y: 0 },
    { x: -1, y: 1 },
    { x: 0, y: -2 },
    { x: -1, y: -2 }
  ]
};

const I_CLOCKWISE_KICKS: Readonly<Record<RotationState, readonly Point[]>> = {
  0: [
    { x: 0, y: 0 },
    { x: -2, y: 0 },
    { x: 1, y: 0 },
    { x: -2, y: 1 },
    { x: 1, y: -2 }
  ],
  1: [
    { x: 0, y: 0 },
    { x: -1, y: 0 },
    { x: 2, y: 0 },
    { x: -1, y: -2 },
    { x: 2, y: 1 }
  ],
  2: [
    { x: 0, y: 0 },
    { x: 2, y: 0 },
    { x: -1, y: 0 },
    { x: 2, y: -1 },
    { x: -1, y: 2 }
  ],
  3: [
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    { x: -2, y: 0 },
    { x: 1, y: 2 },
    { x: -2, y: -1 }
  ]
};

interface QueueResult {
  readonly queue: readonly TetrominoType[];
  readonly nextSeed: number;
}

interface SpawnResult {
  readonly activeType: TetrominoType;
  readonly nextPiece: TetrominoType;
  readonly queue: readonly TetrominoType[];
  readonly nextSeed: number;
}

interface SeededBagResult {
  readonly bag: readonly TetrominoType[];
  readonly nextSeed: number;
}

interface ClearedBoardResult {
  readonly board: BoardMatrix;
  readonly linesCleared: number;
}

export function createEmptyTetrisBoard(
  width = TETRIS_BOARD_WIDTH,
  height = TETRIS_BOARD_HEIGHT
): BoardMatrix {
  return Array.from({ length: height }, () =>
    Array.from({ length: width }, (): CellValue => null)
  );
}

export function createShuffledSevenBag(random: () => number): TetrominoType[] {
  const bag = [...TETROMINO_TYPES];

  for (let index = bag.length - 1; index > 0; index -= 1) {
    const value = random();
    const normalizedValue = Number.isFinite(value)
      ? Math.min(Math.max(value, 0), 0.999999999)
      : 0;
    const targetIndex = Math.floor(normalizedValue * (index + 1));
    const current = bag[index];
    bag[index] = bag[targetIndex];
    bag[targetIndex] = current;
  }

  return bag;
}

export function createInitialTetrisState(
  options: CreateInitialTetrisStateOptions = {}
): TetrisState {
  const randomSeed = options.randomSeed ?? DEFAULT_RANDOM_SEED;
  const board = cloneBoard(options.board ?? createEmptyTetrisBoard());
  const totalLinesCleared =
    options.totalLinesCleared ?? Math.max(0, (options.level ?? 1) - 1) * 10;
  const level = options.level ?? Math.floor(totalLinesCleared / 10) + 1;

  const rawQueue = options.queue ?? [];

  let activePiece: ActivePiece;
  let nextPiece: TetrominoType;
  let queue: readonly TetrominoType[];
  let nextSeed: number;

  if (options.activePiece) {
    const ensuredQueue = ensureQueueLength(rawQueue, 1, randomSeed);
    activePiece = normalizeActivePiece(options.activePiece);
    nextPiece = ensuredQueue.queue[0];
    queue = ensuredQueue.queue.slice(1);
    nextSeed = ensuredQueue.nextSeed;
  } else {
    const ensuredQueue = ensureQueueLength(rawQueue, 2, randomSeed);
    activePiece = createSpawnPiece(ensuredQueue.queue[0]);
    nextPiece = ensuredQueue.queue[1];
    queue = ensuredQueue.queue.slice(2);
    nextSeed = ensuredQueue.nextSeed;
  }

  const isValidSpawn = isPlacementValid(board, TETRIS_BOARD_WIDTH, TETRIS_BOARD_HEIGHT, activePiece);

  return {
    width: TETRIS_BOARD_WIDTH,
    height: TETRIS_BOARD_HEIGHT,
    board,
    status: isValidSpawn ? options.status ?? "running" : "game-over",
    activePiece,
    nextPiece,
    queue,
    heldPiece: options.heldPiece ?? null,
    canHold: options.canHold ?? true,
    score: options.score ?? 0,
    level,
    totalLinesCleared,
    randomSeed: nextSeed
  };
}

export function getGravityIntervalMs(levelOrState: number | Pick<TetrisState, "level">): number {
  const sourceLevel = typeof levelOrState === "number" ? levelOrState : levelOrState.level;
  const normalizedLevel = Number.isFinite(sourceLevel) && sourceLevel > 0
    ? Math.floor(sourceLevel)
    : 1;

  const interval = Math.floor(
    BASE_GRAVITY_INTERVAL_MS * Math.pow(0.85, normalizedLevel - 1)
  );

  return Math.max(interval, MIN_GRAVITY_INTERVAL_MS);
}

export function togglePause(state: TetrisState): TetrisState {
  if (state.status === "game-over") {
    return state;
  }

  return {
    ...state,
    status: state.status === "paused" ? "running" : "paused"
  };
}

export function moveActivePiece(
  state: TetrisState,
  direction: HorizontalMoveDirection
): TetrisState {
  if (state.status !== "running") {
    return state;
  }

  const deltaX = direction === "left" ? -1 : 1;
  const candidate = {
    ...state.activePiece,
    x: state.activePiece.x + deltaX
  };

  if (!isPlacementValid(state.board, state.width, state.height, candidate)) {
    return state;
  }

  return {
    ...state,
    activePiece: candidate
  };
}

export function rotateActivePieceClockwise(state: TetrisState): TetrisState {
  if (state.status !== "running") {
    return state;
  }

  if (state.activePiece.type === "O") {
    return state;
  }

  const nextRotation = ((state.activePiece.rotation + 1) % 4) as RotationState;
  const kicks = getClockwiseKicks(state.activePiece.type, state.activePiece.rotation);

  for (const kick of kicks) {
    const rotatedPiece: ActivePiece = {
      ...state.activePiece,
      rotation: nextRotation,
      x: state.activePiece.x + kick.x,
      y: state.activePiece.y + kick.y
    };

    if (isPlacementValid(state.board, state.width, state.height, rotatedPiece)) {
      return {
        ...state,
        activePiece: rotatedPiece
      };
    }
  }

  return state;
}

export function moveDown(state: TetrisState): TetrisState {
  return softDrop(state);
}

export function softDrop(state: TetrisState): TetrisState {
  if (state.status !== "running") {
    return state;
  }

  const candidate: ActivePiece = {
    ...state.activePiece,
    y: state.activePiece.y + 1
  };

  if (isPlacementValid(state.board, state.width, state.height, candidate)) {
    return {
      ...state,
      activePiece: candidate
    };
  }

  return lockActivePiece(state);
}

export function hardDrop(state: TetrisState): TetrisState {
  if (state.status !== "running") {
    return state;
  }

  let droppedPiece = state.activePiece;

  while (true) {
    const nextPiece: ActivePiece = {
      ...droppedPiece,
      y: droppedPiece.y + 1
    };

    if (!isPlacementValid(state.board, state.width, state.height, nextPiece)) {
      break;
    }

    droppedPiece = nextPiece;
  }

  return lockActivePiece({
    ...state,
    activePiece: droppedPiece
  });
}

export function holdActivePiece(state: TetrisState): TetrisState {
  if (state.status !== "running" || !state.canHold) {
    return state;
  }

  const outgoingType = state.activePiece.type;

  if (state.heldPiece === null) {
    const spawn = consumeQueue(state.nextPiece, state.queue, state.randomSeed);
    const incomingPiece = createSpawnPiece(spawn.activeType);

    return {
      ...state,
      activePiece: incomingPiece,
      nextPiece: spawn.nextPiece,
      queue: spawn.queue,
      randomSeed: spawn.nextSeed,
      heldPiece: outgoingType,
      canHold: false,
      status: isPlacementValid(state.board, state.width, state.height, incomingPiece)
        ? state.status
        : "game-over"
    };
  }

  const incomingPiece = createSpawnPiece(state.heldPiece);

  return {
    ...state,
    activePiece: incomingPiece,
    heldPiece: outgoingType,
    canHold: false,
    status: isPlacementValid(state.board, state.width, state.height, incomingPiece)
      ? state.status
      : "game-over"
  };
}

export function advanceTetrisState(state: TetrisState): TetrisState {
  return softDrop(state);
}

export function isPlacementValid(
  board: BoardMatrix,
  width: number,
  height: number,
  piece: ActivePiece
): boolean {
  const cells = getPieceCells(piece);

  for (const cell of cells) {
    if (cell.x < 0 || cell.x >= width || cell.y >= height) {
      return false;
    }

    if (cell.y >= 0 && board[cell.y][cell.x] !== null) {
      return false;
    }
  }

  return true;
}

export function getPieceCells(piece: ActivePiece): Point[] {
  const shape = TETROMINO_ROTATIONS[piece.type][piece.rotation];

  return shape.map((offset) => ({
    x: piece.x + offset.x,
    y: piece.y + offset.y
  }));
}

export function getLineClearScore(linesCleared: number, level: number): number {
  if (linesCleared <= 0) {
    return 0;
  }

  const normalizedLevel = Number.isFinite(level) && level > 0 ? Math.floor(level) : 1;
  return (LINE_CLEAR_SCORE[linesCleared] ?? 0) * normalizedLevel;
}

function lockActivePiece(state: TetrisState): TetrisState {
  const mutableBoard = cloneBoard(state.board).map((row) => [...row]);
  let hasOutOfBoundsCell = false;

  for (const cell of getPieceCells(state.activePiece)) {
    if (cell.y < 0) {
      hasOutOfBoundsCell = true;
      continue;
    }

    mutableBoard[cell.y][cell.x] = state.activePiece.type;
  }

  const cleared = clearCompletedLines(mutableBoard, state.width, state.height);
  const scoreIncrease = getLineClearScore(cleared.linesCleared, state.level);
  const totalLinesCleared = state.totalLinesCleared + cleared.linesCleared;
  const nextLevel = Math.floor(totalLinesCleared / 10) + 1;

  if (hasOutOfBoundsCell) {
    return {
      ...state,
      board: cleared.board,
      score: state.score + scoreIncrease,
      totalLinesCleared,
      level: nextLevel,
      status: "game-over"
    };
  }

  const spawn = consumeQueue(state.nextPiece, state.queue, state.randomSeed);
  const spawnedPiece = createSpawnPiece(spawn.activeType);
  const canSpawn = isPlacementValid(
    cleared.board,
    state.width,
    state.height,
    spawnedPiece
  );

  return {
    ...state,
    board: cleared.board,
    activePiece: spawnedPiece,
    nextPiece: spawn.nextPiece,
    queue: spawn.queue,
    randomSeed: spawn.nextSeed,
    canHold: true,
    score: state.score + scoreIncrease,
    totalLinesCleared,
    level: nextLevel,
    status: canSpawn ? state.status : "game-over"
  };
}

function clearCompletedLines(
  board: readonly (readonly CellValue[])[],
  width: number,
  height: number
): ClearedBoardResult {
  const remainingRows = board.filter((row) => row.some((cell) => cell === null));
  const linesCleared = height - remainingRows.length;

  if (linesCleared <= 0) {
    return {
      board: board.map((row) => [...row]),
      linesCleared: 0
    };
  }

  const emptyRows = Array.from({ length: linesCleared }, () =>
    Array.from({ length: width }, (): CellValue => null)
  );

  return {
    board: [...emptyRows, ...remainingRows.map((row) => [...row])],
    linesCleared
  };
}

function cloneBoard(board: BoardMatrix): BoardMatrix {
  return board.map((row) => [...row]);
}

function normalizeActivePiece(piece: ActivePiece): ActivePiece {
  return {
    type: piece.type,
    rotation: piece.rotation,
    x: piece.x,
    y: piece.y
  };
}

function getClockwiseKicks(
  type: TetrominoType,
  fromRotation: RotationState
): readonly Point[] {
  if (type === "I") {
    return I_CLOCKWISE_KICKS[fromRotation];
  }

  return JLSTZ_CLOCKWISE_KICKS[fromRotation];
}

function createSpawnPiece(type: TetrominoType): ActivePiece {
  return {
    type,
    rotation: 0,
    x: SPAWN_X,
    y: type === "I" ? -1 : 0
  };
}

function consumeQueue(
  nextPiece: TetrominoType,
  queue: readonly TetrominoType[],
  seed: number
): SpawnResult {
  const pool = [nextPiece, ...queue];
  const ensured = ensureQueueLength(pool, 2, seed);

  return {
    activeType: ensured.queue[0],
    nextPiece: ensured.queue[1],
    queue: ensured.queue.slice(2),
    nextSeed: ensured.nextSeed
  };
}

function ensureQueueLength(
  queue: readonly TetrominoType[],
  minimumLength: number,
  seed: number
): QueueResult {
  let nextSeed = seed;
  const nextQueue = [...queue];

  while (nextQueue.length < minimumLength) {
    const bag = createSeededSevenBag(nextSeed);
    nextSeed = bag.nextSeed;
    nextQueue.push(...bag.bag);
  }

  return {
    queue: nextQueue,
    nextSeed
  };
}

function createSeededSevenBag(seed: number): SeededBagResult {
  const bag = [...TETROMINO_TYPES];
  let nextSeed = seed >>> 0;

  for (let index = bag.length - 1; index > 0; index -= 1) {
    nextSeed = nextRandomSeed(nextSeed);
    const randomValue = nextSeed / 0x100000000;
    const targetIndex = Math.floor(randomValue * (index + 1));
    const current = bag[index];
    bag[index] = bag[targetIndex];
    bag[targetIndex] = current;
  }

  return {
    bag,
    nextSeed
  };
}

function nextRandomSeed(seed: number): number {
  return (Math.imul(seed, 1664525) + 1013904223) >>> 0;
}
