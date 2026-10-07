import {
  PACMAN_CLASSIC_MAZE,
  getAvailableDirections,
  getGhostReleasePath,
  isIntersection,
  isTraversable
} from "./maze";
import {
  advanceGhosts,
  computeGhostMovementSteps,
  computeGhostTarget,
  createInitialGhostStates,
  getGhostSpeedMultiplier,
  getScheduledGhostMode,
  resolvePacmanGhostCollisions,
  reverseDirection,
  selectNextGhostDirection,
  type GhostRoster,
  type GhostState
} from "./ghosts";
import type { Direction, GhostId, MazePosition } from "./types";

describe("pacman ghost target models", () => {
  const blinkyPosition: MazePosition = { x: 12, y: 10 };
  const ghostPosition: MazePosition = { x: 14, y: 14 };

  it("targets Pac-Man directly for Blinky chase", () => {
    const pacmanPosition = { x: 20, y: 7 };

    const target = computeGhostTarget({
      ghostId: "blinky",
      mode: "chase",
      ghostPosition,
      pacmanPosition,
      pacmanDirection: "left",
      blinkyPosition,
      maze: PACMAN_CLASSIC_MAZE
    });

    expect(target).toEqual(pacmanPosition);
  });

  it("targets four tiles ahead for Pinky chase", () => {
    const target = computeGhostTarget({
      ghostId: "pinky",
      mode: "chase",
      ghostPosition,
      pacmanPosition: { x: 10, y: 10 },
      pacmanDirection: "right",
      blinkyPosition,
      maze: PACMAN_CLASSIC_MAZE
    });

    expect(target).toEqual({ x: 14, y: 10 });
  });

  it("targets vector projection for Inky chase", () => {
    const target = computeGhostTarget({
      ghostId: "inky",
      mode: "chase",
      ghostPosition,
      pacmanPosition: { x: 10, y: 10 },
      pacmanDirection: "up",
      blinkyPosition: { x: 8, y: 8 },
      maze: PACMAN_CLASSIC_MAZE
    });

    expect(target).toEqual({ x: 12, y: 8 });
  });

  it("switches Clyde between chase and scatter by distance", () => {
    const chaseTarget = computeGhostTarget({
      ghostId: "clyde",
      mode: "chase",
      ghostPosition: { x: 2, y: 2 },
      pacmanPosition: { x: 20, y: 20 },
      pacmanDirection: "left",
      blinkyPosition,
      maze: PACMAN_CLASSIC_MAZE
    });

    const scatterTarget = computeGhostTarget({
      ghostId: "clyde",
      mode: "chase",
      ghostPosition: { x: 8, y: 5 },
      pacmanPosition: { x: 10, y: 5 },
      pacmanDirection: "left",
      blinkyPosition,
      maze: PACMAN_CLASSIC_MAZE
    });

    expect(chaseTarget).toEqual({ x: 20, y: 20 });
    expect(scatterTarget).toEqual(PACMAN_CLASSIC_MAZE.scatterTargets.clyde);
  });
});

