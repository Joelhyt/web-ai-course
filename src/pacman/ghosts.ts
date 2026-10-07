import {
  PACMAN_CLASSIC_MAZE,
  getGhostReleasePath,
  getGhostReturnPath,
  getGhostSpawns,
  getMazeTile,
  getRawNeighbor,
  normalizeTunnelPosition
} from "./maze";
import type {
  Direction,
  GhostId,
  MazePosition,
  MazeTileKind,
  PacmanMazeDefinition
} from "./types";

export type GhostMode = "scatter" | "chase" | "frightened" | "eaten-returning";

export type GhostBaseMode = Extract<GhostMode, "scatter" | "chase">;

export type GhostHouseState = "in-house" | "releasing" | "active";

export type GhostReleasePathKind = "initial" | "respawn";

export interface GhostState {
  readonly id: GhostId;
  readonly position: MazePosition;
  readonly direction: Direction;
  readonly mode: GhostMode;
  readonly houseState: GhostHouseState;
  readonly frightenedTicksRemaining: number;
  readonly pendingReverse: boolean;
  readonly releasePathKind: GhostReleasePathKind;
  readonly releasePathIndex: number;
  readonly respawnReleaseTick: number | null;
}

export type GhostRoster = Readonly<Record<GhostId, GhostState>>;

export interface GhostModePhase {
  readonly mode: GhostBaseMode;
  readonly durationTicks: number;
}

export interface GhostModeSchedule {
  readonly phases: readonly GhostModePhase[];
}

export interface GhostReleaseConfig {
  readonly initialReleaseTicks: Readonly<Record<GhostId, number>>;
  readonly respawnDelayTicks: number;
}

export interface GhostSpeedConfig {
  readonly baseMultiplier: number;
  readonly frightenedMultiplier: number;
  readonly eatenReturningMultiplier: number;
  readonly tunnelMultiplier: number;
}

export interface GhostTargetConfig {
  readonly pinkyLookAheadTiles: number;
  readonly inkyLookAheadTiles: number;
  readonly clydeScatterDistance: number;
}

export interface PacmanSnapshot {
  readonly position: MazePosition;
  readonly direction: Direction;
}

export interface ComputeGhostTargetInput {
  readonly ghostId: GhostId;
  readonly mode: GhostMode;
  readonly ghostPosition: MazePosition;
  readonly pacmanPosition: MazePosition;
  readonly pacmanDirection: Direction;
  readonly blinkyPosition: MazePosition;
  readonly maze?: PacmanMazeDefinition;
  readonly targetConfig?: Partial<GhostTargetConfig>;
}

export interface SelectNextGhostDirectionInput {
  readonly ghostId: GhostId;
  readonly position: MazePosition;
  readonly currentDirection: Direction;
  readonly mode: GhostMode;
  readonly houseState: GhostHouseState;
  readonly target: MazePosition;
  readonly maze?: PacmanMazeDefinition;
  readonly allowReverse?: boolean;
  readonly frightenedFleeFrom?: MazePosition;
}

export interface AdvanceGhostsInput {
  readonly ghosts: GhostRoster;
  readonly pacman: PacmanSnapshot;
  readonly tick: number;
  readonly maze?: PacmanMazeDefinition;
  readonly modeSchedule?: GhostModeSchedule;
  readonly releaseConfig?: GhostReleaseConfig;
  readonly speedConfig?: Partial<GhostSpeedConfig>;
  readonly triggerFrightened?: boolean;
  readonly frightenedDurationTicks?: number;
  readonly targetConfig?: Partial<GhostTargetConfig>;
}

export interface AdvanceGhostsResult {
  readonly ghosts: GhostRoster;
  readonly scheduledMode: GhostBaseMode;
}

export interface ResolvePacmanGhostCollisionsInput {
  readonly ghosts: GhostRoster;
  readonly pacmanPosition: MazePosition;
  readonly pacmanPreviousPosition?: MazePosition;
  readonly ghostPreviousPositions?: Partial<Record<GhostId, MazePosition>>;
  readonly frightenedCombo: number;
  readonly comboProgression?: (currentCombo: number) => number;
}

export type GhostCollisionEvent =
  | {
      readonly type: "pacman-caught";
      readonly ghostId: GhostId;
    }
  | {
      readonly type: "ghost-eaten";
      readonly ghostId: GhostId;
      readonly comboLevel: number;
    };

