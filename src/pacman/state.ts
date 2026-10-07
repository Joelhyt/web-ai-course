import {
  PACMAN_CLASSIC_MAZE,
  getInitialPelletState,
  getMovementNeighbor,
  getPacmanSpawn,
  toMazeTileKey
} from "./maze";
import {
  advanceGhosts,
  createInitialGhostStates,
  getScheduledGhostMode,
  resolvePacmanGhostCollisions,
  type GhostBaseMode,
  type GhostCollisionEvent,
  type GhostRoster
} from "./ghosts";
import type {
  Direction,
  GhostId,
  MazePosition,
  MazeTileKey,
  PacmanMazeDefinition
} from "./types";

export type PacmanStatus = "running" | "paused" | "game-over";

export interface PacmanPlayerState {
  readonly position: MazePosition;
  readonly direction: Direction | null;
  readonly queuedDirection: Direction | null;
}

export interface PacmanFruitState {
  readonly position: MazePosition;
  readonly active: boolean;
  readonly remainingMs: number;
  readonly spawnThresholds: readonly number[];
  readonly nextSpawnIndex: number;
}

export interface PacmanExternalCollisionInfo {
  readonly pacmanCaught?: boolean;
  readonly frightenedGhostsEaten?: number;
}

export interface PacmanState {
  readonly maze: PacmanMazeDefinition;
  readonly status: PacmanStatus;
  readonly round: number;
  readonly lives: number;
  readonly score: number;
  readonly bestScore: number;
  readonly candidateBestScore: number;
  readonly player: PacmanPlayerState;
  readonly ghosts: GhostRoster;
  readonly scheduledGhostMode: GhostBaseMode;
  readonly ghostTicksElapsed: number;
  readonly frightenedMsRemaining: number;
  readonly frightenedGhostChain: number;
  readonly remainingNormalPellets: ReadonlySet<MazeTileKey>;
  readonly remainingPowerPellets: ReadonlySet<MazeTileKey>;
  readonly pelletsRemaining: number;
  readonly pelletsEaten: number;
  readonly movementRemainderMs: number;
  readonly fruit: PacmanFruitState;
}

export interface CreateInitialPacmanStateOptions {
  readonly maze?: PacmanMazeDefinition;
  readonly bestScore?: number;
}

interface PacmanStepResult {
  readonly state: PacmanState;
  readonly pacmanPreviousPosition: MazePosition;
  readonly triggeredPowerPellet: boolean;
  readonly advancedRound: boolean;
}

const GHOST_IDS: readonly GhostId[] = ["blinky", "pinky", "inky", "clyde"];

export const INITIAL_PACMAN_LIVES = 3;
export const INITIAL_PACMAN_ROUND = 1;
export const NORMAL_PELLET_SCORE = 10;
export const POWER_PELLET_SCORE = 50;
export const BASE_FRIGHTENED_DURATION_MS = 6000;
export const FRIGHTENED_DURATION_DECREASE_PER_ROUND_MS = 500;
export const MIN_FRIGHTENED_DURATION_MS = 2000;
export const BASE_STEP_INTERVAL_MS = 200;
export const STEP_INTERVAL_DECREASE_PER_ROUND_MS = 8;
export const MIN_STEP_INTERVAL_MS = 110;
export const FRUIT_VISIBLE_DURATION_MS = 9000;
export const FRUIT_PROGRESS_MARKERS: readonly number[] = [0.3, 0.7];

const GHOST_EAT_SCORE_CHAIN: readonly number[] = [200, 400, 800, 1600];

const KEY_TO_DIRECTION: Readonly<Record<string, Direction>> = {
  ArrowUp: "up",
  ArrowRight: "right",
  ArrowDown: "down",
  ArrowLeft: "left",
  w: "up",
  d: "right",
  s: "down",
  a: "left",
  W: "up",
  D: "right",
  S: "down",
  A: "left"
};

