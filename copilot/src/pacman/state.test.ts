import {
  PACMAN_CLASSIC_MAZE,
  getMovementNeighbor,
  getPacmanSpawn,
  toMazeTileKey
} from "./maze";
import {
  BASE_FRIGHTENED_DURATION_MS,
  FRUIT_VISIBLE_DURATION_MS,
  INITIAL_PACMAN_LIVES,
  INITIAL_PACMAN_ROUND,
  NORMAL_PELLET_SCORE,
  POWER_PELLET_SCORE,
  advancePacmanState,
  createInitialPacmanState,
  getFrightenedDurationMs,
  getFruitScoreForRound,
  getPacmanStepIntervalMs,
  queueDirectionChange,
  restartGame,
  restartRound,
  togglePause
} from "./state";
import type { Direction, MazePosition, MazeTileKey } from "./types";

describe("pacman state flow", () => {
  it("creates deterministic initial state", () => {
    const state = createInitialPacmanState({ bestScore: 123 });

    expect(state.status).toBe("running");
    expect(state.lives).toBe(INITIAL_PACMAN_LIVES);
    expect(state.round).toBe(INITIAL_PACMAN_ROUND);
    expect(state.score).toBe(0);
    expect(state.bestScore).toBe(123);
    expect(state.candidateBestScore).toBe(123);
    expect(state.player.position).toEqual(getPacmanSpawn(PACMAN_CLASSIC_MAZE));
    expect(state.player.queuedDirection).toBeNull();
    expect(state.pelletsRemaining).toBe(
      state.remainingNormalPellets.size + state.remainingPowerPellets.size
    );
    expect(state.fruit.active).toBe(false);
  });

  it("queues WASD turns and applies them only when legal", () => {
    const scenario = findQueuedTurnScenario();
    const interval = getPacmanStepIntervalMs(1);
    const seeded = createInitialPacmanState();

    const ready = {
      ...seeded,
      player: {
        position: scenario.start,
        direction: scenario.approach,
        queuedDirection: null
      }
    };

    const queued = queueDirectionChange(ready, toWasdKey(scenario.turn));
    expect(queued.player.queuedDirection).toBe(scenario.turn);

    const firstStep = advancePacmanState(queued, interval);
    expect(firstStep.player.position).toEqual(scenario.intersection);
    expect(firstStep.player.direction).toBe(scenario.approach);
    expect(firstStep.player.queuedDirection).toBe(scenario.turn);

    const secondStep = advancePacmanState(firstStep, interval);
    expect(secondStep.player.position).toEqual(scenario.turnDestination);
    expect(secondStep.player.direction).toBe(scenario.turn);
    expect(secondStep.player.queuedDirection).toBeNull();
  });

  it("wraps Pac-Man through side tunnel tiles", () => {
    const interval = getPacmanStepIntervalMs(1);
    const leftTunnel = PACMAN_CLASSIC_MAZE.tunnel.left;
    const rightTunnel = PACMAN_CLASSIC_MAZE.tunnel.right;

    const state = {
      ...createInitialPacmanState(),
      player: {
        position: leftTunnel,
        direction: "left" as const,
        queuedDirection: null
      }
    };

    const next = advancePacmanState(state, interval);
    expect(next.player.position).toEqual(rightTunnel);
  });

  it("awards pellet and power-pellet scores and tracks depletion", () => {
    const interval = getPacmanStepIntervalMs(1);

    const pelletTile = PACMAN_CLASSIC_MAZE.pelletTiles[0];
    const pelletApproach = findApproachToTarget(pelletTile);
    const normalStart = {
      ...createInitialPacmanState(),
      player: {
        position: pelletApproach.from,
        direction: pelletApproach.direction,
        queuedDirection: null
      }
    };

    const afterPellet = advancePacmanState(normalStart, interval);
    const pelletKey = toMazeTileKey(pelletTile);
    expect(afterPellet.score).toBe(NORMAL_PELLET_SCORE);
    expect(afterPellet.candidateBestScore).toBe(NORMAL_PELLET_SCORE);
    expect(afterPellet.remainingNormalPellets.has(pelletKey)).toBe(false);

    const powerTile = PACMAN_CLASSIC_MAZE.powerPelletTiles[0];
    const powerApproach = findApproachToTarget(powerTile);
    const powerStart = {
      ...createInitialPacmanState(),
      player: {
        position: powerApproach.from,
        direction: powerApproach.direction,
        queuedDirection: null
      }
    };

    const afterPower = advancePacmanState(powerStart, interval);
    const powerKey = toMazeTileKey(powerTile);
    expect(afterPower.score).toBe(POWER_PELLET_SCORE);
    expect(afterPower.remainingPowerPellets.has(powerKey)).toBe(false);
    expect(afterPower.frightenedMsRemaining).toBe(getFrightenedDurationMs(1));
  });

  it("decreases frightened timing by round and decrements runtime timer", () => {
    expect(getFrightenedDurationMs(1)).toBe(BASE_FRIGHTENED_DURATION_MS);
    expect(getFrightenedDurationMs(5)).toBeLessThan(getFrightenedDurationMs(1));

    const round = 4;
    const frightenedStart = getFrightenedDurationMs(round);
    const state = {
      ...createInitialPacmanState(),
      round,
      frightenedMsRemaining: frightenedStart,
      player: {
        ...createInitialPacmanState().player,
        direction: null
      }
    };

    const next = advancePacmanState(state, 750);
    expect(next.frightenedMsRemaining).toBe(frightenedStart - 750);
  });

  it("spawns/despawns fruit from pellet progress and awards fruit score", () => {
    const base = createInitialPacmanState();
    const interval = getPacmanStepIntervalMs(base.round);

    const threshold = base.fruit.spawnThresholds[0];
    expect(threshold).toBeGreaterThan(0);

    const progressTile = PACMAN_CLASSIC_MAZE.pelletTiles[1];
    const progressApproach = findApproachToTarget(progressTile);
    const spawning = {
      ...base,
      pelletsEaten: threshold - 1,
      player: {
        position: progressApproach.from,
        direction: progressApproach.direction,
        queuedDirection: null
      }
    };

    const spawned = advancePacmanState(spawning, interval);
    expect(spawned.fruit.active).toBe(true);
    expect(spawned.fruit.remainingMs).toBe(FRUIT_VISIBLE_DURATION_MS);
    expect(spawned.fruit.nextSpawnIndex).toBe(base.fruit.nextSpawnIndex + 1);

    const despawned = advancePacmanState(
      {
        ...spawned,
        player: {
          ...spawned.player,
          direction: null
        }
      },
      FRUIT_VISIBLE_DURATION_MS + 1
    );
    expect(despawned.fruit.active).toBe(false);

    const fruitApproach = findApproachToTarget(base.maze.spawns.fruit);
    const collectFruit = {
      ...base,
      fruit: {
        ...base.fruit,
        active: true,
        remainingMs: FRUIT_VISIBLE_DURATION_MS
      },
      player: {
        position: fruitApproach.from,
        direction: fruitApproach.direction,
        queuedDirection: null
      }
    };

    const collected = advancePacmanState(collectFruit, interval);
    expect(collected.fruit.active).toBe(false);
    expect(collected.score).toBe(getFruitScoreForRound(1));
  });

  it("loses a life and resets round state on non-frightened collision", () => {
    const state = {
      ...createInitialPacmanState(),
      player: {
        position: { x: 1, y: 1 },
        direction: "up" as const,
        queuedDirection: "left" as const
      },
      fruit: {
        ...createInitialPacmanState().fruit,
        active: true,
        remainingMs: 1000
      },
      frightenedMsRemaining: 0
    };

    const hit = advancePacmanState(state, 0, { pacmanCaught: true });
    expect(hit.lives).toBe(INITIAL_PACMAN_LIVES - 1);
    expect(hit.status).toBe("running");
    expect(hit.player.position).toEqual(getPacmanSpawn(PACMAN_CLASSIC_MAZE));
    expect(hit.player.queuedDirection).toBeNull();
    expect(hit.frightenedMsRemaining).toBe(0);
    expect(hit.fruit.active).toBe(false);

    const gameOver = advancePacmanState(
      {
        ...state,
        lives: 1,
        frightenedMsRemaining: 0
      },
      0,
      { pacmanCaught: true }
    );
    expect(gameOver.status).toBe("game-over");
    expect(gameOver.lives).toBe(0);
  });

  it("advances to next round when pellets are exhausted", () => {
    const initial = createInitialPacmanState();
    const interval = getPacmanStepIntervalMs(initial.round);
    const lastPellet = PACMAN_CLASSIC_MAZE.pelletTiles[0];
    const approach = findApproachToTarget(lastPellet);

    const almostCleared = {
      ...initial,
      player: {
        position: approach.from,
        direction: approach.direction,
        queuedDirection: null
      },
      remainingNormalPellets: new Set([toMazeTileKey(lastPellet)]),
      remainingPowerPellets: new Set<MazeTileKey>(),
      pelletsRemaining: 1,
      pelletsEaten: initial.pelletsRemaining - 1
    };

    const next = advancePacmanState(almostCleared, interval);

    expect(next.round).toBe(initial.round + 1);
    expect(next.player.position).toEqual(getPacmanSpawn(PACMAN_CLASSIC_MAZE));
    expect(next.pelletsRemaining).toBe(initial.pelletsRemaining);
    expect(next.pelletsEaten).toBe(0);
    expect(next.score).toBe(NORMAL_PELLET_SCORE);
    expect(getPacmanStepIntervalMs(next.round)).toBeLessThan(
      getPacmanStepIntervalMs(initial.round)
    );
    expect(getFrightenedDurationMs(next.round)).toBeLessThan(
      getFrightenedDurationMs(initial.round)
    );
  });

  it("freezes timers and movement while paused", () => {
    const running = {
      ...createInitialPacmanState(),
      frightenedMsRemaining: 1000
    };

    const paused = togglePause(running);
    expect(paused.status).toBe("paused");

    const afterAdvance = advancePacmanState(paused, 2000, {
      pacmanCaught: true,
      frightenedGhostsEaten: 2
    });
    expect(afterAdvance).toEqual(paused);

    const resumed = togglePause(afterAdvance);
    expect(resumed.status).toBe("running");
  });

  it("supports restart helpers for round and full game", () => {
    const initial = createInitialPacmanState({ bestScore: 250 });

    const altered = {
      ...initial,
      round: 4,
      score: 490,
      candidateBestScore: 490,
      lives: 2,
      pelletsEaten: 15,
      pelletsRemaining: initial.pelletsRemaining - 15,
      player: {
        position: { x: 1, y: 1 },
        direction: "up" as const,
        queuedDirection: "left" as const
      },
      fruit: {
        ...initial.fruit,
        active: true,
        remainingMs: 1000,
        nextSpawnIndex: 1
      },
      frightenedMsRemaining: 2000,
      movementRemainderMs: 150
    };

    const roundRestarted = restartRound(altered);
    expect(roundRestarted.round).toBe(4);
    expect(roundRestarted.score).toBe(490);
    expect(roundRestarted.lives).toBe(2);
    expect(roundRestarted.pelletsRemaining).toBe(altered.pelletsRemaining);
    expect(roundRestarted.player.position).toEqual(getPacmanSpawn(PACMAN_CLASSIC_MAZE));
    expect(roundRestarted.fruit.active).toBe(false);
    expect(roundRestarted.frightenedMsRemaining).toBe(0);

    const gameRestarted = restartGame({
      ...altered,
      status: "game-over" as const,
      bestScore: 400,
      candidateBestScore: 490
    });
    expect(gameRestarted.round).toBe(1);
    expect(gameRestarted.score).toBe(0);
    expect(gameRestarted.lives).toBe(3);
    expect(gameRestarted.bestScore).toBe(490);
    expect(gameRestarted.candidateBestScore).toBe(490);
    expect(gameRestarted.status).toBe("running");
  });
});