export interface ResolvePacmanGhostCollisionsResult {
  readonly ghosts: GhostRoster;
  readonly events: readonly GhostCollisionEvent[];
  readonly pacmanCaught: boolean;
  readonly frightenedCombo: number;
}

const DIRECTION_PRIORITY: Readonly<Record<Direction, number>> = {
  up: 0,
  left: 1,
  down: 2,
  right: 3
};

const REVERSE_DIRECTION: Readonly<Record<Direction, Direction>> = {
  up: "down",
  down: "up",
  left: "right",
  right: "left"
};

export const GHOST_IDS: readonly GhostId[] = ["blinky", "pinky", "inky", "clyde"];

export const DEFAULT_GHOST_MODE_SCHEDULE: GhostModeSchedule = {
  phases: [
    { mode: "scatter", durationTicks: 7 * 60 },
    { mode: "chase", durationTicks: 20 * 60 },
    { mode: "scatter", durationTicks: 7 * 60 },
    { mode: "chase", durationTicks: 20 * 60 },
    { mode: "scatter", durationTicks: 5 * 60 },
    { mode: "chase", durationTicks: Number.POSITIVE_INFINITY }
  ]
};

export const DEFAULT_GHOST_RELEASE_CONFIG: GhostReleaseConfig = {
  initialReleaseTicks: {
    blinky: 0,
    pinky: 0,
    inky: 60,
    clyde: 180
  },
  respawnDelayTicks: 30
};

export const DEFAULT_GHOST_SPEED_CONFIG: GhostSpeedConfig = {
  baseMultiplier: 1,
  frightenedMultiplier: 0.75,
  eatenReturningMultiplier: 1.6,
  tunnelMultiplier: 0.8
};

export const DEFAULT_GHOST_TARGET_CONFIG: GhostTargetConfig = {
  pinkyLookAheadTiles: 4,
  inkyLookAheadTiles: 2,
  clydeScatterDistance: 8
};

function clonePosition(position: MazePosition): MazePosition {
  return { x: position.x, y: position.y };
}

function cloneGhostState(ghost: GhostState): GhostState {
  return {
    ...ghost,
    position: clonePosition(ghost.position)
  };
}

function positionsEqual(a: MazePosition, b: MazePosition): boolean {
  return a.x === b.x && a.y === b.y;
}

function squaredDistance(a: MazePosition, b: MazePosition): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

function manhattanDistance(a: MazePosition, b: MazePosition): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

function isGhostHouseTile(tile: MazeTileKind | null): boolean {
  return tile === "ghost-house" || tile === "ghost-door";
}

function canGhostEnterTile(
  tile: MazeTileKind | null,
  mode: GhostMode,
  houseState: GhostHouseState
): boolean {
  if (tile === null || tile === "wall") {
    return false;
  }

  if (!isGhostHouseTile(tile)) {
    return true;
  }

  if (mode === "eaten-returning") {
    return true;
  }

  return houseState !== "active";
}

function getGhostNeighbor(
  maze: PacmanMazeDefinition,
  from: MazePosition,
  direction: Direction,
  mode: GhostMode,
  houseState: GhostHouseState
): MazePosition | null {
  const raw = getRawNeighbor(from, direction);
  const normalized = normalizeTunnelPosition(maze, raw);

  if (normalized === null) {
    return null;
  }

  const tile = getMazeTile(maze, normalized);
  return canGhostEnterTile(tile, mode, houseState) ? normalized : null;
}

function getAvailableGhostDirections(
  maze: PacmanMazeDefinition,
  position: MazePosition,
  mode: GhostMode,
  houseState: GhostHouseState
): readonly Direction[] {
  const directions: Direction[] = [];

  for (const direction of ["up", "left", "down", "right"] as const) {
    if (getGhostNeighbor(maze, position, direction, mode, houseState) !== null) {
      directions.push(direction);
    }
  }

  return directions;
}

function getTargetConfig(overrides?: Partial<GhostTargetConfig>): GhostTargetConfig {
  return {
    ...DEFAULT_GHOST_TARGET_CONFIG,
    ...overrides
  };
}

function projectDirection(
  start: MazePosition,
  direction: Direction,
  steps: number,
  maze: PacmanMazeDefinition
): MazePosition {
  let current = clonePosition(start);

  for (let index = 0; index < steps; index += 1) {
    const raw = getRawNeighbor(current, direction);
    const normalized = normalizeTunnelPosition(maze, raw);
    current = normalized ?? raw;
  }

  return current;
}

