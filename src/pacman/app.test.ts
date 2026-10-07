// @vitest-environment jsdom

import { mountPacmanGame, type PacmanApp } from "./app";
import { createInitialPacmanState, type PacmanState } from "./state";
import type { PacmanRenderer } from "./render";
import type { PacmanScoreStorage } from "../storage";

function renderArcadeHost(): void {
  document.body.innerHTML = `<div class="arcade-game-host"></div>`;
}

function createTestRenderer(): {
  readonly renderer: PacmanRenderer;
  readonly renders: PacmanState[];
} {
  const renders: PacmanState[] = [];
  return {
    renderer: {
      render(state): void {
        renders.push(state);
      }
    },
    renders
  };
}

function createScoreStorage(initialBestScore = 0): PacmanScoreStorage & { saves: number[] } {
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

function pressKey(key: string): KeyboardEvent {
  const event = new KeyboardEvent("keydown", {
    key,
    bubbles: true,
    cancelable: true
  });
  window.dispatchEvent(event);
  return event;
}

describe("mountPacmanGame", () => {
  let app: PacmanApp | null = null;

  afterEach(() => {
    app?.destroy();
    app = null;
    document.body.innerHTML = "";
  });

  it("renders HUD fields and persists improved best score", () => {
    renderArcadeHost();
    const { renderer, renders } = createTestRenderer();
    const storage = createScoreStorage(120);
    const initialState = {
      ...createInitialPacmanState({ bestScore: 120 }),
      score: 180,
      candidateBestScore: 180
    };

    app = mountPacmanGame(document, {
      autoStart: false,
      renderer,
      storage,
      createInitialState: () => initialState
    });

    expect(document.getElementById("pacman-score")?.textContent).toBe("180");
    expect(document.getElementById("pacman-best-score")?.textContent).toBe("180");
    expect(document.getElementById("pacman-lives")?.textContent).toBe("3");
    expect(document.getElementById("pacman-round")?.textContent).toBe("1");
    expect(document.getElementById("pacman-ghost-mode")?.textContent).toBe("scatter");
    expect(storage.saves).toEqual([180]);
    expect(renders[renders.length - 1]).toBeDefined();
  });

  it("queues movement keys while running", () => {
    renderArcadeHost();
    const { renderer } = createTestRenderer();

    app = mountPacmanGame(document, {
      autoStart: false,
      renderer
    });

    const keyEvent = pressKey("ArrowUp");
    expect(keyEvent.defaultPrevented).toBe(true);
    expect(app.getState().player.queuedDirection).toBe("up");
  });

  it("pauses and resumes from keyboard and button", () => {
    renderArcadeHost();
    const { renderer } = createTestRenderer();

    app = mountPacmanGame(document, {
      autoStart: false,
      renderer
    });

    const pauseEvent = pressKey("p");
    expect(pauseEvent.defaultPrevented).toBe(true);
    expect(app.getState().status).toBe("paused");
    expect(document.getElementById("pacman-status")?.textContent).toContain("Paused");

    const pausedState = app.getState();
    app.tick(3_000);
    expect(app.getState()).toEqual(pausedState);

    const pauseButton = document.getElementById("pacman-pause-button");
    if (!(pauseButton instanceof HTMLButtonElement)) {
      throw new Error("Missing pause button");
    }
    pauseButton.click();
    expect(app.getState().status).toBe("running");
  });

  it("restarts with R after game over", () => {
    renderArcadeHost();
    const { renderer } = createTestRenderer();
    const gameOverState = {
      ...createInitialPacmanState(),
      status: "game-over" as const,
      lives: 0,
      score: 240,
      candidateBestScore: 240
    };

    app = mountPacmanGame(document, {
      autoStart: false,
      renderer,
      createInitialState: () => gameOverState
    });

    expect(document.getElementById("pacman-status")?.textContent).toContain("Game over");
    const restartEvent = pressKey("r");
    expect(restartEvent.defaultPrevented).toBe(true);
    expect(app.getState().status).toBe("running");
    expect(app.getState().lives).toBe(3);
    expect(app.getState().score).toBe(0);
  });

  it("cleans up listeners and mounted markup on destroy", () => {
    renderArcadeHost();
    const { renderer, renders } = createTestRenderer();

    app = mountPacmanGame(document, {
      autoStart: false,
      renderer
    });

    const renderCountBeforeDestroy = renders.length;
    app.destroy();
    app = null;

    const rootHost = document.querySelector(".arcade-game-host");
    expect(rootHost?.innerHTML).toBe("");
    pressKey("ArrowLeft");
    expect(renders).toHaveLength(renderCountBeforeDestroy);
  });
});
