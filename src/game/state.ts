import { isDirectionOpposite, movePoint } from "./direction";
import type { BoardSize, Direction, GameState, Point, WallMode } from "./types";

export type RandomFn = () => number;
export type SpawnFoodFn = (
  board: BoardSize,
  snake: readonly Point[],
  random: RandomFn
) => Point | null;

export interface CreateInitialGameStateOptions {
  readonly board?: BoardSize;
  readonly snake?: readonly Point[];
  readonly direction?: Direction;
  readonly wallMode?: WallMode;
  readonly initialFood?: Point;
  readonly bestScore?: number;
  readonly random?: RandomFn;
  readonly spawnFood?: SpawnFoodFn;
}

export interface AdvanceGameOptions {
  readonly random?: RandomFn;
  readonly spawnFood?: SpawnFoodFn;
}

export const DEFAULT_BOARD: BoardSize = { width: 24, height: 24 };
export const DEFAULT_DIRECTION: Direction = "right";
export const DEFAULT_WALL_MODE: WallMode = "solid";
export const DEFAULT_SNAKE: readonly Point[] = [
  { x: 12, y: 12 },
  { x: 11, y: 12 },
  { x: 10, y: 12 }
];
export const START_TICK_MS = 120;
export const SPEED_STEP_SCORE = 5;
export const SPEED_STEP_MS = 10;
export const MIN_TICK_MS = 60;

function createDefaultSnake(board: BoardSize): Point[] {
  const centerX = Math.min(board.width - 1, Math.max(0, Math.floor(board.width / 2)));
  const centerY = Math.max(0, Math.floor(board.height / 2));
  const segments: Point[] = [];

  for (let offset = 0; offset < 3; offset += 1) {
    const x = centerX - offset;
    if (x < 0) {
      break;
    }
    segments.push({ x, y: centerY });
  }

  return segments;
}

function pointsEqual(left: Point, right: Point): boolean {
  return left.x === right.x && left.y === right.y;
}

function isInBounds(point: Point, board: BoardSize): boolean {
  return (
    point.x >= 0 &&
    point.y >= 0 &&
    point.x < board.width &&
    point.y < board.height
  );
}

function isOnSnake(point: Point, snake: readonly Point[]): boolean {
  return snake.some((segment) => pointsEqual(segment, point));
}

function wrapCoordinate(value: number, limit: number): number {
  const wrapped = value % limit;
  return wrapped < 0 ? wrapped + limit : wrapped;
}

function wrapPointToBoard(point: Point, board: BoardSize): Point {
  return {
    x: wrapCoordinate(point.x, board.width),
    y: wrapCoordinate(point.y, board.height)
  };
}

function ensureValidBoard(board: BoardSize): void {
  if (!Number.isInteger(board.width) || !Number.isInteger(board.height)) {
    throw new Error("Board dimensions must be integers.");
  }
  if (board.width < 1 || board.height < 1) {
    throw new Error("Board dimensions must be at least 1x1.");
  }
}

export const spawnFoodAtRandomFreeCell: SpawnFoodFn = (board, snake, random) => {
  const snakeCells = new Set(snake.map((segment) => `${segment.x},${segment.y}`));
  const freeCells: Point[] = [];

  for (let y = 0; y < board.height; y += 1) {
    for (let x = 0; x < board.width; x += 1) {
      const key = `${x},${y}`;
      if (!snakeCells.has(key)) {
        freeCells.push({ x, y });
      }
    }
  }

  if (freeCells.length === 0) {
    return null;
  }

  const randomValue = random();
  const value = Number.isFinite(randomValue) ? randomValue : 0;
  const clamped = Math.max(0, Math.min(0.999_999, value));
  const index = Math.floor(clamped * freeCells.length);
  return freeCells[index];
};