describe("pacman ghost movement and mode state machine", () => {
  it("computes deterministic scatter/chase scheduling", () => {
    const schedule = {
      phases: [
        { mode: "scatter", durationTicks: 2 },
        { mode: "chase", durationTicks: 3 }
      ]
    } as const;

    expect(getScheduledGhostMode(0, schedule)).toBe("scatter");
    expect(getScheduledGhostMode(1, schedule)).toBe("scatter");
    expect(getScheduledGhostMode(2, schedule)).toBe("chase");
    expect(getScheduledGhostMode(20, schedule)).toBe("chase");
  });

  it("avoids immediate reversal at intersections unless explicitly allowed", () => {
    const intersection = { x: 10, y: 9 };
    expect(isIntersection(PACMAN_CLASSIC_MAZE, intersection, "ghost")).toBe(true);

    const withoutReverse = selectNextGhostDirection({
      ghostId: "blinky",
      position: intersection,
      currentDirection: "right",
      mode: "chase",
      houseState: "active",
      target: { x: 0, y: 9 },
      maze: PACMAN_CLASSIC_MAZE,
      allowReverse: false
    });

    const withReverse = selectNextGhostDirection({
      ghostId: "blinky",
      position: intersection,
      currentDirection: "right",
      mode: "chase",
      houseState: "active",
      target: { x: 0, y: 9 },
      maze: PACMAN_CLASSIC_MAZE,
      allowReverse: true
    });

    expect(withoutReverse).toBe("up");
    expect(withReverse).toBe("left");
  });

  it("permits reversal when blocked in a dead end", () => {
    const deadEnd = findDeadEndTile();
    const [onlyDirection] = getAvailableDirections(PACMAN_CLASSIC_MAZE, deadEnd, "ghost");
    if (onlyDirection === undefined) {
      throw new Error("Expected exactly one dead-end direction.");
    }
    const currentDirection = reverseDirection(onlyDirection);

    const nextDirection = selectNextGhostDirection({
      ghostId: "blinky",
      position: deadEnd,
      currentDirection,
      mode: "chase",
      houseState: "active",
      target: PACMAN_CLASSIC_MAZE.scatterTargets.blinky,
      maze: PACMAN_CLASSIC_MAZE,
      allowReverse: false
    });

    expect(nextDirection).toBe(onlyDirection);
  });

  it("forces a reversal on scatter/chase mode switch", () => {
    const start = findHorizontalCorridorTile();
    const ghosts = createRoster({
      blinky: {
        position: start,
        direction: "right",
        mode: "scatter"
      }
    });

    const schedule = {
      phases: [
        { mode: "scatter", durationTicks: 1 },
        { mode: "chase", durationTicks: Number.POSITIVE_INFINITY }
      ]
    } as const;

    const { ghosts: nextGhosts } = advanceGhosts({
      ghosts,
      pacman: {
        position: { x: start.x - 4, y: start.y },
        direction: "left"
      },
      tick: 1,
      maze: PACMAN_CLASSIC_MAZE,
      modeSchedule: schedule,
      speedConfig: {
        baseMultiplier: 1,
        frightenedMultiplier: 1,
        eatenReturningMultiplier: 1,
        tunnelMultiplier: 1
      },
      releaseConfig: {
        initialReleaseTicks: {
          blinky: 0,
          pinky: 0,
          inky: 0,
          clyde: 0
        },
        respawnDelayTicks: 0
      }
    });

    expect(nextGhosts.blinky.mode).toBe("chase");
    expect(nextGhosts.blinky.direction).toBe("left");
  });

  it("applies frightened timers and returns to scheduled mode", () => {
    const ghosts = createRoster({
      blinky: {
        mode: "chase",
        frightenedTicksRemaining: 0,
        position: { x: 10, y: 9 },
        direction: "left"
      }
    });

    const modeSchedule = {
      phases: [{ mode: "chase", durationTicks: Number.POSITIVE_INFINITY }]
    } as const;

    const tick0 = advanceGhosts({
      ghosts,
      pacman: { position: { x: 22, y: 9 }, direction: "left" },
      tick: 0,
      maze: PACMAN_CLASSIC_MAZE,
      modeSchedule,
      triggerFrightened: true,
      frightenedDurationTicks: 2,
      speedConfig: {
        baseMultiplier: 1,
        frightenedMultiplier: 1,
        eatenReturningMultiplier: 1,
        tunnelMultiplier: 1
      }
    });

    const tick1 = advanceGhosts({
      ghosts: tick0.ghosts,
      pacman: { position: { x: 22, y: 9 }, direction: "left" },
      tick: 1,
      maze: PACMAN_CLASSIC_MAZE,
      modeSchedule,
      speedConfig: {
        baseMultiplier: 1,
        frightenedMultiplier: 1,
        eatenReturningMultiplier: 1,
        tunnelMultiplier: 1
      }
    });

    const tick2 = advanceGhosts({
      ghosts: tick1.ghosts,
      pacman: { position: { x: 22, y: 9 }, direction: "left" },
      tick: 2,
      maze: PACMAN_CLASSIC_MAZE,
      modeSchedule,
      speedConfig: {
        baseMultiplier: 1,
        frightenedMultiplier: 1,
        eatenReturningMultiplier: 1,
        tunnelMultiplier: 1
      }
    });

    expect(tick0.ghosts.blinky.mode).toBe("frightened");
    expect(tick0.ghosts.blinky.frightenedTicksRemaining).toBe(2);
    expect(tick1.ghosts.blinky.mode).toBe("frightened");
    expect(tick1.ghosts.blinky.frightenedTicksRemaining).toBe(1);
    expect(tick2.ghosts.blinky.mode).toBe("chase");
    expect(tick2.ghosts.blinky.frightenedTicksRemaining).toBe(0);
  });

  it("uses house metadata for release paths and eaten return transitions", () => {
    const initial = createInitialGhostStates(PACMAN_CLASSIC_MAZE);

    const tick0 = advanceGhosts({
      ghosts: initial,
      pacman: { position: { x: 13, y: 23 }, direction: "left" },
      tick: 0,
      maze: PACMAN_CLASSIC_MAZE,
      releaseConfig: {
        initialReleaseTicks: {
          blinky: 0,
          pinky: 999,
          inky: 999,
          clyde: 999
        },
        respawnDelayTicks: 0
      },
      speedConfig: {
        baseMultiplier: 1,
        frightenedMultiplier: 1,
        eatenReturningMultiplier: 1,
        tunnelMultiplier: 1
      }
    });

    const blinkyReleasePath = getGhostReleasePath("blinky", PACMAN_CLASSIC_MAZE);

    expect(tick0.ghosts.blinky.houseState).toBe("releasing");
    expect(tick0.ghosts.blinky.position).toEqual(blinkyReleasePath[1]);
    expect(tick0.ghosts.pinky.houseState).toBe("in-house");

    const tick1 = advanceGhosts({
      ghosts: tick0.ghosts,
      pacman: { position: { x: 13, y: 23 }, direction: "left" },
      tick: 1,
      maze: PACMAN_CLASSIC_MAZE,
      releaseConfig: {
        initialReleaseTicks: {
          blinky: 0,
          pinky: 999,
          inky: 999,
          clyde: 999
        },
        respawnDelayTicks: 0
      },
      speedConfig: {
        baseMultiplier: 1,
        frightenedMultiplier: 1,
        eatenReturningMultiplier: 1,
        tunnelMultiplier: 1
      }
    });

    expect(tick1.ghosts.blinky.houseState).toBe("active");
    expect(tick1.ghosts.blinky.position).toEqual(blinkyReleasePath[blinkyReleasePath.length - 1]);

    const eatenStart = createRoster({
      blinky: {
        position: { x: 13, y: 13 },
        direction: "down",
        mode: "eaten-returning"
      }
    });

    const returned = advanceGhosts({
      ghosts: eatenStart,
      pacman: { position: { x: 13, y: 23 }, direction: "left" },
      tick: 10,
      maze: PACMAN_CLASSIC_MAZE,
      modeSchedule: {
        phases: [{ mode: "chase", durationTicks: Number.POSITIVE_INFINITY }]
      },
      releaseConfig: {
        initialReleaseTicks: {
          blinky: 0,
          pinky: 0,
          inky: 0,
          clyde: 0
        },
        respawnDelayTicks: 0
      },
      speedConfig: {
        baseMultiplier: 1,
        frightenedMultiplier: 1,
        eatenReturningMultiplier: 1,
        tunnelMultiplier: 1
      }
    });

    expect(returned.ghosts.blinky.position).toEqual(PACMAN_CLASSIC_MAZE.ghostHouse.returnAnchor);
    expect(returned.ghosts.blinky.houseState).toBe("in-house");
    expect(returned.ghosts.blinky.releasePathKind).toBe("respawn");

    let respawned = returned;
    for (let tick = 11; tick <= 13; tick += 1) {
      respawned = advanceGhosts({
        ghosts: respawned.ghosts,
        pacman: { position: { x: 13, y: 23 }, direction: "left" },
        tick,
        maze: PACMAN_CLASSIC_MAZE,
        modeSchedule: {
          phases: [{ mode: "chase", durationTicks: Number.POSITIVE_INFINITY }]
        },
        releaseConfig: {
          initialReleaseTicks: {
            blinky: 0,
            pinky: 0,
            inky: 0,
            clyde: 0
          },
          respawnDelayTicks: 0
        },
        speedConfig: {
          baseMultiplier: 1,
          frightenedMultiplier: 1,
          eatenReturningMultiplier: 1,
          tunnelMultiplier: 1
        }
      });
    }

    expect(respawned.ghosts.blinky.houseState).toBe("active");
    expect(respawned.ghosts.blinky.position).toEqual(PACMAN_CLASSIC_MAZE.ghostHouse.releaseTile);
  });

  it("exposes tunnel speed multipliers and movement pacing hooks", () => {
    const tunnelGhost: Pick<GhostState, "mode" | "position"> = {
      mode: "chase",
      position: { x: 0, y: PACMAN_CLASSIC_MAZE.tunnel.left.y }
    };

    const corridorGhost: Pick<GhostState, "mode" | "position"> = {
      mode: "chase",
      position: { x: 10, y: 10 }
    };

    const tunnelMultiplier = getGhostSpeedMultiplier(tunnelGhost, PACMAN_CLASSIC_MAZE, {
      baseMultiplier: 1,
      frightenedMultiplier: 1,
      eatenReturningMultiplier: 1,
      tunnelMultiplier: 0.5
    });

    const normalMultiplier = getGhostSpeedMultiplier(corridorGhost, PACMAN_CLASSIC_MAZE, {
      baseMultiplier: 1,
      frightenedMultiplier: 1,
      eatenReturningMultiplier: 1,
      tunnelMultiplier: 0.5
    });

    expect(tunnelMultiplier).toBe(0.5);
    expect(normalMultiplier).toBe(1);
    expect(computeGhostMovementSteps(0, tunnelMultiplier)).toBe(0);
    expect(computeGhostMovementSteps(1, tunnelMultiplier)).toBe(1);
  });
});

