import { mountSnakeGame, type SnakeApp } from "./app";
import type { GameRenderer } from "./game/render";
import type { GameMode, GameState, WallMode } from "./game/types";
import type { ScoreStorage } from "./storage";

function renderAppShell(): void {
  document.body.innerHTML = `
    <main>
      <p>Score: <span id="score">0</span></p>
      <p>Best: <span id="best-score">0</span></p>
      <p>Time left: <span id="time-remaining">—</span>s</p>
      <label>
        Mode:
        <select id="game-mode">
          <option value="classic">Classic</option>
          <option value="time-attack">Time Attack</option>
        </select>
      </label>
      <label>
        Walls:
        <select id="wall-mode">
          <option value="solid">Solid</option>
          <option value="wrap">Wrap around</option>
        </select>
      </label>
      <p>Active power-up: <span id="active-power-up">None</span></p>
      <p>Board power-up: <span id="board-power-up">None</span></p>
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

type ScoreMap = Record<GameMode, Record<WallMode, number>>;
const DEFAULT_SCORES: ScoreMap = {
  classic: { solid: 0, wrap: 0 },
  "time-attack": { solid: 0, wrap: 0 }
};

function createScoreStorage(
  initialScores: ScoreMap = DEFAULT_SCORES
): ScoreStorage & {
  saves: Array<{ gameMode: GameMode; wallMode: WallMode; score: number }>;
} {
  const saves: Array<{ gameMode: GameMode; wallMode: WallMode; score: number }> = [];
  const bestByMode: ScoreMap = {
    classic: { ...initialScores.classic },
    "time-attack": { ...initialScores["time-attack"] }
  };
  return {
    loadBestScore(gameMode: GameMode, wallMode: WallMode): number {
      return bestByMode[gameMode][wallMode];
    },
    saveBestScore(gameMode: GameMode, wallMode: WallMode, score: number): void {
      bestByMode[gameMode][wallMode] = score;
      saves.push({ gameMode, wallMode, score });
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

function getGameModeSelect(): HTMLSelectElement {
  const modeSelect = document.getElementById("game-mode");
  if (!(modeSelect instanceof HTMLSelectElement)) {
    throw new Error("Expected #game-mode");
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
    const storage = createScoreStorage({
      classic: { solid: 3, wrap: 8 },
      "time-attack": { solid: 4, wrap: 6 }
    });
    const canvas = getGameCanvas();

    app = mountSnakeGame(document, {
      storage,
      autoStart: false,
      initialFood: { x: 0, y: 0 },
      renderer: createTestRenderer(canvas)
    });

    expect(document.getElementById("score")?.textContent).toBe("0");
    expect(document.getElementById("best-score")?.textContent).toBe("3");
    expect(document.getElementById("time-remaining")?.textContent).toBe("—");
    expect(canvas?.getAttribute("data-head-x")).toBe("12");
    expect(canvas?.getAttribute("data-head-y")).toBe("12");
    expect(getWallModeSelect().disabled).toBe(true);
    expect(getGameModeSelect().disabled).toBe(true);
    expect(getWallModeSelect().value).toBe("solid");
    expect(getGameModeSelect().value).toBe("classic");
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

  it("unlocks selectors at game over and restarts in wrap mode", () => {
    renderAppShell();
    const canvas = getGameCanvas();
    const wallModeSelect = getWallModeSelect();
    const gameModeSelect = getGameModeSelect();
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
    expect(wallModeSelect.disabled).toBe(false);
    expect(gameModeSelect.disabled).toBe(false);
    expect(document.activeElement).toBe(restartButton);

    wallModeSelect.value = "wrap";
    wallModeSelect.dispatchEvent(new Event("change", { bubbles: true }));
    restartButton.click();
    app.stop();
    expect(wallModeSelect.disabled).toBe(true);
    expect(gameModeSelect.disabled).toBe(true);

    app.tick(120);
    app.tick(120);

    expect(app.getState().status).toBe("running");
    expect(app.getState().wallMode).toBe("wrap");
    expect(app.getState().snake[0]).toEqual({ x: 0, y: 2 });
  });

  it("updates and persists best score when food is eaten", () => {
    renderAppShell();
    const canvas = getGameCanvas();
    const storage = createScoreStorage({
      classic: { solid: 0, wrap: 4 },
      "time-attack": { solid: 0, wrap: 0 }
    });

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
    expect(storage.saves).toEqual([
      { gameMode: "classic", wallMode: "solid", score: 1 }
    ]);
  });

  it("shows best score for selected wall and mode between rounds", () => {
    renderAppShell();
    const canvas = getGameCanvas();
    const wallModeSelect = getWallModeSelect();
    const gameModeSelect = getGameModeSelect();
    const storage = createScoreStorage({
      classic: { solid: 2, wrap: 9 },
      "time-attack": { solid: 5, wrap: 12 }
    });

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

    wallModeSelect.value = "wrap";
    wallModeSelect.dispatchEvent(new Event("change", { bubbles: true }));
    expect(document.getElementById("best-score")?.textContent).toBe("9");

    gameModeSelect.value = "time-attack";
    gameModeSelect.dispatchEvent(new Event("change", { bubbles: true }));
    expect(document.getElementById("best-score")?.textContent).toBe("12");
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

  it("shows power-up statuses and applies slow timing while active", () => {
    renderAppShell();
    const canvas = getGameCanvas();

    app = mountSnakeGame(document, {
      autoStart: false,
      initialFood: { x: 13, y: 12 },
      random: () => 0,
      spawnFood: () => ({ x: 0, y: 0 }),
      spawnPowerUp: () => ({ type: "slow", position: { x: 14, y: 12 } }),
      renderer: createTestRenderer(canvas)
    });

    app.tick(120);
    expect(document.getElementById("board-power-up")?.textContent).toContain("Slow (50)");

    app.tick(120);
    expect(document.getElementById("active-power-up")?.textContent).toContain("Slow (40)");
    expect(document.getElementById("board-power-up")?.textContent).toBe("None");

    const headBefore = app.getState().snake[0];
    app.tick(179);
    expect(app.getState().snake[0]).toEqual(headBefore);
    app.tick(1);
    expect(app.getState().snake[0]).toEqual({ x: headBefore.x + 1, y: headBefore.y });
  });

  it("maintains three feast foods and clears them when feast ends", () => {
    renderAppShell();
    const canvas = getGameCanvas();

    app = mountSnakeGame(document, {
      autoStart: false,
      wallMode: "wrap",
      initialFood: { x: 13, y: 12 },
      random: () => 0,
      spawnFood: () => ({ x: 0, y: 0 }),
      spawnPowerUp: () => ({ type: "feast", position: { x: 14, y: 12 } }),
      renderer: createTestRenderer(canvas)
    });

    app.tick(120);
    app.tick(120);

    expect(document.getElementById("active-power-up")?.textContent).toContain("Feast (40)");
    expect(app.getState().extraFoods).toHaveLength(3);

    for (let step = 0; step < 40; step += 1) {
      app.tick(120);
    }

    expect(document.getElementById("active-power-up")?.textContent).toBe("None");
    expect(app.getState().extraFoods).toEqual([]);
  });

  it("ends time attack when countdown reaches zero", () => {
    renderAppShell();
    const canvas = getGameCanvas();
    const gameModeSelect = getGameModeSelect();
    const wallModeSelect = getWallModeSelect();

    app = mountSnakeGame(document, {
      autoStart: false,
      wallMode: "wrap",
      gameMode: "time-attack",
      initialFood: { x: 0, y: 0 },
      renderer: createTestRenderer(canvas)
    });

    expect(gameModeSelect.value).toBe("time-attack");
    expect(document.getElementById("time-remaining")?.textContent).toBe("60.0");

    app.tick(1_000);
    expect(document.getElementById("time-remaining")?.textContent).toBe("59.0");
    expect(wallModeSelect.disabled).toBe(true);
    expect(gameModeSelect.disabled).toBe(true);

    app.tick(59_000);
    expect(app.getState().status).toBe("game-over");
    expect(app.getState().endReason).toBe("time-expired");
    expect(document.getElementById("game-status")?.textContent).toContain("Time is up");
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
