import { isDirectionOpposite, movePoint } from "./direction";
import type {
  ActivePowerUp,
  BoardPowerUp,
  BoardSize,
  Direction,
  GameMode,
  GameState,
  Point,
  PowerUpType,
  WallMode
} from "./types";

export type RandomFn = () => number;
export type SpawnFoodFn = (
  board: BoardSize,
  snake: readonly Point[],
  random: RandomFn
) => Point | null;
export type SpawnedPowerUp = {
  readonly type: PowerUpType;
  readonly position: Point;
};
export type SpawnPowerUpFn = (
  board: BoardSize,
  snake: readonly Point[],
  blockedPoints: readonly Point[],
  random: RandomFn
) => SpawnedPowerUp | null;

export interface CreateInitialGameStateOptions {
  readonly board?: BoardSize;
  readonly gameMode?: GameMode;
  readonly timeRemainingMs?: number | null;
  readonly snake?: readonly Point[];
  readonly direction?: Direction;
  readonly wallMode?: WallMode;
  readonly activePowerUps?: readonly ActivePowerUp[];
  readonly boardPowerUps?: readonly BoardPowerUp[];
  readonly activePowerUp?: ActivePowerUp | null;
  readonly boardPowerUp?: BoardPowerUp | null;
  readonly initialFood?: Point;
  readonly initialExtraFoods?: readonly Point[];
  readonly bestScore?: number;
  readonly random?: RandomFn;
  readonly spawnFood?: SpawnFoodFn;
}

