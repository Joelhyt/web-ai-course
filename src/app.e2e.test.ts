import { mountSnakeGame, type SnakeApp } from "./app";
import type { GameRenderer } from "./game/render";
import type { GameState, WallMode } from "./game/types";
import type { ScoreStorage } from "./storage";

function renderAppShell(): void {
  document.body.innerHTML = `
    <main>
      <p>Score: <span id="score">0</span></p>
      <p>Best: <span id="best-score">0</span></p>
      <label>
        Walls:
        <select id="wall-mode">
          <option value="solid">Solid</option>
          <option value="wrap">Wrap around</option>
        </select>
      </label>
      <p id="game-status" aria-live="polite"></p>
      <canvas id="game-canvas"></canvas>
      <button id="restart-button" type="button" hidden disabled>Restart</button>
    </main>
  `;
}

function getGameCanvas(): HTMLCanvasElement {
  const canvas = document.getElementById("game-canvas");
  if (!(canvas instanceof HTMLCanvasElement)) {
    throw new Error("Expected #game-canvas");
  }
  return canvas;
}

function createTestRenderer(canvas: HTMLCanvasElement): GameRenderer {
  return {
    render(state: GameState): void {
      const head = state.snake[0];
      canvas.dataset.headX = String(head.x);
      canvas.dataset.headY = String(head.y);
      canvas.dataset.status = state.status;
    }
  };
}

function createScoreStorage(
  initialByMode: Record<WallMode, number> = { solid: 0, wrap: 0 }
): ScoreStorage & { saves: Array<{ mode: WallMode; score: number }> } {
  const saves: Array<{ mode: WallMode; score: number }> = [];
  const bestByMode = { ...initialByMode };
  return {
    loadBestScore(mode: WallMode): number {
      return bestByMode[mode];
    },
    saveBestScore(mode: WallMode, score: number): void {
      bestByMode[mode] = score;
      saves.push({ mode, score });
    },
    saves
  };
}

function getRestartButton(): HTMLButtonElement {
  const button = document.getElementById("restart-button");
  if (!(button instanceof HTMLButtonElement)) {
    throw new Error("Expected #restart-button");
  }
  return button;
}

function getWallModeSelect(): HTMLSelectElement {
  const modeSelect = document.getElementById("wall-mode");
  if (!(modeSelect instanceof HTMLSelectElement)) {
    throw new Error("Expected #wall-mode");
  }
  return modeSelect;
}