describe("pacman ghost collision resolution", () => {
  it("emits life-loss event for normal ghost collision", () => {
    const ghosts = createRoster({
      blinky: {
        position: { x: 5, y: 5 },
        mode: "chase"
      }
    });

    const result = resolvePacmanGhostCollisions({
      ghosts,
      pacmanPosition: { x: 5, y: 5 },
      frightenedCombo: 3
    });

    expect(result.pacmanCaught).toBe(true);
    expect(result.frightenedCombo).toBe(0);
    expect(result.events).toEqual([{ type: "pacman-caught", ghostId: "blinky" }]);
  });

  it("emits ghost-eaten event with combo progression in frightened mode", () => {
    const ghosts = createRoster({
      blinky: {
        position: { x: 6, y: 6 },
        mode: "frightened",
        frightenedTicksRemaining: 12
      }
    });

    const result = resolvePacmanGhostCollisions({
      ghosts,
      pacmanPosition: { x: 6, y: 6 },
      frightenedCombo: 1,
      comboProgression: (combo) => combo + 2
    });

    expect(result.pacmanCaught).toBe(false);
    expect(result.frightenedCombo).toBe(3);
    expect(result.events).toEqual([
      {
        type: "ghost-eaten",
        ghostId: "blinky",
        comboLevel: 3
      }
    ]);
    expect(result.ghosts.blinky.mode).toBe("eaten-returning");
    expect(result.ghosts.blinky.frightenedTicksRemaining).toBe(0);
  });

  it("treats eaten-returning ghosts as harmless", () => {
    const ghosts = createRoster({
      blinky: {
        position: { x: 7, y: 7 },
        mode: "eaten-returning"
      }
    });

    const result = resolvePacmanGhostCollisions({
      ghosts,
      pacmanPosition: { x: 7, y: 7 },
      frightenedCombo: 2
    });

    expect(result.pacmanCaught).toBe(false);
    expect(result.frightenedCombo).toBe(2);
    expect(result.events).toEqual([]);
  });

  it("detects path-cross collisions deterministically", () => {
    const ghosts = createRoster({
      blinky: {
        position: { x: 10, y: 10 },
        mode: "chase"
      }
    });

    const result = resolvePacmanGhostCollisions({
      ghosts,
      pacmanPosition: { x: 9, y: 10 },
      pacmanPreviousPosition: { x: 10, y: 10 },
      ghostPreviousPositions: {
        blinky: { x: 9, y: 10 }
      },
      frightenedCombo: 0
    });

    expect(result.pacmanCaught).toBe(true);
    expect(result.events).toEqual([{ type: "pacman-caught", ghostId: "blinky" }]);
  });
});

