import {
  TIME_ATTACK_DURATION_MS,
  TIME_ATTACK_POWER_UP_MAX_BOARD_ITEMS,
  advanceGame,
  createInitialGameState,
  elapseTime,
  FEAST_EXTRA_FOOD_COUNT,
  getEffectiveTickInterval,
  getTimeAttackTickIntervalForScore,
  getTickIntervalForScore,
  POWER_UP_BOARD_DURATION_STEPS,
  POWER_UP_EFFECT_DURATION_STEPS,
  queueDirectionChange,
  spawnFoodAtRandomFreeCell
} from "./state";

describe("game state transitions", () => {
  it("moves one cell forward each tick without growth", () => {
    const state = createInitialGameState({
      initialFood: { x: 0, y: 0 }
    });

    const next = advanceGame(state, {
      spawnFood: () => ({ x: 0, y: 0 })
    });

    expect(next.snake[0]).toEqual({ x: 13, y: 12 });
    expect(next.snake).toHaveLength(state.snake.length);
    expect(next.score).toBe(0);
    expect(next.status).toBe("running");
  });

  it("queues one valid turn and applies it on the next tick", () => {
    const state = createInitialGameState({
      initialFood: { x: 0, y: 0 }
    });

    const queued = queueDirectionChange(state, "up");
    const next = advanceGame(queued, {
      spawnFood: () => ({ x: 0, y: 0 })
    });

    expect(next.direction).toBe("up");
    expect(next.pendingDirection).toBeNull();
    expect(next.snake[0]).toEqual({ x: 12, y: 11 });
  });

  it("ignores opposite-direction turns", () => {
    const state = createInitialGameState({
      initialFood: { x: 0, y: 0 }
    });

    const queued = queueDirectionChange(state, "left");
    const next = advanceGame(queued, {
      spawnFood: () => ({ x: 0, y: 0 })
    });

    expect(queued).toBe(state);
    expect(next.direction).toBe("right");
    expect(next.snake[0]).toEqual({ x: 13, y: 12 });
  });

  it("grows and updates score when food is eaten", () => {
    const state = createInitialGameState({
      initialFood: { x: 13, y: 12 }
    });

    const next = advanceGame(state, {
      spawnFood: () => ({ x: 0, y: 0 })
    });

    expect(next.snake[0]).toEqual({ x: 13, y: 12 });
    expect(next.snake).toHaveLength(state.snake.length + 1);
    expect(next.score).toBe(1);
    expect(next.bestScore).toBe(1);
    expect(next.food).toEqual({ x: 0, y: 0 });
  });

  it("ends the game on wall collision", () => {
    const state = createInitialGameState({
      board: { width: 4, height: 4 },
      snake: [
        { x: 3, y: 2 },
        { x: 2, y: 2 },
        { x: 1, y: 2 }
      ],
      direction: "right",
      initialFood: { x: 0, y: 0 }
    });

    const next = advanceGame(state);

    expect(next.status).toBe("game-over");
    expect(next.score).toBe(0);
  });

  it("ends the game on self collision", () => {
    const state = createInitialGameState({
      board: { width: 6, height: 6 },
      snake: [
        { x: 2, y: 2 },
        { x: 2, y: 3 },
        { x: 1, y: 3 },
        { x: 1, y: 2 },
        { x: 1, y: 1 },
        { x: 2, y: 1 },
        { x: 3, y: 1 },
        { x: 3, y: 2 }
      ],
      direction: "up",
      initialFood: { x: 5, y: 5 }
    });

    const next = advanceGame(state);

    expect(next.status).toBe("game-over");
  });

  it("spawns random food only on free cells", () => {
    const board = { width: 3, height: 3 } as const;
    const snake = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 }
    ] as const;

    const food = spawnFoodAtRandomFreeCell(board, snake, () => 0);

    expect(food).toEqual({ x: 0, y: 1 });
  });

  it("wraps across the right edge in wrap mode", () => {
    const state = createInitialGameState({
      board: { width: 4, height: 4 },
      snake: [
        { x: 3, y: 1 },
        { x: 2, y: 1 },
        { x: 1, y: 1 }
      ],
      direction: "right",
      wallMode: "wrap",
      initialFood: { x: 0, y: 0 }
    });

    const next = advanceGame(state);

    expect(next.status).toBe("running");
    expect(next.snake[0]).toEqual({ x: 0, y: 1 });
  });

  it("wraps across the left edge in wrap mode", () => {
    const state = createInitialGameState({
      board: { width: 4, height: 4 },
      snake: [
        { x: 0, y: 2 },
        { x: 1, y: 2 },
        { x: 2, y: 2 }
      ],
      direction: "left",
      wallMode: "wrap",
      initialFood: { x: 3, y: 3 }
    });

    const next = advanceGame(state);

    expect(next.status).toBe("running");
    expect(next.snake[0]).toEqual({ x: 3, y: 2 });
  });

  it("wraps across the top edge in wrap mode", () => {
    const state = createInitialGameState({
      board: { width: 4, height: 4 },
      snake: [
        { x: 2, y: 0 },
        { x: 2, y: 1 },
        { x: 2, y: 2 }
      ],
      direction: "up",
      wallMode: "wrap",
      initialFood: { x: 1, y: 1 }
    });

    const next = advanceGame(state);

    expect(next.status).toBe("running");
    expect(next.snake[0]).toEqual({ x: 2, y: 3 });
  });

  it("wraps across the bottom edge in wrap mode", () => {
    const state = createInitialGameState({
      board: { width: 4, height: 4 },
      snake: [
        { x: 1, y: 3 },
        { x: 1, y: 2 },
        { x: 1, y: 1 }
      ],
      direction: "down",
      wallMode: "wrap",
      initialFood: { x: 0, y: 0 }
    });

    const next = advanceGame(state);

    expect(next.status).toBe("running");
    expect(next.snake[0]).toEqual({ x: 1, y: 0 });
  });

  it("returns staged tick interval from score with floor", () => {
    expect(getTickIntervalForScore(0)).toBe(120);
    expect(getTickIntervalForScore(4)).toBe(120);
    expect(getTickIntervalForScore(5)).toBe(110);
    expect(getTickIntervalForScore(10)).toBe(100);
    expect(getTickIntervalForScore(30)).toBe(60);
    expect(getTickIntervalForScore(120)).toBe(60);
  });

  it("spawns a power-up after food when chance succeeds and no effect is active", () => {
    const state = createInitialGameState({
      initialFood: { x: 13, y: 12 }
    });

    const next = advanceGame(state, {
      random: () => 0,
      spawnFood: () => ({ x: 0, y: 0 }),
      spawnPowerUp: () => ({ type: "slow", position: { x: 5, y: 5 } })
    });

    expect(next.boardPowerUp).toEqual({
      type: "slow",
      position: { x: 5, y: 5 },
      remainingSteps: POWER_UP_BOARD_DURATION_STEPS
    });
    expect(next.activePowerUp).toBeNull();
  });

  it("does not spawn a power-up while an effect is active", () => {
    const state = createInitialGameState({
      initialFood: { x: 13, y: 12 },
      activePowerUp: { type: "ghost", remainingSteps: 4 }
    });

    const next = advanceGame(state, {
      random: () => 0,
      spawnFood: () => ({ x: 0, y: 0 }),
      spawnPowerUp: () => ({ type: "magnet", position: { x: 8, y: 8 } })
    });

    expect(next.boardPowerUp).toBeNull();
    expect(next.activePowerUp).toEqual({ type: "ghost", remainingSteps: 3 });
  });

  it("expires an uncollected board power-up after its timer reaches zero", () => {
    const state = createInitialGameState({
      initialFood: { x: 0, y: 0 },
      boardPowerUp: {
        type: "slow",
        position: { x: 20, y: 20 },
        remainingSteps: 1
      }
    });

    const next = advanceGame(state);

    expect(next.boardPowerUp).toBeNull();
  });

  it("activates a collected board power-up for the configured duration", () => {
    const state = createInitialGameState({
      initialFood: { x: 0, y: 0 },
      boardPowerUp: {
        type: "magnet",
        position: { x: 13, y: 12 },
        remainingSteps: 10
      }
    });

    const next = advanceGame(state);

    expect(next.boardPowerUp).toBeNull();
    expect(next.activePowerUp).toEqual({
      type: "magnet",
      remainingSteps: POWER_UP_EFFECT_DURATION_STEPS
    });
  });

  it("ignores self-collision while ghost is active", () => {
    const state = createInitialGameState({
      board: { width: 6, height: 6 },
      snake: [
        { x: 2, y: 2 },
        { x: 2, y: 3 },
        { x: 1, y: 3 },
        { x: 1, y: 2 },
        { x: 1, y: 1 },
        { x: 2, y: 1 },
        { x: 3, y: 1 },
        { x: 3, y: 2 }
      ],
      direction: "up",
      activePowerUp: { type: "ghost", remainingSteps: 3 },
      initialFood: { x: 5, y: 5 }
    });

    const next = advanceGame(state);

    expect(next.status).toBe("running");
    expect(next.activePowerUp).toEqual({ type: "ghost", remainingSteps: 2 });
  });

  it("pulls food toward the snake while magnet is active", () => {
    const state = createInitialGameState({
      snake: [
        { x: 12, y: 12 },
        { x: 11, y: 12 },
        { x: 10, y: 12 }
      ],
      direction: "right",
      activePowerUp: { type: "magnet", remainingSteps: 3 },
      initialFood: { x: 15, y: 12 }
    });

    const next = advanceGame(state, {
      spawnFood: () => ({ x: 0, y: 0 })
    });

    expect(next.food).toEqual({ x: 14, y: 12 });
  });

  it("pulls Feast temporary foods toward the snake while magnet is active", () => {
    const state = createInitialGameState({
      gameMode: "time-attack",
      snake: [
        { x: 12, y: 12 },
        { x: 11, y: 12 },
        { x: 10, y: 12 }
      ],
      direction: "right",
      activePowerUps: [
        { type: "magnet", remainingSteps: 3 },
        { type: "feast", remainingSteps: 3 }
      ],
      initialFood: { x: 20, y: 12 },
      initialExtraFoods: [
        { x: 15, y: 12 },
        { x: 12, y: 15 },
        { x: 5, y: 5 }
      ]
    });

    const next = advanceGame(state, {
      spawnFood: () => ({ x: 0, y: 0 })
    });

    expect(next.food).toEqual({ x: 19, y: 12 });
    expect(next.extraFoods).toEqual([
      { x: 14, y: 12 },
      { x: 12, y: 14 },
      { x: 6, y: 5 }
    ]);
  });

  it("applies slow multiplier to effective tick interval only while active", () => {
    const normal = createInitialGameState({
      initialFood: { x: 0, y: 0 }
    });
    const slowed = createInitialGameState({
      initialFood: { x: 0, y: 0 },
      activePowerUp: { type: "slow", remainingSteps: 10 }
    });

    expect(getEffectiveTickInterval(normal)).toBe(120);
    expect(getEffectiveTickInterval(slowed)).toBe(180);
  });

  it("activates feast and spawns three temporary foods", () => {
    const state = createInitialGameState({
      initialFood: { x: 0, y: 0 },
      boardPowerUp: {
        type: "feast",
        position: { x: 13, y: 12 },
        remainingSteps: 10
      }
    });

    const next = advanceGame(state, { random: () => 0 });

    expect(next.activePowerUp).toEqual({
      type: "feast",
      remainingSteps: POWER_UP_EFFECT_DURATION_STEPS
    });
    expect(next.extraFoods).toHaveLength(FEAST_EXTRA_FOOD_COUNT);
    expect(next.extraFoods[0]).toEqual({ x: 1, y: 0 });
    expect(next.extraFoods).toEqual(
      expect.not.arrayContaining([next.food, next.snake[0]])
    );
  });

  it("replenishes a consumed temporary food while feast is active", () => {
    const state = createInitialGameState({
      initialFood: { x: 0, y: 0 },
      activePowerUp: { type: "feast", remainingSteps: 5 },
      initialExtraFoods: [
        { x: 13, y: 12 },
        { x: 14, y: 12 },
        { x: 15, y: 12 }
      ]
    });

    const next = advanceGame(state, { random: () => 0 });

    expect(next.activePowerUp).toEqual({ type: "feast", remainingSteps: 4 });
    expect(next.extraFoods).toHaveLength(FEAST_EXTRA_FOOD_COUNT);
    expect(next.extraFoods).not.toEqual(
      expect.arrayContaining([{ x: 13, y: 12 }])
    );
  });

  it("removes temporary foods when feast expires", () => {
    const state = createInitialGameState({
      initialFood: { x: 0, y: 0 },
      activePowerUp: { type: "feast", remainingSteps: 1 },
      initialExtraFoods: [
        { x: 5, y: 5 },
        { x: 6, y: 5 },
        { x: 7, y: 5 }
      ]
    });

    const next = advanceGame(state);

    expect(next.activePowerUp).toBeNull();
    expect(next.extraFoods).toEqual([]);
  });

  it("uses uncapped exponential speed progression in time attack mode", () => {
    expect(getTimeAttackTickIntervalForScore(0)).toBeCloseTo(120);
    expect(getTimeAttackTickIntervalForScore(5)).toBeCloseTo(111.6);
    expect(getTimeAttackTickIntervalForScore(50)).toBeCloseTo(
      120 * Math.pow(0.93, 10)
    );
  });

  it("ends time attack when countdown expires", () => {
    const state = createInitialGameState({
      gameMode: "time-attack",
      initialFood: { x: 0, y: 0 }
    });

    const almostDone = elapseTime(state, TIME_ATTACK_DURATION_MS - 1);
    expect(almostDone.status).toBe("running");
    expect(almostDone.timeRemainingMs).toBe(1);

    const expired = elapseTime(almostDone, 1);
    expect(expired.status).toBe("game-over");
    expect(expired.endReason).toBe("time-expired");
    expect(expired.timeRemainingMs).toBe(0);
  });

  it("allows stacking multiple simultaneous effects in time attack mode", () => {
    const state = createInitialGameState({
      gameMode: "time-attack",
      initialFood: { x: 0, y: 0 },
      activePowerUps: [
        { type: "slow", remainingSteps: 10 },
        { type: "magnet", remainingSteps: 8 }
      ]
    });

    const next = advanceGame(state, {
      spawnFood: () => ({ x: 0, y: 0 })
    });

    expect(next.activePowerUps).toEqual([
      { type: "slow", remainingSteps: 9 },
      { type: "magnet", remainingSteps: 7 }
    ]);
  });

  it("extends matching effect duration on duplicate pickup in time attack mode", () => {
    const state = createInitialGameState({
      gameMode: "time-attack",
      initialFood: { x: 0, y: 0 },
      activePowerUps: [{ type: "magnet", remainingSteps: 6 }],
      boardPowerUps: [
        { type: "magnet", position: { x: 13, y: 12 }, remainingSteps: 10 }
      ]
    });

    const next = advanceGame(state);

    expect(next.boardPowerUps).toHaveLength(0);
    expect(next.activePowerUps).toEqual([
      { type: "magnet", remainingSteps: 45 }
    ]);
  });

  it("allows up to four board power-ups in time attack mode", () => {
    const board = { width: 12, height: 12 } as const;
    const state = createInitialGameState({
      gameMode: "time-attack",
      wallMode: "wrap",
      board,
      initialFood: { x: 7, y: 6 }
    });

    let powerUpColumn = 0;
    let stacked = state;
    for (let step = 0; step < 8; step += 1) {
      stacked = advanceGame(stacked, {
        random: () => 0,
        spawnFood: (_board, snake) => ({
          x: (snake[0].x + 1) % board.width,
          y: snake[0].y
        }),
        spawnPowerUp: () => ({
          type: "ghost",
          position: { x: powerUpColumn++ % board.width, y: 0 }
        })
      });
    }

    expect(stacked.boardPowerUps.length).toBeLessThanOrEqual(
      TIME_ATTACK_POWER_UP_MAX_BOARD_ITEMS
    );
    expect(stacked.boardPowerUps.length).toBe(TIME_ATTACK_POWER_UP_MAX_BOARD_ITEMS);
  });
});
