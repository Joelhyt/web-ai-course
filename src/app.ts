import { createCanvasRenderer, type GameRenderer } from "./game/render";
import {
  DEFAULT_BOARD,
  advanceGame,
  createInitialGameState,
  getTickIntervalForScore,
  queueDirectionChange,
  spawnFoodAtRandomFreeCell,
  type RandomFn,
  type SpawnFoodFn
} from "./game/state";
import type { BoardSize, Direction, GameState, WallMode } from "./game/types";
import { createBrowserScoreStorage, type ScoreStorage } from "./storage";

export interface SnakeAppOptions {
  readonly board?: BoardSize;
  readonly wallMode?: WallMode;
  readonly initialFood?: { x: number; y: number };
  readonly tickMs?: number;
  readonly random?: RandomFn;
  readonly spawnFood?: SpawnFoodFn;
  readonly storage?: ScoreStorage;
  readonly renderer?: GameRenderer;
  readonly autoStart?: boolean;
}

export interface SnakeApp {
  start(): void;
  stop(): void;
  restart(): void;
  tick(elapsedMs?: number): void;
  destroy(): void;
  getState(): GameState;
}

const DIRECTION_BY_KEY: Record<string, Direction> = {
  arrowup: "up",
  w: "up",
  arrowdown: "down",
  s: "down",
  arrowleft: "left",
  a: "left",
  arrowright: "right",
  d: "right"
};

function getRequiredElement<T extends Element>(
  root: Document,
  id: string,
  expectedType: { new (): T }
): T {
  const element = root.getElementById(id);
  if (!(element instanceof expectedType)) {
    throw new Error(`Missing required element: #${id}`);
  }
  return element;
}

function buildStatusText(state: GameState): string {
  const wallModeText =
    state.wallMode === "solid" ? "Mode: Solid walls." : "Mode: Wrap around.";

  if (state.status === "running") {
    return `Game running. ${wallModeText} Use Arrow keys or WASD to move.`;
  }

  return `Game over. Score ${state.score}. ${wallModeText} Press R or use Restart.`;
}

function scheduleFrame(callback: FrameRequestCallback, fallbackMs: number): number {
  if (typeof window.requestAnimationFrame === "function") {
    return window.requestAnimationFrame(callback);
  }

  return window.setTimeout(() => callback(performance.now()), fallbackMs);
}

function cancelFrame(handle: number): void {
  if (typeof window.cancelAnimationFrame === "function") {
    window.cancelAnimationFrame(handle);
    return;
  }

  window.clearTimeout(handle);
}

function parseWallMode(value: string): WallMode {
  return value === "wrap" ? "wrap" : "solid";
}