export function createInitialPacmanState(
  options: CreateInitialPacmanStateOptions = {}
): PacmanState {
  const maze = options.maze ?? PACMAN_CLASSIC_MAZE;
  const pelletState = getInitialPelletState(maze);
  const bestScore = normalizeNonNegativeInteger(options.bestScore);

  return {
    maze,
    status: "running",
    round: INITIAL_PACMAN_ROUND,
    lives: INITIAL_PACMAN_LIVES,
    score: 0,
    bestScore,
    candidateBestScore: bestScore,
    player: {
      position: getPacmanSpawn(maze),
      direction: "left",
      queuedDirection: null
    },
    ghosts: createInitialGhostStates(maze),
    scheduledGhostMode: getScheduledGhostMode(0),
    ghostTicksElapsed: 0,
    frightenedMsRemaining: 0,
    frightenedGhostChain: 0,
    remainingNormalPellets: pelletState.normalPellets,
    remainingPowerPellets: pelletState.powerPellets,
    pelletsRemaining: pelletState.totalCount,
    pelletsEaten: 0,
    movementRemainderMs: 0,
    fruit: {
      position: maze.spawns.fruit,
      active: false,
      remainingMs: 0,
      spawnThresholds: getFruitSpawnThresholds(pelletState.totalCount),
      nextSpawnIndex: 0
    }
  };
}

export function getFrightenedDurationMs(round: number): number {
  const normalizedRound = normalizeRound(round);
  const duration =
    BASE_FRIGHTENED_DURATION_MS -
    (normalizedRound - 1) * FRIGHTENED_DURATION_DECREASE_PER_ROUND_MS;

  return Math.max(duration, MIN_FRIGHTENED_DURATION_MS);
}

export function getPacmanStepIntervalMs(round: number): number {
  const normalizedRound = normalizeRound(round);
  const interval =
    BASE_STEP_INTERVAL_MS -
    (normalizedRound - 1) * STEP_INTERVAL_DECREASE_PER_ROUND_MS;

  return Math.max(interval, MIN_STEP_INTERVAL_MS);
}

export function getFruitScoreForRound(round: number): number {
  const normalizedRound = normalizeRound(round);

  if (normalizedRound <= 1) {
    return 100;
  }

  if (normalizedRound === 2) {
    return 300;
  }

  if (normalizedRound <= 4) {
    return 500;
  }

  if (normalizedRound <= 6) {
    return 700;
  }

  if (normalizedRound <= 8) {
    return 1000;
  }

  if (normalizedRound <= 10) {
    return 2000;
  }

  if (normalizedRound <= 12) {
    return 3000;
  }

  return 5000;
}

export function getFruitSpawnThresholds(totalPellets: number): readonly number[] {
  const normalizedTotal = normalizeNonNegativeInteger(totalPellets);
  if (normalizedTotal <= 0) {
    return [];
  }

  const highestMeaningful = normalizedTotal > 1 ? normalizedTotal - 1 : 1;
  const thresholds = new Set<number>();

  for (const marker of FRUIT_PROGRESS_MARKERS) {
    const clampedMarker = Number.isFinite(marker)
      ? Math.min(Math.max(marker, 0), 1)
      : 0;
    const threshold = Math.max(
      1,
      Math.min(highestMeaningful, Math.floor(normalizedTotal * clampedMarker))
    );
    thresholds.add(threshold);
  }

  return [...thresholds].sort((a, b) => a - b);
}

export function normalizeDirectionInput(
  input: Direction | string
): Direction | null {
  if (Object.prototype.hasOwnProperty.call(KEY_TO_DIRECTION, input)) {
    return KEY_TO_DIRECTION[input];
  }

  if (
    input === "up" ||
    input === "right" ||
    input === "down" ||
    input === "left"
  ) {
    return input;
  }

  return null;
}

