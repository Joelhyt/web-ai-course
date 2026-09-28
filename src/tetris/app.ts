import { createTetrisCanvasRenderer, type TetrisRenderer } from "./render";
import {
  advanceTetrisState,
  createInitialTetrisState,
  getGravityIntervalMs,
  hardDrop,
  holdActivePiece,
  moveActivePiece,
  rotateActivePieceClockwise,
  softDrop,
  togglePause
} from "./state";
import type { TetrisState } from "./types";
import {
  createBrowserTetrisScoreStorage,
  type TetrisScoreStorage
} from "../storage";

export interface TetrisAppOptions {
  readonly randomSeed?: number;
  readonly tickMs?: number;
  readonly autoStart?: boolean;
  readonly storage?: TetrisScoreStorage;
  readonly renderer?: TetrisRenderer;
  readonly createInitialState?: () => TetrisState;
}

export interface TetrisApp {
  start(): void;
  stop(): void;
  restart(): void;
  tick(elapsedMs?: number): void;
  destroy(): void;
  getState(): TetrisState;
}

const TETRIS_MARKUP = `
  <main class="app tetris-app">
    <h1>Tetris</h1>
    <section class="hud tetris-hud" aria-label="Tetris scoreboard">
      <p>Score: <span id="tetris-score">0</span></p>
      <p>Best: <span id="tetris-best-score">0</span></p>
      <p>Level: <span id="tetris-level">1</span></p>
      <p>Lines: <span id="tetris-lines">0</span></p>
      <p>Next: <span id="tetris-next-piece">-</span></p>
      <p>Hold: <span id="tetris-hold-piece">-</span></p>
    </section>
    <p id="tetris-status" class="status" aria-live="polite"></p>
    <canvas id="tetris-canvas" role="img" aria-label="Tetris game board"></canvas>
    <div class="tetris-controls">
      <button id="tetris-pause-button" type="button">Pause</button>
      <button id="tetris-restart-button" type="button" hidden disabled>Restart</button>
    </div>
    <p class="instructions">
      Controls: Left/Right to move, Down soft drop, Up or X rotate, Space hard drop,
      C hold, P pause/resume, and R restart after game over.
    </p>
  </main>
`;

function getRequiredElement<T extends Element>(
  root: ParentNode,
  selector: string,
  expectedType: { new (): T }
): T {
  const element = root.querySelector(selector);
  if (!(element instanceof expectedType)) {
    throw new Error(`Missing required element: ${selector}`);
  }
  return element;
}

function scheduleFrame(
  hostWindow: Window,
  callback: FrameRequestCallback,
  fallbackMs: number,
  now: () => number
): number {
  if (typeof hostWindow.requestAnimationFrame === "function") {
    return hostWindow.requestAnimationFrame(callback);
  }

  return hostWindow.setTimeout(() => callback(now()), fallbackMs);
}

function cancelFrame(hostWindow: Window, handle: number): void {
  if (typeof hostWindow.cancelAnimationFrame === "function") {
    hostWindow.cancelAnimationFrame(handle);
    return;
  }

  hostWindow.clearTimeout(handle);
}

function buildStatusText(state: TetrisState): string {
  if (state.status === "paused") {
    return "Paused. Press P or Pause to resume.";
  }
  if (state.status === "game-over") {
    return `Game over. Score ${state.score}. Press R or Restart.`;
  }
  return "Game running. Stack pieces and clear lines.";
}

function mountGameShell(root: Document): HTMLElement {
  const host = root.querySelector<HTMLElement>(".arcade-game-host");
  if (!(host instanceof HTMLElement)) {
    throw new Error("Missing .arcade-game-host");
  }
  host.innerHTML = TETRIS_MARKUP;
  return host;
}

function persistBestScore(
  state: TetrisState,
  storage: TetrisScoreStorage,
  currentBestScore: number
): number {
  if (state.score <= currentBestScore) {
    return currentBestScore;
  }

  storage.saveBestScore(state.score);
  return state.score;
}

