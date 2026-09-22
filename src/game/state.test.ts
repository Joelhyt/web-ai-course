import {
  advanceGame,
  createInitialGameState,
  getTickIntervalForScore,
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
});
