import {
  advanceTetrisState,
  createEmptyTetrisBoard,
  createInitialTetrisState,
  getGravityIntervalMs,
  hardDrop,
  holdActivePiece,
  moveActivePiece,
  moveDown,
  rotateActivePieceClockwise,
  togglePause
} from "./state";
import { TETROMINO_TYPES, type BoardMatrix } from "./types";

describe("tetris state domain", () => {
  it("uses deterministic 7-bag generation", () => {
    const first = createInitialTetrisState({ randomSeed: 1337 });
    const second = createInitialTetrisState({ randomSeed: 1337 });

    const firstBag = [
      first.activePiece.type,
      first.nextPiece,
      ...first.queue.slice(0, 5)
    ];
    const secondBag = [
      second.activePiece.type,
      second.nextPiece,
      ...second.queue.slice(0, 5)
    ];

    expect(firstBag).toEqual(secondBag);
    expect(new Set(firstBag)).toEqual(new Set(TETROMINO_TYPES));
  });

  it("moves horizontally and down while respecting bounds", () => {
    let state = createInitialTetrisState({ queue: ["O", "I", "T"] });

    state = moveActivePiece(state, "left");
    expect(state.activePiece.x).toBe(2);

    state = moveActivePiece(state, "right");
    expect(state.activePiece.x).toBe(3);

    state = moveDown(state);
    expect(state.activePiece.y).toBe(1);

    for (let index = 0; index < 8; index += 1) {
      state = moveActivePiece(state, "left");
    }

    expect(state.activePiece.x).toBe(-1);
    expect(moveActivePiece(state, "left").activePiece.x).toBe(-1);
  });

  it("applies SRS clockwise kicks for T and I pieces", () => {
    const kickedT = rotateActivePieceClockwise(
      createInitialTetrisState({
        activePiece: { type: "T", rotation: 1, x: -1, y: 0 },
        queue: ["I", "O"]
      })
    );

    expect(kickedT.activePiece.rotation).toBe(2);
    expect(kickedT.activePiece.x).toBe(0);

    const kickedI = rotateActivePieceClockwise(
      createInitialTetrisState({
        activePiece: { type: "I", rotation: 1, x: 7, y: 5 },
        queue: ["O", "T"]
      })
    );

    expect(kickedI.activePiece.rotation).toBe(2);
    expect(kickedI.activePiece.x).toBe(6);
  });

  it("hard-drops and locks a piece onto the board", () => {
    const state = createInitialTetrisState({
      activePiece: { type: "O", rotation: 0, x: 4, y: 0 },
      queue: ["I", "T"]
    });

    const dropped = hardDrop(state);

    expect(dropped.activePiece.type).toBe("I");
    expect(dropped.board[18][5]).toBe("O");
    expect(dropped.board[18][6]).toBe("O");
    expect(dropped.board[19][5]).toBe("O");
    expect(dropped.board[19][6]).toBe("O");
    expect(dropped.canHold).toBe(true);
  });

  it("clears lines and applies score using current level multiplier", () => {
    const board = createBoardWithFilledRows([18, 19], [4]);
    const state = createInitialTetrisState({
      board,
      activePiece: { type: "I", rotation: 1, x: 2, y: 16 },
      queue: ["O", "T"],
      level: 2,
      totalLinesCleared: 10
    });

    const next = hardDrop(state);

    expect(next.score).toBe(600);
    expect(next.totalLinesCleared).toBe(12);
    expect(next.level).toBe(2);
    expect(next.board[18][4]).toBe("I");
    expect(next.board[19][4]).toBe("I");
  });

  it("levels up every ten lines and increases gravity speed safely", () => {
    const board = createBoardWithFilledRows([19], [5, 6]);
    const state = createInitialTetrisState({
      board,
      activePiece: { type: "O", rotation: 0, x: 4, y: 0 },
      queue: ["I", "T"],
      totalLinesCleared: 9,
      level: 1
    });

    const before = getGravityIntervalMs(state);
    const next = hardDrop(state);
    const after = getGravityIntervalMs(next);

    expect(next.totalLinesCleared).toBe(10);
    expect(next.level).toBe(2);
    expect(next.score).toBe(100);
    expect(after).toBeGreaterThan(0);
    expect(after).toBeLessThan(before);
  });

  it("enforces one hold per active piece and resets after lock", () => {
    const initial = createInitialTetrisState({ queue: ["T", "I", "O", "L"] });

    const firstHold = holdActivePiece(initial);
    expect(firstHold.heldPiece).toBe("T");
    expect(firstHold.activePiece.type).toBe("I");
    expect(firstHold.canHold).toBe(false);

    const secondHold = holdActivePiece(firstHold);
    expect(secondHold).toEqual(firstHold);

    const locked = hardDrop(firstHold);
    expect(locked.canHold).toBe(true);
    expect(locked.activePiece.type).toBe("O");

    const swapHold = holdActivePiece(locked);
    expect(swapHold.heldPiece).toBe("O");
    expect(swapHold.activePiece.type).toBe("T");
    expect(swapHold.canHold).toBe(false);
  });

  it("tops out when the next spawn position is blocked", () => {
    const board = createEmptyTetrisBoard().map((row) => [...row]);
    board[0][4] = "Z";

    const state = createInitialTetrisState({
      board,
      activePiece: { type: "I", rotation: 0, x: 3, y: 16 },
      queue: ["T", "O"]
    });

    const next = hardDrop(state);

    expect(next.status).toBe("game-over");
    expect(next.activePiece.type).toBe("T");
  });

  it("supports pause transitions and blocks gravity while paused", () => {
    const running = createInitialTetrisState({ queue: ["T", "I"] });

    const paused = togglePause(running);
    expect(paused.status).toBe("paused");
    expect(advanceTetrisState(paused)).toEqual(paused);

    const resumed = togglePause(paused);
    expect(resumed.status).toBe("running");

    const gameOver = { ...resumed, status: "game-over" as const };
    expect(togglePause(gameOver)).toEqual(gameOver);
  });
});

function createBoardWithFilledRows(
  rows: readonly number[],
  emptyColumns: readonly number[] = []
): BoardMatrix {
  const board = createEmptyTetrisBoard().map((row) => [...row]);

  for (const row of rows) {
    for (let column = 0; column < board[row].length; column += 1) {
      if (!emptyColumns.includes(column)) {
        board[row][column] = "J";
      }
    }
  }

  return board;
}