function createRoster(overrides?: Partial<Record<GhostId, Partial<GhostState>>>): GhostRoster {
  const base = createInitialGhostStates(PACMAN_CLASSIC_MAZE);

  const prepared: Record<GhostId, GhostState> = {
    blinky: activateGhost(base.blinky),
    pinky: activateGhost(base.pinky),
    inky: activateGhost(base.inky),
    clyde: activateGhost(base.clyde)
  };

  for (const ghostId of ["blinky", "pinky", "inky", "clyde"] as const) {
    const override = overrides?.[ghostId];
    if (override === undefined) {
      continue;
    }

    prepared[ghostId] = {
      ...prepared[ghostId],
      ...override,
      position: override.position ?? prepared[ghostId].position
    };
  }

  return prepared;
}

function activateGhost(ghost: GhostState): GhostState {
  return {
    ...ghost,
    houseState: "active",
    mode: "chase",
    frightenedTicksRemaining: 0,
    releasePathKind: "initial",
    releasePathIndex: 0,
    respawnReleaseTick: null
  };
}

function findDeadEndTile(): MazePosition {
  for (let y = 0; y < PACMAN_CLASSIC_MAZE.height; y += 1) {
    for (let x = 0; x < PACMAN_CLASSIC_MAZE.width; x += 1) {
      const position = { x, y };
      if (!isTraversable(PACMAN_CLASSIC_MAZE, position, "ghost")) {
        continue;
      }

      const directions = getAvailableDirections(PACMAN_CLASSIC_MAZE, position, "ghost");
      if (directions.length === 1) {
        return position;
      }
    }
  }

  throw new Error("Expected at least one dead-end corridor tile.");
}

function findHorizontalCorridorTile(): MazePosition {
  for (let y = 0; y < PACMAN_CLASSIC_MAZE.height; y += 1) {
    for (let x = 1; x < PACMAN_CLASSIC_MAZE.width - 1; x += 1) {
      const position = { x, y };
      if (!isTraversable(PACMAN_CLASSIC_MAZE, position, "ghost")) {
        continue;
      }

      const directions = getAvailableDirections(PACMAN_CLASSIC_MAZE, position, "ghost");
      const asSet = new Set<Direction>(directions);
      if (
        asSet.has("left") &&
        asSet.has("right") &&
        directions.length === 2 &&
        y !== PACMAN_CLASSIC_MAZE.tunnel.left.y
      ) {
        return position;
      }
    }
  }

  throw new Error("Expected at least one non-tunnel horizontal corridor tile.");
}