export function mountSnakeGame(
  root: Document = document,
  options: SnakeAppOptions = {}
): SnakeApp {
  const scoreElement = getRequiredElement(root, "score", HTMLSpanElement);
  const bestScoreElement = getRequiredElement(
    root,
    "best-score",
    HTMLSpanElement
  );
  const statusElement = getRequiredElement(root, "game-status", HTMLParagraphElement);
  const restartButton = getRequiredElement(
    root,
    "restart-button",
    HTMLButtonElement
  );
  const wallModeSelect = getRequiredElement(root, "wall-mode", HTMLSelectElement);
  const canvas = getRequiredElement(root, "game-canvas", HTMLCanvasElement);

  const storage = options.storage ?? createBrowserScoreStorage();
  const random = options.random ?? Math.random;
  const spawnFood = options.spawnFood ?? spawnFoodAtRandomFreeCell;
  const board = options.board ?? DEFAULT_BOARD;
  const frameFallbackMs = options.tickMs ?? getTickIntervalForScore(0);
  let selectedWallMode = options.wallMode ?? parseWallMode(wallModeSelect.value);
  wallModeSelect.value = selectedWallMode;
  const bestScoresByMode: Record<WallMode, number> = {
    solid: storage.loadBestScore("solid"),
    wrap: storage.loadBestScore("wrap")
  };

  const renderer = options.renderer ?? createCanvasRenderer(canvas);

  let state = createInitialGameState({
    board,
    wallMode: selectedWallMode,
    initialFood: options.initialFood,
    random,
    spawnFood,
    bestScore: bestScoresByMode[selectedWallMode]
  });

  let accumulator = 0;
  let frameId: number | null = null;
  let lastTimestamp: number | null = null;

  function syncUi(previousStatus: GameState["status"]): void {
    const isRunning = state.status === "running";
    const displayState = isRunning ? state : { ...state, wallMode: selectedWallMode };
    scoreElement.textContent = String(state.score);
    bestScoreElement.textContent = String(
      isRunning ? state.bestScore : bestScoresByMode[selectedWallMode]
    );
    statusElement.textContent = buildStatusText(displayState);
    restartButton.hidden = isRunning;
    restartButton.disabled = isRunning;
    wallModeSelect.disabled = isRunning;
    wallModeSelect.value = selectedWallMode;
    renderer.render(displayState);

    if (previousStatus === "running" && !isRunning) {
      restartButton.focus();
    }
  }

  function step(currentState: GameState): GameState {
    const nextState = advanceGame(currentState, { random, spawnFood });

    if (nextState.bestScore > currentState.bestScore) {
      bestScoresByMode[nextState.wallMode] = nextState.bestScore;
      storage.saveBestScore(nextState.wallMode, nextState.bestScore);
    }

    return nextState;
  }

  function stopLoop(): void {
    if (frameId !== null) {
      cancelFrame(frameId);
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

    const elapsed = timestamp - lastTimestamp;
    lastTimestamp = timestamp;
    api.tick(elapsed);

    if (frameId !== null) {
      frameId = scheduleFrame(frame, frameFallbackMs);
    }
  }

  function restartGame(): void {
    state = createInitialGameState({
      board: state.board,
      wallMode: selectedWallMode,
      initialFood: options.initialFood,
      random,
      spawnFood,
      bestScore: bestScoresByMode[selectedWallMode]
    });
    accumulator = 0;
    syncUi("game-over");
    api.start();
  }

  function onKeyDown(event: KeyboardEvent): void {
    const normalizedKey = event.key.toLowerCase();
    const requestedDirection = DIRECTION_BY_KEY[normalizedKey];

    if (requestedDirection) {
      if (state.status === "running") {
        event.preventDefault();
        const previousStatus = state.status;
        state = queueDirectionChange(state, requestedDirection);
        syncUi(previousStatus);
      }
      return;
    }

    if (normalizedKey === "r" && state.status === "game-over") {
      event.preventDefault();
      restartGame();
    }
  }

  function onRestartClick(): void {
    restartGame();
  }

  function onWallModeChange(): void {
    if (state.status === "running") {
      wallModeSelect.value = selectedWallMode;
      return;
    }

    selectedWallMode = parseWallMode(wallModeSelect.value);
    syncUi(state.status);
  }

  const api: SnakeApp = {
    start(): void {
      if (frameId !== null || state.status !== "running") {
        return;
      }
      frameId = scheduleFrame(frame, frameFallbackMs);
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

      accumulator += elapsedMs;
      const previousStatus = state.status;

      while (state.status === "running") {
        const interval = getTickIntervalForScore(state.score);
        if (accumulator < interval) {
          break;
        }
        state = step(state);
        accumulator -= interval;
      }

      syncUi(previousStatus);

      if (state.status !== "running") {
        stopLoop();
      }
    },
    destroy(): void {
      stopLoop();
      window.removeEventListener("keydown", onKeyDown);
      restartButton.removeEventListener("click", onRestartClick);
      wallModeSelect.removeEventListener("change", onWallModeChange);
    },
    getState(): GameState {
      return state;
    }
  };

  window.addEventListener("keydown", onKeyDown);
  restartButton.addEventListener("click", onRestartClick);
  wallModeSelect.addEventListener("change", onWallModeChange);
  syncUi(state.status);

  if (options.autoStart !== false) {
    api.start();
  }

  return api;
}