export function queueDirectionChange(
  state: PacmanState,
  input: Direction | string
): PacmanState {
  if (state.status === "game-over") {
    return state;
  }

  const direction = normalizeDirectionInput(input);
  if (direction === null || state.player.queuedDirection === direction) {
    return state;
  }

  return {
    ...state,
    player: {
      ...state.player,
      queuedDirection: direction
    }
  };
}

export function togglePause(state: PacmanState): PacmanState {
  if (state.status === "game-over") {
    return state;
  }

  return {
    ...state,
    status: state.status === "paused" ? "running" : "paused"
  };
}

export function restartRound(state: PacmanState): PacmanState {
  if (state.lives <= 0) {
    return {
      ...state,
      status: "game-over",
      player: {
        ...state.player,
        position: getPacmanSpawn(state.maze),
        direction: null,
        queuedDirection: null
      },
      ghosts: createInitialGhostStates(state.maze),
      scheduledGhostMode: getScheduledGhostMode(0),
      ghostTicksElapsed: 0,
      frightenedMsRemaining: 0,
      frightenedGhostChain: 0,
      movementRemainderMs: 0,
      fruit: {
        ...state.fruit,
        active: false,
        remainingMs: 0
      }
    };
  }

  return {
    ...state,
    status: "running",
    player: {
      position: getPacmanSpawn(state.maze),
      direction: "left",
      queuedDirection: null
    },
    ghosts: createInitialGhostStates(state.maze),
    scheduledGhostMode: getScheduledGhostMode(0),
    ghostTicksElapsed: 0,
    frightenedMsRemaining: 0,
    frightenedGhostChain: 0,
    movementRemainderMs: 0,
    fruit: {
      ...state.fruit,
      active: false,
      remainingMs: 0
    }
  };
}

export function restartGame(state: PacmanState): PacmanState {
  return createInitialPacmanState({
    maze: state.maze,
    bestScore: Math.max(state.bestScore, state.candidateBestScore)
  });
}

export function advancePacmanState(
  state: PacmanState,
  elapsedMs: number,
  externalCollisionInfo: PacmanExternalCollisionInfo = {}
): PacmanState {
  if (state.status !== "running") {
    return state;
  }

  const elapsed = normalizeNonNegativeInteger(elapsedMs);

  const collisionResolved = applyExternalCollision(state, externalCollisionInfo);
  if (collisionResolved.stop) {
    return collisionResolved.state;
  }

  let nextState = collisionResolved.state;

  if (elapsed <= 0) {
    return nextState;
  }

  nextState = advanceTimers(nextState, elapsed);

  const stepIntervalMs = getPacmanStepIntervalMs(nextState.round);
  let movementBudgetMs = nextState.movementRemainderMs + elapsed;

  while (movementBudgetMs >= stepIntervalMs && nextState.status === "running") {
    movementBudgetMs -= stepIntervalMs;

    const stepResult = stepPacman(nextState);
    nextState = stepResult.state;

    if (stepResult.advancedRound) {
      movementBudgetMs = 0;
      continue;
    }

    const ghostPreviousPositions = snapshotGhostPositions(nextState.ghosts);
    const frightenedDurationTicks = getFrightenedDurationTicks(nextState.round);
    const ghostAdvance = advanceGhosts({
      ghosts: nextState.ghosts,
      pacman: {
        position: nextState.player.position,
        direction: getPacmanDirectionForSnapshot(nextState.player)
      },
      tick: nextState.ghostTicksElapsed,
      maze: nextState.maze,
      triggerFrightened: stepResult.triggeredPowerPellet,
      frightenedDurationTicks
    });

    nextState = {
      ...nextState,
      ghosts: ghostAdvance.ghosts,
      scheduledGhostMode: ghostAdvance.scheduledMode,
      ghostTicksElapsed: nextState.ghostTicksElapsed + 1
    };

    const collisions = resolvePacmanGhostCollisions({
      ghosts: nextState.ghosts,
      pacmanPosition: nextState.player.position,
      pacmanPreviousPosition: stepResult.pacmanPreviousPosition,
      ghostPreviousPositions,
      frightenedCombo: nextState.frightenedGhostChain
    });

    nextState = applyCollisionEvents(nextState, collisions.events, collisions.frightenedCombo);

    if (collisions.pacmanCaught) {
      nextState = loseLife(nextState);
      movementBudgetMs = 0;
    }
  }

  return {
    ...nextState,
    movementRemainderMs: nextState.status === "running" ? movementBudgetMs : 0
  };
}