describe("snake browser behavior", () => {
  let app: SnakeApp | null = null;

  afterEach(() => {
    app?.destroy();
    app = null;
    document.body.innerHTML = "";
  });

  it("renders initial score and board state", () => {
    renderAppShell();
    const storage = createScoreStorage({ solid: 3, wrap: 8 });
    const canvas = getGameCanvas();

    app = mountSnakeGame(document, {
      storage,
      autoStart: false,
      initialFood: { x: 0, y: 0 },
      renderer: createTestRenderer(canvas)
    });

    expect(document.getElementById("score")?.textContent).toBe("0");
    expect(document.getElementById("best-score")?.textContent).toBe("3");
    expect(canvas?.getAttribute("data-head-x")).toBe("12");
    expect(canvas?.getAttribute("data-head-y")).toBe("12");
    expect(getWallModeSelect().disabled).toBe(true);
    expect(getWallModeSelect().value).toBe("solid");
  });

  it("handles keyboard movement and prevents arrow-key default behavior", () => {
    renderAppShell();
    const canvas = getGameCanvas();
    app = mountSnakeGame(document, {
      autoStart: false,
      initialFood: { x: 0, y: 0 },
      renderer: createTestRenderer(canvas)
    });

    const input = new KeyboardEvent("keydown", {
      key: "ArrowUp",
      cancelable: true,
      bubbles: true
    });

    window.dispatchEvent(input);
    app.tick(120);

    expect(input.defaultPrevented).toBe(true);
    expect(app.getState().snake[0]).toEqual({ x: 12, y: 11 });
    expect(document.getElementById("game-status")?.textContent).toContain(
      "Game running"
    );
  });

  it("unlocks mode selection at game over and restarts in wrap mode", () => {
    renderAppShell();
    const canvas = getGameCanvas();
    const modeSelect = getWallModeSelect();
    app = mountSnakeGame(document, {
      board: { width: 4, height: 4 },
      autoStart: false,
      initialFood: { x: 0, y: 0 },
      renderer: createTestRenderer(canvas)
    });

    for (let step = 0; step < 2; step += 1) {
      app.tick(120);
    }

    const restartButton = getRestartButton();
    expect(document.getElementById("game-status")?.textContent).toContain(
      "Game over"
    );
    expect(restartButton.hidden).toBe(false);
    expect(modeSelect.disabled).toBe(false);
    expect(document.activeElement).toBe(restartButton);

    modeSelect.value = "wrap";
    modeSelect.dispatchEvent(new Event("change", { bubbles: true }));
    restartButton.click();
    app?.stop();
    expect(modeSelect.disabled).toBe(true);

    app.tick(120);
    app.tick(120);

    expect(app.getState().status).toBe("running");
    expect(app.getState().wallMode).toBe("wrap");
    expect(app.getState().snake[0]).toEqual({ x: 0, y: 2 });
  });

  it("updates and persists best score when food is eaten", () => {
    renderAppShell();
    const canvas = getGameCanvas();
    const storage = createScoreStorage({ solid: 0, wrap: 4 });

    app = mountSnakeGame(document, {
      autoStart: false,
      storage,
      initialFood: { x: 13, y: 12 },
      spawnFood: () => ({ x: 0, y: 0 }),
      renderer: createTestRenderer(canvas)
    });

    app.tick(120);

    expect(document.getElementById("score")?.textContent).toBe("1");
    expect(document.getElementById("best-score")?.textContent).toBe("1");
    expect(storage.saves).toEqual([{ mode: "solid", score: 1 }]);
  });

  it("shows best score for selected mode between rounds", () => {
    renderAppShell();
    const canvas = getGameCanvas();
    const modeSelect = getWallModeSelect();
    const storage = createScoreStorage({ solid: 2, wrap: 9 });
    app = mountSnakeGame(document, {
      board: { width: 4, height: 4 },
      autoStart: false,
      storage,
      initialFood: { x: 0, y: 0 },
      renderer: createTestRenderer(canvas)
    });

    app.tick(120);
    app.tick(120);
    expect(app.getState().status).toBe("game-over");

    expect(document.getElementById("best-score")?.textContent).toBe("2");
    modeSelect.value = "wrap";
    modeSelect.dispatchEvent(new Event("change", { bubbles: true }));
    expect(document.getElementById("best-score")?.textContent).toBe("9");
  });

  it("uses faster tick interval after crossing score threshold", () => {
    renderAppShell();
    const canvas = getGameCanvas();
    let nextFoodX = 14;

    app = mountSnakeGame(document, {
      autoStart: false,
      initialFood: { x: 13, y: 12 },
      spawnFood: () => ({ x: nextFoodX++, y: 12 }),
      renderer: createTestRenderer(canvas)
    });

    for (let step = 0; step < 5; step += 1) {
      app.tick(120);
    }

    expect(app.getState().score).toBe(5);
    const headBefore = app.getState().snake[0];
    app.tick(109);
    expect(app.getState().snake[0]).toEqual(headBefore);
    app.tick(1);
    expect(app.getState().snake[0]).toEqual({ x: headBefore.x + 1, y: headBefore.y });
  });

  it("restarts from keyboard shortcut when game is over", () => {
    renderAppShell();
    const canvas = getGameCanvas();
    app = mountSnakeGame(document, {
      autoStart: false,
      initialFood: { x: 0, y: 0 },
      renderer: createTestRenderer(canvas)
    });

    for (let step = 0; step < 14; step += 1) {
      app.tick(120);
    }

    const restartKey = new KeyboardEvent("keydown", {
      key: "r",
      cancelable: true,
      bubbles: true
    });
    window.dispatchEvent(restartKey);

    expect(restartKey.defaultPrevented).toBe(true);
    expect(document.getElementById("game-status")?.textContent).toContain(
      "Game running"
    );
    expect(document.getElementById("restart-button")?.hasAttribute("hidden")).toBe(
      true
    );
  });
});