export function reverseDirection(direction: Direction): Direction {
  return REVERSE_DIRECTION[direction];
}

export function createInitialGhostStates(
  maze: PacmanMazeDefinition = PACMAN_CLASSIC_MAZE
): GhostRoster {
  const spawns = getGhostSpawns(maze);

  return {
    blinky: {
      id: "blinky",
      position: clonePosition(spawns.blinky),
      direction: "left",
      mode: "scatter",
      houseState: "in-house",
      frightenedTicksRemaining: 0,
      pendingReverse: false,
      releasePathKind: "initial",
      releasePathIndex: 0,
      respawnReleaseTick: null
    },
    pinky: {
      id: "pinky",
      position: clonePosition(spawns.pinky),
      direction: "left",
      mode: "scatter",
      houseState: "in-house",
      frightenedTicksRemaining: 0,
      pendingReverse: false,
      releasePathKind: "initial",
      releasePathIndex: 0,
      respawnReleaseTick: null
    },
    inky: {
      id: "inky",
      position: clonePosition(spawns.inky),
      direction: "up",
      mode: "scatter",
      houseState: "in-house",
      frightenedTicksRemaining: 0,
      pendingReverse: false,
      releasePathKind: "initial",
      releasePathIndex: 0,
      respawnReleaseTick: null
    },
    clyde: {
      id: "clyde",
      position: clonePosition(spawns.clyde),
      direction: "up",
      mode: "scatter",
      houseState: "in-house",
      frightenedTicksRemaining: 0,
      pendingReverse: false,
      releasePathKind: "initial",
      releasePathIndex: 0,
      respawnReleaseTick: null
    }
  };
}

export function getScheduledGhostMode(
  elapsedTicks: number,
  schedule: GhostModeSchedule = DEFAULT_GHOST_MODE_SCHEDULE
): GhostBaseMode {
  if (schedule.phases.length === 0) {
    return "chase";
  }

  let remaining = Math.max(0, elapsedTicks);

  for (const phase of schedule.phases) {
    if (remaining < phase.durationTicks) {
      return phase.mode;
    }

    if (!Number.isFinite(phase.durationTicks)) {
      return phase.mode;
    }

    remaining -= phase.durationTicks;
  }

  return schedule.phases[schedule.phases.length - 1].mode;
}

export function computeGhostTarget({
  ghostId,
  mode,
  ghostPosition,
  pacmanPosition,
  pacmanDirection,
  blinkyPosition,
  maze = PACMAN_CLASSIC_MAZE,
  targetConfig
}: ComputeGhostTargetInput): MazePosition {
  const config = getTargetConfig(targetConfig);

  if (mode === "scatter" || mode === "frightened") {
    return clonePosition(maze.scatterTargets[ghostId]);
  }

  if (mode === "eaten-returning") {
    return clonePosition(maze.ghostHouse.returnAnchor);
  }

  if (ghostId === "blinky") {
    return clonePosition(pacmanPosition);
  }

  if (ghostId === "pinky") {
    return projectDirection(pacmanPosition, pacmanDirection, config.pinkyLookAheadTiles, maze);
  }

  if (ghostId === "inky") {
    const lookAhead = projectDirection(
      pacmanPosition,
      pacmanDirection,
      config.inkyLookAheadTiles,
      maze
    );

    return {
      x: lookAhead.x * 2 - blinkyPosition.x,
      y: lookAhead.y * 2 - blinkyPosition.y
    };
  }

  const clydeDistance = manhattanDistance(ghostPosition, pacmanPosition);
  if (clydeDistance >= config.clydeScatterDistance) {
    return clonePosition(pacmanPosition);
  }

  return clonePosition(maze.scatterTargets.clyde);
}

function directionPriority(direction: Direction): number {
  return DIRECTION_PRIORITY[direction];
}

function compareDirections(a: Direction, b: Direction): number {
  return directionPriority(a) - directionPriority(b);
}