function applyExternalCollision(
  state: PacmanState,
  collision: PacmanExternalCollisionInfo
): { readonly state: PacmanState; readonly stop: boolean } {
  let nextState = state;

  const frightenedEats = normalizeNonNegativeInteger(collision.frightenedGhostsEaten);
  if (frightenedEats > 0 && nextState.frightenedMsRemaining > 0) {
    const simulatedEvents: GhostCollisionEvent[] = [];
    for (let index = 0; index < frightenedEats; index += 1) {
      simulatedEvents.push({
        type: "ghost-eaten",
        ghostId: "blinky",
        comboLevel: nextState.frightenedGhostChain + index + 1
      });
    }
    nextState = applyCollisionEvents(
      nextState,
      simulatedEvents,
      nextState.frightenedGhostChain + frightenedEats
    );
  }

  if (collision.pacmanCaught === true && nextState.frightenedMsRemaining <= 0) {
    return {
      state: loseLife(nextState),
      stop: true
    };
  }

  return {
    state: nextState,
    stop: false
  };
}

function applyCollisionEvents(
  state: PacmanState,
  events: readonly GhostCollisionEvent[],
  frightenedCombo: number
): PacmanState {
  if (events.length === 0) {
    return {
      ...state,
      frightenedGhostChain: frightenedCombo
    };
  }

  let scoreGain = 0;
  for (const event of events) {
    if (event.type !== "ghost-eaten") {
      continue;
    }

    const scoreIndex = Math.max(
      0,
      Math.min(GHOST_EAT_SCORE_CHAIN.length - 1, event.comboLevel - 1)
    );
    scoreGain += GHOST_EAT_SCORE_CHAIN[scoreIndex];
  }

  const scoredState = withScore(state, scoreGain);
  return {
    ...scoredState,
    frightenedGhostChain: frightenedCombo
  };
}

function snapshotGhostPositions(
  ghosts: GhostRoster
): Readonly<Record<GhostId, MazePosition>> {
  return {
    blinky: clonePosition(ghosts.blinky.position),
    pinky: clonePosition(ghosts.pinky.position),
    inky: clonePosition(ghosts.inky.position),
    clyde: clonePosition(ghosts.clyde.position)
  };
}

function clonePosition(position: MazePosition): MazePosition {
  return {
    x: position.x,
    y: position.y
  };
}

function getFrightenedDurationTicks(round: number): number {
  const durationMs = getFrightenedDurationMs(round);
  const tickMs = getPacmanStepIntervalMs(round);
  return Math.max(1, Math.ceil(durationMs / tickMs));
}

function getPacmanDirectionForSnapshot(player: PacmanPlayerState): Direction {
  return player.direction ?? player.queuedDirection ?? "left";
}

function clearExpiredFrightenedGhostModes(state: PacmanState): GhostRoster {
  if (state.frightenedMsRemaining > 0) {
    return state.ghosts;
  }

  const scheduledMode = state.scheduledGhostMode;
  const cleared: Record<GhostId, GhostRoster[GhostId]> = {
    blinky: state.ghosts.blinky,
    pinky: state.ghosts.pinky,
    inky: state.ghosts.inky,
    clyde: state.ghosts.clyde
  };

  for (const ghostId of GHOST_IDS) {
    const ghost = state.ghosts[ghostId];
    if (ghost.mode !== "frightened") {
      continue;
    }

    cleared[ghostId] = {
      ...ghost,
      mode: scheduledMode,
      frightenedTicksRemaining: 0,
      pendingReverse: true
    };
  }

  return cleared;
}