function findApproachToTarget(target: MazePosition): {
  readonly from: MazePosition;
  readonly direction: Direction;
} {
  for (const direction of DIRECTIONS) {
    const from = getMovementNeighbor(
      PACMAN_CLASSIC_MAZE,
      target,
      OPPOSITE[direction],
      "pacman"
    );

    if (from === null) {
      continue;
    }

    const forward = getMovementNeighbor(
      PACMAN_CLASSIC_MAZE,
      from,
      direction,
      "pacman"
    );

    if (forward !== null && samePosition(forward, target)) {
      return { from, direction };
    }
  }

  throw new Error(`No approach to target tile ${target.x},${target.y}`);
}

function findQueuedTurnScenario(): {
  readonly start: MazePosition;
  readonly intersection: MazePosition;
  readonly turnDestination: MazePosition;
  readonly approach: Direction;
  readonly turn: Direction;
} {
  for (let y = 0; y < PACMAN_CLASSIC_MAZE.height; y += 1) {
    for (let x = 0; x < PACMAN_CLASSIC_MAZE.width; x += 1) {
      const start = { x, y };

      for (const approach of DIRECTIONS) {
        const intersection = getMovementNeighbor(
          PACMAN_CLASSIC_MAZE,
          start,
          approach,
          "pacman"
        );

        if (intersection === null) {
          continue;
        }

        for (const turn of DIRECTIONS) {
          if (turn === approach || turn === OPPOSITE[approach]) {
            continue;
          }

          const turnFromStart = getMovementNeighbor(
            PACMAN_CLASSIC_MAZE,
            start,
            turn,
            "pacman"
          );
          const turnFromIntersection = getMovementNeighbor(
            PACMAN_CLASSIC_MAZE,
            intersection,
            turn,
            "pacman"
          );

          if (turnFromStart === null && turnFromIntersection !== null) {
            return {
              start,
              intersection,
              turnDestination: turnFromIntersection,
              approach,
              turn
            };
          }
        }
      }
    }
  }

  throw new Error("No queued-turn scenario available in maze");
}

function toWasdKey(direction: Direction): "w" | "a" | "s" | "d" {
  if (direction === "up") {
    return "w";
  }

  if (direction === "right") {
    return "d";
  }

  if (direction === "down") {
    return "s";
  }

  return "a";
}

function samePosition(a: MazePosition, b: MazePosition): boolean {
  return a.x === b.x && a.y === b.y;
}

const DIRECTIONS: readonly Direction[] = ["up", "right", "down", "left"];

const OPPOSITE: Readonly<Record<Direction, Direction>> = {
  up: "down",
  right: "left",
  down: "up",
  left: "right"
};