export function selectNextGhostDirection({
  ghostId: _ghostId,
  position,
  currentDirection,
  mode,
  houseState,
  target,
  maze = PACMAN_CLASSIC_MAZE,
  allowReverse = false,
  frightenedFleeFrom
}: SelectNextGhostDirectionInput): Direction {
  const legalDirections = getAvailableGhostDirections(maze, position, mode, houseState);

  if (legalDirections.length === 0) {
    return currentDirection;
  }

  const reverse = reverseDirection(currentDirection);
  const forwardBlocked = !legalDirections.includes(currentDirection);

  let candidates = legalDirections;
  if (!allowReverse && !forwardBlocked && legalDirections.length > 1) {
    const filtered = legalDirections.filter((direction) => direction !== reverse);
    if (filtered.length > 0) {
      candidates = filtered;
    }
  }

  candidates = [...candidates].sort(compareDirections);

  const fleeFrom = frightenedFleeFrom ?? target;
  const chooseFarthest = mode === "frightened";

  let bestDirection = candidates[0];
  let bestMetric = chooseFarthest ? -Infinity : Infinity;

  for (const direction of candidates) {
    const neighbor = getGhostNeighbor(maze, position, direction, mode, houseState);
    if (neighbor === null) {
      continue;
    }

    const reference = chooseFarthest ? fleeFrom : target;
    const metric = squaredDistance(neighbor, reference);

    if (chooseFarthest) {
      if (metric > bestMetric) {
        bestMetric = metric;
        bestDirection = direction;
      }
      continue;
    }

    if (metric < bestMetric) {
      bestMetric = metric;
      bestDirection = direction;
    }
  }

  void _ghostId;
  return bestDirection;
}

function isTunnelLaneTile(maze: PacmanMazeDefinition, position: MazePosition): boolean {
  return position.y === maze.tunnel.left.y;
}

export function getGhostSpeedMultiplier(
  ghost: Pick<GhostState, "mode" | "position">,
  maze: PacmanMazeDefinition = PACMAN_CLASSIC_MAZE,
  speedConfig?: Partial<GhostSpeedConfig>
): number {
  const config: GhostSpeedConfig = {
    ...DEFAULT_GHOST_SPEED_CONFIG,
    ...speedConfig
  };

  let multiplier = config.baseMultiplier;

  if (ghost.mode === "frightened") {
    multiplier *= config.frightenedMultiplier;
  }

  if (ghost.mode === "eaten-returning") {
    multiplier *= config.eatenReturningMultiplier;
  }

  if (isTunnelLaneTile(maze, ghost.position)) {
    multiplier *= config.tunnelMultiplier;
  }

  return multiplier;
}

export function computeGhostMovementSteps(tick: number, speedMultiplier: number): number {
  if (speedMultiplier <= 0) {
    return 0;
  }

  const before = Math.floor(tick * speedMultiplier);
  const after = Math.floor((tick + 1) * speedMultiplier);
  return Math.max(0, after - before);
}

function getReleasePathForGhost(
  ghostId: GhostId,
  pathKind: GhostReleasePathKind,
  maze: PacmanMazeDefinition
): readonly MazePosition[] {
  if (pathKind === "initial") {
    return getGhostReleasePath(ghostId, maze);
  }

  return [...getGhostReturnPath(maze)].reverse();
}

function getDirectionToNeighbor(
  from: MazePosition,
  to: MazePosition,
  fallback: Direction
): Direction {
  if (to.x > from.x) {
    return "right";
  }

  if (to.x < from.x) {
    return "left";
  }

  if (to.y > from.y) {
    return "down";
  }

  if (to.y < from.y) {
    return "up";
  }

  return fallback;
}

function findIndexInPath(path: readonly MazePosition[], position: MazePosition): number {
  const index = path.findIndex((tile) => positionsEqual(tile, position));
  return index >= 0 ? index : 0;
}

function maybeStartGhostRelease(
  ghost: GhostState,
  tick: number,
  releaseConfig: GhostReleaseConfig,
  maze: PacmanMazeDefinition
): GhostState {
  if (ghost.houseState !== "in-house") {
    return ghost;
  }

  const shouldReleaseInitially =
    ghost.releasePathKind === "initial" && tick >= releaseConfig.initialReleaseTicks[ghost.id];

  const shouldReleaseFromRespawn =
    ghost.releasePathKind === "respawn" &&
    (ghost.respawnReleaseTick === null || tick >= ghost.respawnReleaseTick);

  if (!shouldReleaseInitially && !shouldReleaseFromRespawn) {
    return ghost;
  }

  const path = getReleasePathForGhost(ghost.id, ghost.releasePathKind, maze);
  const releasePathIndex = findIndexInPath(path, ghost.position);

  return {
    ...ghost,
    houseState: "releasing",
    releasePathIndex
  };
}