function loseLife(state: PacmanState): PacmanState {
  const lives = Math.max(0, state.lives - 1);

  if (lives <= 0) {
    return {
      ...state,
      lives,
      status: "game-over",
      player: {
        ...state.player,
        direction: null,
        queuedDirection: null
      },
      frightenedMsRemaining: 0,
      frightenedGhostChain: 0,
      movementRemainderMs: 0,
      fruit: {
        ...state.fruit,
        active: false,
        remainingMs: 0
      }
    };
  }

  return restartRound({
    ...state,
    lives
  });
}

function advanceTimers(state: PacmanState, elapsedMs: number): PacmanState {
  const frightenedRemaining = Math.max(0, state.frightenedMsRemaining - elapsedMs);
  const fruitRemaining = state.fruit.active
    ? Math.max(0, state.fruit.remainingMs - elapsedMs)
    : 0;

  const nextState = {
    ...state,
    frightenedMsRemaining: frightenedRemaining,
    frightenedGhostChain: frightenedRemaining > 0 ? state.frightenedGhostChain : 0,
    fruit: {
      ...state.fruit,
      active: state.fruit.active && fruitRemaining > 0,
      remainingMs: state.fruit.active ? fruitRemaining : 0
    }
  };

  return {
    ...nextState,
    ghosts: clearExpiredFrightenedGhostModes(nextState)
  };
}

function stepPacman(state: PacmanState): PacmanStepResult {
  const pacmanPreviousPosition = state.player.position;
  const activeDirection = resolveDirectionForCurrentTile(state);

  if (activeDirection === null) {
    return {
      state: {
        ...state,
        player: {
          ...state.player,
          direction: null
        }
      },
      pacmanPreviousPosition,
      triggeredPowerPellet: false,
      advancedRound: false
    };
  }

  const destination = getMovementNeighbor(
    state.maze,
    state.player.position,
    activeDirection,
    "pacman"
  );

  if (destination === null) {
    return {
      state: {
        ...state,
        player: {
          ...state.player,
          direction: null
        }
      },
      pacmanPreviousPosition,
      triggeredPowerPellet: false,
      advancedRound: false
    };
  }

  let nextState: PacmanState = {
    ...state,
    player: {
      position: destination,
      direction: activeDirection,
      queuedDirection:
        state.player.queuedDirection === activeDirection
          ? null
          : state.player.queuedDirection
    }
  };

  const collected = collectTileItems(nextState);
  nextState = collected.state;

  if (nextState.pelletsRemaining <= 0) {
    return {
      state: advanceToNextRound(nextState),
      pacmanPreviousPosition,
      triggeredPowerPellet: collected.powerPelletCollected,
      advancedRound: true
    };
  }

  return {
    state: maybeSpawnFruit(nextState),
    pacmanPreviousPosition,
    triggeredPowerPellet: collected.powerPelletCollected,
    advancedRound: false
  };
}

function resolveDirectionForCurrentTile(state: PacmanState): Direction | null {
  const queued = state.player.queuedDirection;

  if (queued !== null) {
    const queuedDestination = getMovementNeighbor(
      state.maze,
      state.player.position,
      queued,
      "pacman"
    );
    if (queuedDestination !== null) {
      return queued;
    }
  }

  const currentDirection = state.player.direction;
  if (currentDirection === null) {
    return null;
  }

  const destination = getMovementNeighbor(
    state.maze,
    state.player.position,
    currentDirection,
    "pacman"
  );

  return destination === null ? null : currentDirection;
}