export function createInitialGameState(
  options: CreateInitialGameStateOptions = {}
): GameState {
  const board = options.board ?? DEFAULT_BOARD;
  ensureValidBoard(board);
  const snake = [...(options.snake ?? createDefaultSnake(board))];
  if (snake.length === 0) {
    throw new Error("Snake must contain at least one segment.");
  }
  if (!snake.every((segment) => isInBounds(segment, board))) {
    throw new Error("Snake segments must be inside board bounds.");
  }
  const direction = options.direction ?? DEFAULT_DIRECTION;
  const wallMode = options.wallMode ?? DEFAULT_WALL_MODE;
  const random = options.random ?? Math.random;
  const spawnFood = options.spawnFood ?? spawnFoodAtRandomFreeCell;
  const bestScore = Math.max(0, Math.floor(options.bestScore ?? 0));

  const requestedInitialFood = options.initialFood;
  const initialFood =
    requestedInitialFood &&
    isInBounds(requestedInitialFood, board) &&
    !isOnSnake(requestedInitialFood, snake)
      ? requestedInitialFood
      : spawnFood(board, snake, random);

  if (!initialFood) {
    return {
      board,
      snake,
      direction,
      pendingDirection: null,
      wallMode,
      food: snake[0],
      score: 0,
      bestScore,
      status: "game-over"
    };
  }

  return {
    board,
    snake,
    direction,
    pendingDirection: null,
    wallMode,
    food: initialFood,
    score: 0,
    bestScore,
    status: "running"
  };
}

export function getTickIntervalForScore(score: number): number {
  const safeScore = Math.max(0, Math.floor(score));
  const steps = Math.floor(safeScore / SPEED_STEP_SCORE);
  const interval = START_TICK_MS - steps * SPEED_STEP_MS;
  return Math.max(MIN_TICK_MS, interval);
}

export function queueDirectionChange(
  state: GameState,
  requestedDirection: Direction
): GameState {
  if (state.status !== "running") {
    return state;
  }

  if (state.pendingDirection !== null) {
    return state;
  }

  if (
    requestedDirection === state.direction ||
    isDirectionOpposite(state.direction, requestedDirection)
  ) {
    return state;
  }

  return { ...state, pendingDirection: requestedDirection };
}

export function advanceGame(
  state: GameState,
  options: AdvanceGameOptions = {}
): GameState {
  if (state.status !== "running") {
    return state;
  }

  const random = options.random ?? Math.random;
  const spawnFood = options.spawnFood ?? spawnFoodAtRandomFreeCell;
  const direction = state.pendingDirection ?? state.direction;
  const currentHead = state.snake[0];
  const candidateHead = movePoint(currentHead, direction);
  const nextHead =
    state.wallMode === "wrap"
      ? wrapPointToBoard(candidateHead, state.board)
      : candidateHead;

  if (state.wallMode === "solid" && !isInBounds(nextHead, state.board)) {
    return {
      ...state,
      direction,
      pendingDirection: null,
      status: "game-over"
    };
  }

  const eatsFood = pointsEqual(nextHead, state.food);
  const collisionBody = eatsFood ? state.snake : state.snake.slice(0, -1);
  const hasSelfCollision = collisionBody.some((segment) =>
    pointsEqual(segment, nextHead)
  );

  if (hasSelfCollision) {
    return {
      ...state,
      direction,
      pendingDirection: null,
      status: "game-over"
    };
  }

  let nextSnake = [nextHead, ...state.snake];
  let nextScore = state.score;
  let nextFood = state.food;
  let nextStatus: GameState["status"] = "running";

  if (eatsFood) {
    nextScore += 1;
    const spawnedFood = spawnFood(state.board, nextSnake, random);
    if (spawnedFood) {
      nextFood = spawnedFood;
    } else {
      nextStatus = "game-over";
      nextFood = nextHead;
    }
  } else {
    nextSnake = nextSnake.slice(0, -1);
  }

  const bestScore = Math.max(state.bestScore, nextScore);

  return {
    ...state,
    direction,
    pendingDirection: null,
    snake: nextSnake,
    food: nextFood,
    score: nextScore,
    bestScore,
    status: nextStatus
  };
}