function walkGhostReleasePath(ghost: GhostState, maze: PacmanMazeDefinition): GhostState {
  const path = getReleasePathForGhost(ghost.id, ghost.releasePathKind, maze);
  if (path.length === 0) {
    return {
      ...ghost,
      houseState: "active"
    };
  }

  const clampedIndex = Math.min(ghost.releasePathIndex, path.length - 1);
  if (!positionsEqual(ghost.position, path[clampedIndex])) {
    const correctedIndex = findIndexInPath(path, ghost.position);
    return {
      ...ghost,
      releasePathIndex: correctedIndex
    };
  }

  const nextIndex = Math.min(clampedIndex + 1, path.length - 1);
  const nextPosition = path[nextIndex];
  const nextDirection = getDirectionToNeighbor(ghost.position, nextPosition, ghost.direction);

  if (nextIndex >= path.length - 1) {
    return {
      ...ghost,
      position: clonePosition(nextPosition),
      direction: nextDirection,
      houseState: "active",
      releasePathIndex: nextIndex,
      releasePathKind: "initial",
      respawnReleaseTick: null
    };
  }

  return {
    ...ghost,
    position: clonePosition(nextPosition),
    direction: nextDirection,
    releasePathIndex: nextIndex
  };
}

function transitionModeForTick(
  ghost: GhostState,
  scheduledMode: GhostBaseMode,
  triggerFrightened: boolean,
  frightenedDurationTicks: number
): GhostState {
  if (ghost.mode === "eaten-returning") {
    return ghost;
  }

  if (triggerFrightened && ghost.houseState === "active") {
    const nextFrightenedTicks = Math.max(ghost.frightenedTicksRemaining, frightenedDurationTicks);

    return {
      ...ghost,
      mode: "frightened",
      frightenedTicksRemaining: nextFrightenedTicks,
      pendingReverse: ghost.pendingReverse || ghost.mode !== "frightened"
    };
  }

  if (ghost.frightenedTicksRemaining > 0) {
    const frightenedTicksRemaining = ghost.frightenedTicksRemaining - 1;

    if (frightenedTicksRemaining === 0) {
      return {
        ...ghost,
        mode: scheduledMode,
        frightenedTicksRemaining,
        pendingReverse: true
      };
    }

    return {
      ...ghost,
      mode: "frightened",
      frightenedTicksRemaining
    };
  }

  if (ghost.mode !== scheduledMode) {
    return {
      ...ghost,
      mode: scheduledMode,
      pendingReverse: true
    };
  }

  return {
    ...ghost,
    mode: scheduledMode
  };
}

function moveActiveGhost(
  ghost: GhostState,
  ghosts: GhostRoster,
  pacman: PacmanSnapshot,
  maze: PacmanMazeDefinition,
  targetConfig?: Partial<GhostTargetConfig>
): GhostState {
  const target = computeGhostTarget({
    ghostId: ghost.id,
    mode: ghost.mode,
    ghostPosition: ghost.position,
    pacmanPosition: pacman.position,
    pacmanDirection: pacman.direction,
    blinkyPosition: ghosts.blinky.position,
    maze,
    targetConfig
  });

  const nextDirection = selectNextGhostDirection({
    ghostId: ghost.id,
    position: ghost.position,
    currentDirection: ghost.direction,
    mode: ghost.mode,
    houseState: ghost.houseState,
    target,
    maze,
    allowReverse: ghost.pendingReverse,
    frightenedFleeFrom: pacman.position
  });

  const neighbor = getGhostNeighbor(
    maze,
    ghost.position,
    nextDirection,
    ghost.mode,
    ghost.houseState
  );

  if (neighbor === null) {
    return {
      ...ghost,
      pendingReverse: false
    };
  }

  return {
    ...ghost,
    position: clonePosition(neighbor),
    direction: nextDirection,
    pendingReverse: false
  };
}