export interface AdvanceGameOptions {
  readonly random?: RandomFn;
  readonly spawnFood?: SpawnFoodFn;
  readonly spawnPowerUp?: SpawnPowerUpFn;
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
export const SLOW_TICK_MULTIPLIER = 1.5;
export const POWER_UP_SPAWN_CHANCE = 0.25;
export const TIME_ATTACK_POWER_UP_SPAWN_CHANCE = 0.5;
export const POWER_UP_BOARD_DURATION_STEPS = 50;
export const POWER_UP_EFFECT_DURATION_STEPS = 40;
export const FEAST_EXTRA_FOOD_COUNT = 3;
export const TIME_ATTACK_DURATION_MS = 60_000;
export const TIME_ATTACK_SPEED_DECAY_PER_STEP = 0.93;
export const TIME_ATTACK_POWER_UP_MAX_BOARD_ITEMS = 4;
const POWER_UP_TYPES: readonly PowerUpType[] = [
  "slow",
  "ghost",
  "magnet",
  "feast"
];

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

function hasPoint(points: readonly Point[], point: Point): boolean {
  return points.some((candidate) => pointsEqual(candidate, point));
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

function normalizeRandom(random: RandomFn): number {
  const value = random();
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(0.999_999, value));
}

function getRandomIndex(length: number, random: RandomFn): number {
  return Math.floor(normalizeRandom(random) * length);
}

function listFreeCells(
  board: BoardSize,
  snake: readonly Point[],
  blockedPoints: readonly Point[]
): Point[] {
  const snakeCells = new Set(snake.map((segment) => `${segment.x},${segment.y}`));
  const blockedCells = new Set(blockedPoints.map((point) => `${point.x},${point.y}`));
  const freeCells: Point[] = [];

  for (let y = 0; y < board.height; y += 1) {
    for (let x = 0; x < board.width; x += 1) {
      const key = `${x},${y}`;
      if (!snakeCells.has(key) && !blockedCells.has(key)) {
        freeCells.push({ x, y });
      }
    }
  }

  return freeCells;
}

function spawnFreeCell(
  board: BoardSize,
  snake: readonly Point[],
  blockedPoints: readonly Point[],
  random: RandomFn
): Point | null {
  const freeCells = listFreeCells(board, snake, blockedPoints);
  if (freeCells.length === 0) {
    return null;
  }
  return freeCells[getRandomIndex(freeCells.length, random)];
}

function normalizeTimeRemainingMs(
  mode: GameMode,
  timeRemainingMs: number | null | undefined
): number | null {
  if (mode !== "time-attack") {
    return null;
  }

  const value = timeRemainingMs ?? TIME_ATTACK_DURATION_MS;
  return Math.max(0, value);
}

function sanitizeActivePowerUps(
  mode: GameMode,
  activePowerUps: readonly ActivePowerUp[]
): ActivePowerUp[] {
  const merged = new Map<PowerUpType, number>();

  for (const powerUp of activePowerUps) {
    const remainingSteps = Math.floor(powerUp.remainingSteps);
    if (remainingSteps <= 0) {
      continue;
    }
    merged.set(powerUp.type, (merged.get(powerUp.type) ?? 0) + remainingSteps);
  }

  const result = Array.from(merged.entries()).map(([type, remainingSteps]) => ({
    type,
    remainingSteps
  }));

  if (mode === "classic" && result.length > 1) {
    return [result[0]];
  }
  return result;
}

function sanitizeExtraFoods(
  extraFoods: readonly Point[] | undefined,
  board: BoardSize,
  snake: readonly Point[],
  food: Point
): Point[] {
  if (!extraFoods || extraFoods.length === 0) {
    return [];
  }

  const sanitized: Point[] = [];
  for (const point of extraFoods) {
    if (
      isInBounds(point, board) &&
      !isOnSnake(point, snake) &&
      !pointsEqual(point, food) &&
      !hasPoint(sanitized, point)
    ) {
      sanitized.push(point);
    }
  }

  return sanitized;
}

function sanitizeBoardPowerUps(
  mode: GameMode,
  powerUps: readonly BoardPowerUp[],
  board: BoardSize,
  snake: readonly Point[],
  food: Point,
  extraFoods: readonly Point[]
): BoardPowerUp[] {
  const blocked = [food, ...extraFoods];
  const sanitized: BoardPowerUp[] = [];
  const maxItems = mode === "time-attack" ? TIME_ATTACK_POWER_UP_MAX_BOARD_ITEMS : 1;

  for (const powerUp of powerUps) {
    if (sanitized.length >= maxItems) {
      break;
    }

    const remainingSteps = Math.floor(powerUp.remainingSteps);
    if (remainingSteps <= 0) {
      continue;
    }
    if (!isInBounds(powerUp.position, board) || isOnSnake(powerUp.position, snake)) {
      continue;
    }
    if (hasPoint(blocked, powerUp.position)) {
      continue;
    }
    if (sanitized.some((item) => pointsEqual(item.position, powerUp.position))) {
      continue;
    }

    sanitized.push({
      type: powerUp.type,
      position: powerUp.position,
      remainingSteps
    });
  }

  return sanitized;
}

function decrementActivePowerUps(activePowerUps: readonly ActivePowerUp[]): ActivePowerUp[] {
  const nextActivePowerUps: ActivePowerUp[] = [];
  for (const powerUp of activePowerUps) {
    if (powerUp.remainingSteps > 1) {
      nextActivePowerUps.push({
        ...powerUp,
        remainingSteps: powerUp.remainingSteps - 1
      });
    }
  }
  return nextActivePowerUps;
}

function decrementBoardPowerUps(boardPowerUps: readonly BoardPowerUp[]): BoardPowerUp[] {
  const nextBoardPowerUps: BoardPowerUp[] = [];
  for (const powerUp of boardPowerUps) {
    if (powerUp.remainingSteps > 1) {
      nextBoardPowerUps.push({
        ...powerUp,
        remainingSteps: powerUp.remainingSteps - 1
      });
    }
  }
  return nextBoardPowerUps;
}

function hasActivePowerUp(activePowerUps: readonly ActivePowerUp[], type: PowerUpType): boolean {
  return activePowerUps.some((powerUp) => powerUp.type === type);
}

function addOrExtendActivePowerUp(
  mode: GameMode,
  activePowerUps: readonly ActivePowerUp[],
  type: PowerUpType
): ActivePowerUp[] {
  if (mode === "classic") {
    return [{ type, remainingSteps: POWER_UP_EFFECT_DURATION_STEPS }];
  }

  const existingIndex = activePowerUps.findIndex((powerUp) => powerUp.type === type);
  if (existingIndex < 0) {
    return [
      ...activePowerUps,
      { type, remainingSteps: POWER_UP_EFFECT_DURATION_STEPS }
    ];
  }

  return activePowerUps.map((powerUp, index) =>
    index === existingIndex
      ? {
          ...powerUp,
          remainingSteps: powerUp.remainingSteps + POWER_UP_EFFECT_DURATION_STEPS
        }
      : powerUp
  );
}

function getPowerUpAxisCandidates(food: Point, head: Point): Point[] {
  const dx = head.x - food.x;
  const dy = head.y - food.y;
  const horizontalStep = Math.sign(dx);
  const verticalStep = Math.sign(dy);

  const candidates: Point[] = [];
  const tryHorizontalFirst = Math.abs(dx) >= Math.abs(dy);

  if (tryHorizontalFirst) {
    if (horizontalStep !== 0) {
      candidates.push({ x: food.x + horizontalStep, y: food.y });
    }
    if (verticalStep !== 0) {
      candidates.push({ x: food.x, y: food.y + verticalStep });
    }
  } else {
    if (verticalStep !== 0) {
      candidates.push({ x: food.x, y: food.y + verticalStep });
    }
    if (horizontalStep !== 0) {
      candidates.push({ x: food.x + horizontalStep, y: food.y });
    }
  }

  return candidates;
}

function pullFoodTowardHead(
  food: Point,
  head: Point,
  snake: readonly Point[],
  board: BoardSize,
  blockedPoints: readonly Point[]
): Point {
  const candidates = getPowerUpAxisCandidates(food, head);

  for (const candidate of candidates) {
    if (
      isInBounds(candidate, board) &&
      !isOnSnake(candidate, snake) &&
      !hasPoint(blockedPoints, candidate)
    ) {
      return candidate;
    }
  }

  return food;
}

function pullFoodsTowardHead(
  foods: readonly Point[],
  head: Point,
  snake: readonly Point[],
  board: BoardSize,
  blockedPoints: readonly Point[]
): Point[] {
  const nextFoods = [...foods];
  for (let index = 0; index < nextFoods.length; index += 1) {
    const currentFood = nextFoods[index];
    const otherFoods = nextFoods.filter((_, itemIndex) => itemIndex !== index);
    nextFoods[index] = pullFoodTowardHead(currentFood, head, snake, board, [
      ...blockedPoints,
      ...otherFoods
    ]);
  }
  return nextFoods;
}

function getPowerUpSpawnChance(mode: GameMode): number {
  return mode === "time-attack"
    ? TIME_ATTACK_POWER_UP_SPAWN_CHANCE
    : POWER_UP_SPAWN_CHANCE;
}

function getPowerUpBoardCap(mode: GameMode): number {
  return mode === "time-attack" ? TIME_ATTACK_POWER_UP_MAX_BOARD_ITEMS : 1;
}

function ensureFeastTemporaryFoods(
  extraFoods: readonly Point[],
  board: BoardSize,
  snake: readonly Point[],
  normalFood: Point,
  boardPowerUps: readonly BoardPowerUp[],
  random: RandomFn
): Point[] {
  const nextExtraFoods = [...extraFoods];

  while (nextExtraFoods.length < FEAST_EXTRA_FOOD_COUNT) {
    const blocked = [normalFood, ...nextExtraFoods, ...boardPowerUps.map((item) => item.position)];
    const candidate = spawnFreeCell(board, snake, blocked, random);
    if (!candidate) {
      break;
    }
    nextExtraFoods.push(candidate);
  }

  return nextExtraFoods;
}

function spawnNormalFood(
  board: BoardSize,
  snake: readonly Point[],
  extraFoods: readonly Point[],
  boardPowerUps: readonly BoardPowerUp[],
  random: RandomFn,
  spawnFood: SpawnFoodFn
): Point | null {
  const blocked = [...extraFoods, ...boardPowerUps.map((item) => item.position)];
  const candidate = spawnFood(board, snake, random);
  if (
    candidate &&
    isInBounds(candidate, board) &&
    !hasPoint(blocked, candidate) &&
    !isOnSnake(candidate, snake)
  ) {
    return candidate;
  }

  return spawnFreeCell(board, snake, blocked, random);
}

function toGameState(
  state: Omit<GameState, "activePowerUp" | "boardPowerUp">
): GameState {
  return {
    ...state,
    activePowerUp: state.activePowerUps[0] ?? null,
    boardPowerUp: state.boardPowerUps[0] ?? null
  };
}

export const spawnFoodAtRandomFreeCell: SpawnFoodFn = (board, snake, random) =>
  spawnFreeCell(board, snake, [], random);

export const spawnPowerUpAtRandomFreeCell: SpawnPowerUpFn = (
  board,
  snake,
  blockedPoints,
  random
) => {
  const type = POWER_UP_TYPES[getRandomIndex(POWER_UP_TYPES.length, random)];
  const position = spawnFreeCell(board, snake, blockedPoints, random);
  if (!position) {
    return null;
  }
  return { type, position };
};

export function createInitialGameState(
  options: CreateInitialGameStateOptions = {}
): GameState {
  const board = options.board ?? DEFAULT_BOARD;
  ensureValidBoard(board);
  const gameMode = options.gameMode ?? "classic";
  const timeRemainingMs = normalizeTimeRemainingMs(gameMode, options.timeRemainingMs);

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
  let initialFood: Point | null = null;
  if (
    requestedInitialFood &&
    isInBounds(requestedInitialFood, board) &&
    !isOnSnake(requestedInitialFood, snake)
  ) {
    initialFood = requestedInitialFood;
  } else {
    const spawnedInitialFood = spawnFood(board, snake, random);
    initialFood =
      spawnedInitialFood &&
      isInBounds(spawnedInitialFood, board) &&
      !isOnSnake(spawnedInitialFood, snake)
        ? spawnedInitialFood
        : spawnFreeCell(board, snake, [], random);
  }

  if (!initialFood) {
    return toGameState({
      board,
      gameMode,
      endReason: null,
      timeRemainingMs,
      snake,
      direction,
      pendingDirection: null,
      wallMode,
      activePowerUps: [],
      boardPowerUps: [],
      food: snake[0],
      extraFoods: [],
      score: 0,
      bestScore,
      status: "game-over"
    });
  }

  const initialExtraFoods = sanitizeExtraFoods(
    options.initialExtraFoods,
    board,
    snake,
    initialFood
  );

  const rawActivePowerUps = options.activePowerUps ??
    (options.activePowerUp ? [options.activePowerUp] : []);
  const activePowerUps = sanitizeActivePowerUps(gameMode, rawActivePowerUps);

  const rawBoardPowerUps = options.boardPowerUps ??
    (options.boardPowerUp ? [options.boardPowerUp] : []);
  const boardPowerUps = sanitizeBoardPowerUps(
    gameMode,
    rawBoardPowerUps,
    board,
    snake,
    initialFood,
    initialExtraFoods
  );

  const extraFoods = hasActivePowerUp(activePowerUps, "feast")
    ? ensureFeastTemporaryFoods(
        initialExtraFoods,
        board,
        snake,
        initialFood,
        boardPowerUps,
        random
      )
    : [];

  return toGameState({
    board,
    gameMode,
    endReason: null,
    timeRemainingMs,
    snake,
    direction,
    pendingDirection: null,
    wallMode,
    activePowerUps,
    boardPowerUps: gameMode === "classic" && activePowerUps.length > 0 ? [] : boardPowerUps,
    food: initialFood,
    extraFoods,
    score: 0,
    bestScore,
    status: "running"
  });
}

export function getTickIntervalForScore(score: number): number {
  const safeScore = Math.max(0, Math.floor(score));
  const steps = Math.floor(safeScore / SPEED_STEP_SCORE);
  const interval = START_TICK_MS - steps * SPEED_STEP_MS;
  return Math.max(MIN_TICK_MS, interval);
}

export function getTimeAttackTickIntervalForScore(score: number): number {
  const safeScore = Math.max(0, Math.floor(score));
  const steps = Math.floor(safeScore / SPEED_STEP_SCORE);
  return START_TICK_MS * Math.pow(TIME_ATTACK_SPEED_DECAY_PER_STEP, steps);
}

export function getEffectiveTickInterval(state: GameState): number {
  const baseInterval =
    state.gameMode === "time-attack"
      ? getTimeAttackTickIntervalForScore(state.score)
      : getTickIntervalForScore(state.score);
  if (hasActivePowerUp(state.activePowerUps, "slow")) {
    return baseInterval * SLOW_TICK_MULTIPLIER;
  }
  return baseInterval;
}

export function elapseTime(state: GameState, elapsedMs: number): GameState {
  if (state.status !== "running" || state.gameMode !== "time-attack") {
    return state;
  }

  const previousRemaining = state.timeRemainingMs ?? TIME_ATTACK_DURATION_MS;
  const nextRemaining = Math.max(0, previousRemaining - elapsedMs);
  if (nextRemaining > 0) {
    return toGameState({
      ...state,
      timeRemainingMs: nextRemaining
    });
  }

  return toGameState({
    ...state,
    timeRemainingMs: 0,
    status: "game-over",
    endReason: "time-expired",
    pendingDirection: null
  });
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

  return toGameState({ ...state, pendingDirection: requestedDirection });
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
  const spawnPowerUp = options.spawnPowerUp ?? spawnPowerUpAtRandomFreeCell;
  const direction = state.pendingDirection ?? state.direction;
  const currentHead = state.snake[0];
  const candidateHead = movePoint(currentHead, direction);
  const nextHead =
    state.wallMode === "wrap"
      ? wrapPointToBoard(candidateHead, state.board)
      : candidateHead;

  if (state.wallMode === "solid" && !isInBounds(nextHead, state.board)) {
    return toGameState({
      ...state,
      direction,
      pendingDirection: null,
      status: "game-over",
      endReason: "collision"
    });
  }

  const consumedNormalFood = pointsEqual(nextHead, state.food);
  const consumedExtraFoodIndex = state.extraFoods.findIndex((food) =>
    pointsEqual(food, nextHead)
  );
  const eatsFood = consumedNormalFood || consumedExtraFoodIndex >= 0;
  const collisionBody = eatsFood ? state.snake : state.snake.slice(0, -1);
  const hasSelfCollision = hasActivePowerUp(state.activePowerUps, "ghost")
    ? false
    : collisionBody.some((segment) => pointsEqual(segment, nextHead));

  if (hasSelfCollision) {
    return toGameState({
      ...state,
      direction,
      pendingDirection: null,
      status: "game-over",
      endReason: "collision"
    });
  }

  let nextSnake = [nextHead, ...state.snake];
  let nextScore = state.score;
  let nextFood = state.food;
  let nextExtraFoods = [...state.extraFoods];
  let nextBoardPowerUps = decrementBoardPowerUps(state.boardPowerUps);
  let nextActivePowerUps = decrementActivePowerUps(state.activePowerUps);
  let nextStatus: GameState["status"] = "running";

  if (consumedExtraFoodIndex >= 0) {
    nextExtraFoods.splice(consumedExtraFoodIndex, 1);
  }

  if (eatsFood) {
    nextScore += 1;

    if (consumedNormalFood) {
      const spawnedFood = spawnNormalFood(
        state.board,
        nextSnake,
        nextExtraFoods,
        nextBoardPowerUps,
        random,
        spawnFood
      );

      if (spawnedFood) {
        nextFood = spawnedFood;
      } else {
        nextStatus = "game-over";
        nextFood = nextHead;
      }
    }
  } else {
    nextSnake = nextSnake.slice(0, -1);
  }

  if (
    nextStatus === "running" &&
    hasActivePowerUp(nextActivePowerUps, "magnet")
  ) {
    const boardPowerUpPoints = nextBoardPowerUps.map((item) => item.position);

    if (consumedNormalFood === false) {
      nextFood = pullFoodTowardHead(
        nextFood,
        nextHead,
        nextSnake,
        state.board,
        [
          ...nextExtraFoods,
          ...boardPowerUpPoints
        ]
      );
    }

    if (nextExtraFoods.length > 0) {
      nextExtraFoods = pullFoodsTowardHead(
        nextExtraFoods,
        nextHead,
        nextSnake,
        state.board,
        [nextFood, ...boardPowerUpPoints]
      );
    }
  }

  const collectedPowerUpIndex = nextBoardPowerUps.findIndex((powerUp) =>
    pointsEqual(powerUp.position, nextHead)
  );
  if (collectedPowerUpIndex >= 0) {
    const collectedPowerUp = nextBoardPowerUps[collectedPowerUpIndex];
    nextBoardPowerUps.splice(collectedPowerUpIndex, 1);
    nextActivePowerUps = addOrExtendActivePowerUp(
      state.gameMode,
      nextActivePowerUps,
      collectedPowerUp.type
    );
  }

  if (hasActivePowerUp(nextActivePowerUps, "feast")) {
    nextExtraFoods = ensureFeastTemporaryFoods(
      nextExtraFoods,
      state.board,
      nextSnake,
      nextFood,
      nextBoardPowerUps,
      random
    );
  } else if (nextExtraFoods.length > 0) {
    nextExtraFoods = [];
  }

  if (
    eatsFood &&
    nextStatus === "running" &&
    nextBoardPowerUps.length < getPowerUpBoardCap(state.gameMode) &&
    (state.gameMode === "time-attack" || nextActivePowerUps.length === 0) &&
    normalizeRandom(random) < getPowerUpSpawnChance(state.gameMode)
  ) {
    const blockedPoints = [
      nextFood,
      ...nextExtraFoods,
      ...nextBoardPowerUps.map((item) => item.position)
    ];
    const spawnedPowerUp = spawnPowerUp(state.board, nextSnake, blockedPoints, random);
    if (
      spawnedPowerUp &&
      !hasPoint(blockedPoints, spawnedPowerUp.position) &&
      !isOnSnake(spawnedPowerUp.position, nextSnake)
    ) {
      nextBoardPowerUps.push({
        type: spawnedPowerUp.type,
        position: spawnedPowerUp.position,
        remainingSteps: POWER_UP_BOARD_DURATION_STEPS
      });
    }
  }

  const bestScore = Math.max(state.bestScore, nextScore);

  return toGameState({
    ...state,
    endReason: null,
    direction,
    pendingDirection: null,
    snake: nextSnake,
    activePowerUps: nextActivePowerUps,
    boardPowerUps: nextBoardPowerUps,
    food: nextFood,
    extraFoods: nextExtraFoods,
    score: nextScore,
    bestScore,
    status: nextStatus
  });
}
