// @vitest-environment jsdom

import { mountTetrisGame, type TetrisApp } from "./app";
import { advanceTetrisState, createInitialTetrisState, getGravityIntervalMs } from "./state";
import type { TetrisRenderer } from "./render";
import type { TetrisScoreStorage } from "../storage";
import type { TetrisState } from "./types";

function renderArcadeHost(): void {
  document.body.innerHTML = `<div class="arcade-game-host"></div>`;
}

function createTestRenderer(): {
  readonly renderer: TetrisRenderer;
  readonly renders: TetrisState[];
} {
  const renders: TetrisState[] = [];
  return {
    renderer: {
      render(state): void {
        renders.push(state);
      }
    },
    renders
  };
}

function createScoreStorage(initialBestScore = 0): TetrisScoreStorage & { saves: number[] } {
  let bestScore = initialBestScore;
  const saves: number[] = [];
  return {
    loadBestScore(): number {
      return bestScore;
    },
    saveBestScore(score): void {
      bestScore = score;
      saves.push(score);
    },
    saves
  };
}

function pressKey(key: string, code?: string): KeyboardEvent {
  const event = new KeyboardEvent("keydown", {
    key,
    code,
    bubbles: true,
    cancelable: true
  });
  window.dispatchEvent(event);
  return event;
}

describe("mountTetrisGame", () => {
  let app: TetrisApp | null = null;

  afterEach(() => {
    app?.destroy();
    app = null;
    document.body.innerHTML = "";
  });

  it("renders HUD fields and persists an isolated Tetris best score", () => {
    renderArcadeHost();
    const { renderer, renders } = createTestRenderer();
    const storage = createScoreStorage(12);
    const initialState = createInitialTetrisState({
      activePiece: { type: "T", rotation: 0, x: 3, y: 0 },
      queue: ["I", "O", "L"],
      score: 15
    });

    app = mountTetrisGame(document, {
      autoStart: false,
      renderer,
      storage,
      createInitialState: () => initialState
    });

    expect(document.getElementById("tetris-score")?.textContent).toBe("15");
    expect(document.getElementById("tetris-best-score")?.textContent).toBe("15");
    expect(document.getElementById("tetris-level")?.textContent).toBe("1");
    expect(document.getElementById("tetris-lines")?.textContent).toBe("0");
    expect(document.getElementById("tetris-next-piece")?.textContent).toBe("I");
    expect(document.getElementById("tetris-hold-piece")?.textContent).toBe("-");
    expect(document.getElementById("tetris-status")?.textContent).toContain("Game running");
    expect(storage.saves).toEqual([15]);
    const lastRender = renders[renders.length - 1];
    expect(lastRender?.activePiece.type).toBe("T");
  });

  it("supports required keyboard controls", () => {
    renderArcadeHost();
    const { renderer } = createTestRenderer();

    app = mountTetrisGame(document, {
      autoStart: false,
      renderer,
      createInitialState: () =>
        createInitialTetrisState({
          activePiece: { type: "T", rotation: 0, x: 4, y: 0 },
          queue: ["I", "O", "L", "S"]
        })
    });

    const xBeforeMove = app.getState().activePiece.x;
    expect(pressKey("ArrowLeft").defaultPrevented).toBe(true);
    expect(app.getState().activePiece.x).toBe(xBeforeMove - 1);

    pressKey("ArrowRight");
    expect(app.getState().activePiece.x).toBe(xBeforeMove);

    const yBeforeDrop = app.getState().activePiece.y;
    pressKey("ArrowDown");
    expect(app.getState().activePiece.y).toBe(yBeforeDrop + 1);

    pressKey("ArrowUp");
    expect(app.getState().activePiece.rotation).toBe(1);

    pressKey("x");
    expect(app.getState().activePiece.rotation).toBe(2);

    const typeBeforeHardDrop = app.getState().activePiece.type;
    pressKey(" ", "Space");
    expect(app.getState().activePiece.type).not.toBe(typeBeforeHardDrop);

    pressKey("c");
    expect(app.getState().heldPiece).toBe("I");
    expect(app.getState().activePiece.type).toBe("O");
    expect(app.getState().canHold).toBe(false);
  });

  it("advances with fixed timestep gravity", () => {
    renderArcadeHost();
    const { renderer } = createTestRenderer();
    const initialState = createInitialTetrisState({
      activePiece: { type: "O", rotation: 0, x: 4, y: 0 },
      queue: ["I", "T", "L"]
    });
    const gravityInterval = getGravityIntervalMs(initialState);

    app = mountTetrisGame(document, {
      autoStart: false,
      renderer,
      createInitialState: () => initialState
    });

    app.tick(gravityInterval - 1);
    expect(app.getState()).toEqual(initialState);

    app.tick(1);
    expect(app.getState()).toEqual(advanceTetrisState(initialState));
  });

  it("pauses and resumes with P and restarts with R after game over", () => {
    renderArcadeHost();
    const { renderer } = createTestRenderer();
    const gameOverState = createInitialTetrisState({
      status: "game-over",
      activePiece: { type: "T", rotation: 0, x: 3, y: 0 },
      queue: ["I", "O", "L"]
    });
    const runningState = createInitialTetrisState({
      activePiece: { type: "L", rotation: 0, x: 3, y: 0 },
      queue: ["I", "O", "S"]
    });
    let mountCount = 0;

    app = mountTetrisGame(document, {
      autoStart: false,
      renderer,
      createInitialState: () => {
        mountCount += 1;
        return mountCount === 1 ? gameOverState : runningState;
      }
    });

    expect(document.getElementById("tetris-status")?.textContent).toContain("Game over");
    const restartEvent = pressKey("r");
    expect(restartEvent.defaultPrevented).toBe(true);
    expect(app.getState().status).toBe("running");

    const pauseEvent = pressKey("p");
    expect(pauseEvent.defaultPrevented).toBe(true);
    expect(app.getState().status).toBe("paused");
    expect(document.getElementById("tetris-status")?.textContent).toContain("Paused");

    const pausedState = app.getState();
    app.tick(5_000);
    expect(app.getState()).toEqual(pausedState);

    pressKey("p");
    expect(app.getState().status).toBe("running");
  });

  it("cleans up listeners and mounted markup on destroy", () => {
    renderArcadeHost();
    const { renderer, renders } = createTestRenderer();

    app = mountTetrisGame(document, {
      autoStart: false,
      renderer
    });

    const renderCountBeforeDestroy = renders.length;
    app.destroy();
    app = null;

    const rootHost = document.querySelector(".arcade-game-host");
    expect(rootHost?.innerHTML).toBe("");
    pressKey("ArrowDown");
    expect(renders).toHaveLength(renderCountBeforeDestroy);
  });
});