export function advanceGhosts({
  ghosts,
  pacman,
  tick,
  maze = PACMAN_CLASSIC_MAZE,
  modeSchedule = DEFAULT_GHOST_MODE_SCHEDULE,
  releaseConfig = DEFAULT_GHOST_RELEASE_CONFIG,
  speedConfig,
  triggerFrightened = false,
  frightenedDurationTicks = 6 * 60,
  targetConfig
}: AdvanceGhostsInput): AdvanceGhostsResult {
  const scheduledMode = getScheduledGhostMode(tick, modeSchedule);

  const nextGhosts: Record<GhostId, GhostState> = {
    blinky: cloneGhostState(ghosts.blinky),
    pinky: cloneGhostState(ghosts.pinky),
    inky: cloneGhostState(ghosts.inky),
    clyde: cloneGhostState(ghosts.clyde)
  };

  for (const ghostId of GHOST_IDS) {
    let nextGhost = transitionModeForTick(
      nextGhosts[ghostId],
      scheduledMode,
      triggerFrightened,
      frightenedDurationTicks
    );

    const speedMultiplier = getGhostSpeedMultiplier(nextGhost, maze, speedConfig);
    const movementSteps = computeGhostMovementSteps(tick, speedMultiplier);

    for (let step = 0; step < movementSteps; step += 1) {
      nextGhost = maybeStartGhostRelease(nextGhost, tick, releaseConfig, maze);

      if (nextGhost.houseState === "in-house") {
        break;
      }

      if (nextGhost.houseState === "releasing") {
        nextGhost = walkGhostReleasePath(nextGhost, maze);
        continue;
      }

      nextGhost = moveActiveGhost(nextGhost, nextGhosts, pacman, maze, targetConfig);

      if (
        nextGhost.mode === "eaten-returning" &&
        positionsEqual(nextGhost.position, maze.ghostHouse.returnAnchor)
      ) {
        nextGhost = {
          ...nextGhost,
          mode: scheduledMode,
          houseState: "in-house",
          frightenedTicksRemaining: 0,
          pendingReverse: false,
          releasePathKind: "respawn",
          releasePathIndex: 0,
          respawnReleaseTick: tick + releaseConfig.respawnDelayTicks
        };
        break;
      }
    }

    nextGhosts[ghostId] = nextGhost;
  }

  return {
    ghosts: nextGhosts,
    scheduledMode
  };
}

export function defaultFrightenedComboProgression(currentCombo: number): number {
  return currentCombo + 1;
}

function collidesWithPacman(
  ghost: GhostState,
  pacmanPosition: MazePosition,
  pacmanPreviousPosition: MazePosition | undefined,
  ghostPreviousPosition: MazePosition | undefined
): boolean {
  if (positionsEqual(ghost.position, pacmanPosition)) {
    return true;
  }

  if (pacmanPreviousPosition === undefined || ghostPreviousPosition === undefined) {
    return false;
  }

  return (
    positionsEqual(ghostPreviousPosition, pacmanPosition) &&
    positionsEqual(ghost.position, pacmanPreviousPosition)
  );
}

export function resolvePacmanGhostCollisions({
  ghosts,
  pacmanPosition,
  pacmanPreviousPosition,
  ghostPreviousPositions,
  frightenedCombo,
  comboProgression = defaultFrightenedComboProgression
}: ResolvePacmanGhostCollisionsInput): ResolvePacmanGhostCollisionsResult {
  const nextGhosts: Record<GhostId, GhostState> = {
    blinky: cloneGhostState(ghosts.blinky),
    pinky: cloneGhostState(ghosts.pinky),
    inky: cloneGhostState(ghosts.inky),
    clyde: cloneGhostState(ghosts.clyde)
  };

  const events: GhostCollisionEvent[] = [];
  let pacmanCaught = false;
  let nextCombo = frightenedCombo;

  for (const ghostId of GHOST_IDS) {
    if (pacmanCaught) {
      break;
    }

    const ghost = nextGhosts[ghostId];
    const collided = collidesWithPacman(
      ghost,
      pacmanPosition,
      pacmanPreviousPosition,
      ghostPreviousPositions?.[ghostId]
    );

    if (!collided) {
      continue;
    }

    if (ghost.mode === "eaten-returning") {
      continue;
    }

    if (ghost.mode === "frightened") {
      nextCombo = comboProgression(nextCombo);
      nextGhosts[ghostId] = {
        ...ghost,
        mode: "eaten-returning",
        frightenedTicksRemaining: 0,
        pendingReverse: false,
        houseState: "active"
      };

      events.push({
        type: "ghost-eaten",
        ghostId,
        comboLevel: nextCombo
      });
      continue;
    }

    pacmanCaught = true;
    nextCombo = 0;
    events.push({
      type: "pacman-caught",
      ghostId
    });
  }

  return {
    ghosts: nextGhosts,
    events,
    pacmanCaught,
    frightenedCombo: nextCombo
  };
}