export function mountTetrisGame(
  root: Document = document,
  options: TetrisAppOptions = {}
): TetrisApp {
  const hostWindow = root.defaultView ?? window;
  const now = (): number => hostWindow.performance?.now() ?? Date.now();
  const shell = mountGameShell(root);
  const storage = options.storage ?? createBrowserTetrisScoreStorage();
  const renderer =
    options.renderer ??
    createTetrisCanvasRenderer(
      getRequiredElement(shell, "#tetris-canvas", HTMLCanvasElement)
    );

  const scoreElement = getRequiredElement(shell, "#tetris-score", HTMLSpanElement);
  const bestScoreElement = getRequiredElement(
    shell,
    "#tetris-best-score",
    HTMLSpanElement
  );
  const levelElement = getRequiredElement(shell, "#tetris-level", HTMLSpanElement);
  const linesElement = getRequiredElement(shell, "#tetris-lines", HTMLSpanElement);
  const nextPieceElement = getRequiredElement(
    shell,
    "#tetris-next-piece",
    HTMLSpanElement
  );
  const holdPieceElement = getRequiredElement(
    shell,
    "#tetris-hold-piece",
    HTMLSpanElement
  );
  const statusElement = getRequiredElement(shell, "#tetris-status", HTMLParagraphElement);
  const pauseButton = getRequiredElement(
    shell,
    "#tetris-pause-button",
    HTMLButtonElement
  );
  const restartButton = getRequiredElement(
    shell,
    "#tetris-restart-button",
    HTMLButtonElement
  );

  function createFreshState(): TetrisState {
    if (typeof options.createInitialState === "function") {
      return options.createInitialState();
    }
    return createInitialTetrisState({ randomSeed: options.randomSeed });
  }

  let bestScore = storage.loadBestScore();
  let state = createFreshState();
  bestScore = persistBestScore(state, storage, bestScore);
  let accumulator = 0;
  let frameId: number | null = null;
  let lastTimestamp: number | null = null;
  let isDestroyed = false;
  const frameFallbackMs = options.tickMs ?? getGravityIntervalMs(state);

  function syncUi(previousStatus: TetrisState["status"]): void {
    scoreElement.textContent = String(state.score);
    bestScoreElement.textContent = String(bestScore);
    levelElement.textContent = String(state.level);
    linesElement.textContent = String(state.totalLinesCleared);
    nextPieceElement.textContent = state.nextPiece;
    holdPieceElement.textContent = state.heldPiece ?? "-";
    statusElement.textContent = buildStatusText(state);
    pauseButton.textContent = state.status === "paused" ? "Resume" : "Pause";
    pauseButton.disabled = state.status === "game-over";
    restartButton.hidden = state.status !== "game-over";
    restartButton.disabled = state.status !== "game-over";
    renderer.render(state);

    if (previousStatus === "running" && state.status === "game-over") {
      restartButton.focus();
    }
  }

  function stopLoop(): void {
    if (frameId !== null) {
      cancelFrame(hostWindow, frameId);
      frameId = null;
    }
    lastTimestamp = null;
  }

  function frame(timestamp: number): void {
    if (frameId === null) {
      return;
    }

    if (lastTimestamp === null) {
      lastTimestamp = timestamp;
    }

    const elapsedMs = timestamp - lastTimestamp;
    lastTimestamp = timestamp;
    api.tick(elapsedMs);

    if (frameId !== null) {
      frameId = scheduleFrame(hostWindow, frame, frameFallbackMs, now);
    }
  }

  function restartGame(): void {
    state = createFreshState();
    bestScore = persistBestScore(state, storage, bestScore);
    accumulator = 0;
    syncUi("game-over");
    api.start();
  }

  function onPauseClick(): void {
    if (state.status === "game-over") {
      return;
    }

    const previousStatus = state.status;
    state = togglePause(state);
    syncUi(previousStatus);

    if (state.status === "running") {
      api.start();
    } else {
      stopLoop();
    }
  }

  function onRestartClick(): void {
    restartGame();
  }

  function onKeyDown(event: KeyboardEvent): void {
    const key = event.key.toLowerCase();
    const isSpaceKey = key === " " || key === "spacebar" || event.code === "Space";
    const previousStatus = state.status;

    if (key === "r" && state.status === "game-over") {
      event.preventDefault();
      restartGame();
      return;
    }

    if (key === "p") {
      event.preventDefault();
      onPauseClick();
      return;
    }

    if (state.status !== "running") {
      return;
    }

    if (key === "arrowleft") {
      event.preventDefault();
      state = moveActivePiece(state, "left");
    } else if (key === "arrowright") {
      event.preventDefault();
      state = moveActivePiece(state, "right");
    } else if (key === "arrowdown") {
      event.preventDefault();
      state = softDrop(state);
    } else if (key === "arrowup" || key === "x") {
      event.preventDefault();
      state = rotateActivePieceClockwise(state);
    } else if (isSpaceKey) {
      event.preventDefault();
      state = hardDrop(state);
    } else if (key === "c") {
      event.preventDefault();
      state = holdActivePiece(state);
    } else {
      return;
    }

    bestScore = persistBestScore(state, storage, bestScore);
    syncUi(previousStatus);

    if (state.status !== "running") {
      stopLoop();
    }
  }

  const api: TetrisApp = {
    start(): void {
      if (isDestroyed || frameId !== null || state.status !== "running") {
        return;
      }
      frameId = scheduleFrame(hostWindow, frame, frameFallbackMs, now);
    },
    stop(): void {
      stopLoop();
    },
    restart(): void {
      restartGame();
    },
    tick(elapsedMs = frameFallbackMs): void {
      if (state.status !== "running") {
        return;
      }

      const previousStatus = state.status;
      accumulator += elapsedMs;

      while (state.status === "running") {
        const interval = getGravityIntervalMs(state);
        if (accumulator < interval) {
          break;
        }
        state = advanceTetrisState(state);
        accumulator -= interval;
      }

      bestScore = persistBestScore(state, storage, bestScore);
      syncUi(previousStatus);

      if (state.status !== "running") {
        stopLoop();
      }
    },
    destroy(): void {
      if (isDestroyed) {
        return;
      }
      isDestroyed = true;
      stopLoop();
      hostWindow.removeEventListener("keydown", onKeyDown);
      pauseButton.removeEventListener("click", onPauseClick);
      restartButton.removeEventListener("click", onRestartClick);
      shell.innerHTML = "";
    },
    getState(): TetrisState {
      return state;
    }
  };

  hostWindow.addEventListener("keydown", onKeyDown);
  pauseButton.addEventListener("click", onPauseClick);
  restartButton.addEventListener("click", onRestartClick);
  syncUi(state.status);

  if (options.autoStart !== false) {
    api.start();
  }

  return api;
}