function collectTileItems(state: PacmanState): {
  readonly state: PacmanState;
  readonly powerPelletCollected: boolean;
} {
  const tileKey = toMazeTileKey(state.player.position);
  let nextState = state;
  let powerPelletCollected = false;

  if (state.remainingNormalPellets.has(tileKey)) {
    const remainingNormalPellets = new Set(state.remainingNormalPellets);
    remainingNormalPellets.delete(tileKey);
    nextState = withScore(
      {
        ...nextState,
        remainingNormalPellets,
        pelletsRemaining: Math.max(0, nextState.pelletsRemaining - 1),
        pelletsEaten: nextState.pelletsEaten + 1
      },
      NORMAL_PELLET_SCORE
    );
  } else if (state.remainingPowerPellets.has(tileKey)) {
    powerPelletCollected = true;
    const remainingPowerPellets = new Set(state.remainingPowerPellets);
    remainingPowerPellets.delete(tileKey);
    nextState = withScore(
      {
        ...nextState,
        remainingPowerPellets,
        pelletsRemaining: Math.max(0, nextState.pelletsRemaining - 1),
        pelletsEaten: nextState.pelletsEaten + 1,
        frightenedMsRemaining: getFrightenedDurationMs(nextState.round),
        frightenedGhostChain: 0
      },
      POWER_PELLET_SCORE
    );
  }

  if (
    nextState.fruit.active &&
    samePosition(nextState.player.position, nextState.fruit.position)
  ) {
    nextState = withScore(
      {
        ...nextState,
        fruit: {
          ...nextState.fruit,
          active: false,
          remainingMs: 0
        }
      },
      getFruitScoreForRound(nextState.round)
    );
  }

  return { state: nextState, powerPelletCollected };
}

function maybeSpawnFruit(state: PacmanState): PacmanState {
  if (state.fruit.active) {
    return state;
  }

  const threshold = state.fruit.spawnThresholds[state.fruit.nextSpawnIndex];
  if (threshold === undefined || state.pelletsEaten < threshold) {
    return state;
  }

  return {
    ...state,
    fruit: {
      ...state.fruit,
      active: true,
      remainingMs: FRUIT_VISIBLE_DURATION_MS,
      nextSpawnIndex: state.fruit.nextSpawnIndex + 1
    }
  };
}

function advanceToNextRound(state: PacmanState): PacmanState {
  const nextRound = state.round + 1;
  const pelletState = getInitialPelletState(state.maze);

  return {
    ...state,
    round: nextRound,
    player: {
      position: getPacmanSpawn(state.maze),
      direction: "left",
      queuedDirection: null
    },
    ghosts: createInitialGhostStates(state.maze),
    scheduledGhostMode: getScheduledGhostMode(0),
    ghostTicksElapsed: 0,
    frightenedMsRemaining: 0,
    frightenedGhostChain: 0,
    remainingNormalPellets: pelletState.normalPellets,
    remainingPowerPellets: pelletState.powerPellets,
    pelletsRemaining: pelletState.totalCount,
    pelletsEaten: 0,
    movementRemainderMs: 0,
    fruit: {
      ...state.fruit,
      active: false,
      remainingMs: 0,
      spawnThresholds: getFruitSpawnThresholds(pelletState.totalCount),
      nextSpawnIndex: 0
    }
  };
}

function withScore(state: PacmanState, scoreDelta: number): PacmanState {
  if (!Number.isFinite(scoreDelta) || scoreDelta <= 0) {
    return state;
  }

  const score = state.score + Math.floor(scoreDelta);
  return {
    ...state,
    score,
    candidateBestScore: Math.max(state.bestScore, state.candidateBestScore, score)
  };
}

function samePosition(a: MazePosition, b: MazePosition): boolean {
  return a.x === b.x && a.y === b.y;
}

function normalizeRound(round: number): number {
  if (!Number.isFinite(round)) {
    return INITIAL_PACMAN_ROUND;
  }

  return Math.max(INITIAL_PACMAN_ROUND, Math.floor(round));
}

function normalizeNonNegativeInteger(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.floor(value));
}
