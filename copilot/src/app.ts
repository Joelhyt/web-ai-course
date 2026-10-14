import { createCanvasRenderer, type GameRenderer } from "./game/render";
import {
  DEFAULT_BOARD,
  TIME_ATTACK_DURATION_MS,
  advanceGame,
  createInitialGameState,
  elapseTime,
  getEffectiveTickInterval,
  getTickIntervalForScore,
  queueDirectionChange,
  spawnFoodAtRandomFreeCell,
  type RandomFn,
  type SpawnFoodFn,
  type SpawnPowerUpFn
} from "./game/state";
import type {
  BoardSize,
  Direction,
  GameMode,
  GameState,
  PowerUpType,
  WallMode
} from "./game/types";
import { createBrowserScoreStorage, type ScoreStorage } from "./storage";

export interface SnakeAppOptions {
  readonly board?: BoardSize;
  readonly wallMode?: WallMode;
  readonly gameMode?: GameMode;
  readonly initialFood?: { x: number; y: number };
  readonly tickMs?: number;
  readonly random?: RandomFn;
  readonly spawnFood?: SpawnFoodFn;
  readonly spawnPowerUp?: SpawnPowerUpFn;
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

function formatPowerUpName(type: PowerUpType): string {
  if (type === "slow") {
    return "Slow";
  }
  if (type === "ghost") {
    return "Ghost";
  }
  if (type === "magnet") {
    return "Magnet";
  }
  return "Feast";
}

function formatTimeRemaining(timeRemainingMs: number | null): string {
  if (timeRemainingMs === null) {
    return "—";
  }
  return (timeRemainingMs / 1000).toFixed(1);
}

function buildStatusText(state: GameState): string {
  const wallModeText =
    state.wallMode === "solid" ? "Walls: Solid." : "Walls: Wrap around.";
  const modeText =
    state.gameMode === "classic" ? "Mode: Classic." : "Mode: Time Attack.";
  const timeText =
    state.gameMode === "time-attack"
      ? ` Time left ${formatTimeRemaining(state.timeRemainingMs)}s.`
      : "";

  if (state.status === "running") {
    return `Game running. ${modeText} ${wallModeText}${timeText} Use Arrow keys or WASD to move.`;
  }

  if (state.gameMode === "time-attack" && state.endReason === "time-expired") {
    return `Game over. Time is up. Score ${state.score}. ${modeText} ${wallModeText} Press R or use Restart.`;
  }

  return `Game over. Score ${state.score}. ${modeText} ${wallModeText} Press R or use Restart.`;
}

function formatActivePowerUps(state: GameState): string {
  if (state.activePowerUps.length === 0) {
    return "None";
  }
  return state.activePowerUps
    .map((powerUp) => `${formatPowerUpName(powerUp.type)} (${powerUp.remainingSteps})`)
    .join(", ");
}

function formatBoardPowerUps(state: GameState): string {
  if (state.boardPowerUps.length === 0) {
    return "None";
  }
  return state.boardPowerUps
    .map((powerUp) => `${formatPowerUpName(powerUp.type)} (${powerUp.remainingSteps})`)
    .join(", ");
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

function parseGameMode(value: string): GameMode {
  return value === "time-attack" ? "time-attack" : "classic";
}

function createBestScoreSnapshot(storage: ScoreStorage): Record<GameMode, Record<WallMode, number>> {
  return {
    classic: {
      solid: storage.loadBestScore("classic", "solid"),
      wrap: storage.loadBestScore("classic", "wrap")
    },
    "time-attack": {
      solid: storage.loadBestScore("time-attack", "solid"),
      wrap: storage.loadBestScore("time-attack", "wrap")
    }
  };
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
  const timeRemainingElement = getRequiredElement(
    root,
    "time-remaining",
    HTMLSpanElement
  );
  const activePowerUpElement = getRequiredElement(
    root,
    "active-power-up",
    HTMLSpanElement
  );
  const boardPowerUpElement = getRequiredElement(
    root,
    "board-power-up",
    HTMLSpanElement
  );
  const statusElement = getRequiredElement(root, "game-status", HTMLParagraphElement);
  const restartButton = getRequiredElement(
    root,
    "restart-button",
    HTMLButtonElement
  );
  const wallModeSelect = getRequiredElement(root, "wall-mode", HTMLSelectElement);
  const gameModeSelect = getRequiredElement(root, "game-mode", HTMLSelectElement);
  const canvas = getRequiredElement(root, "game-canvas", HTMLCanvasElement);

  const storage = options.storage ?? createBrowserScoreStorage();
  const random = options.random ?? Math.random;
  const spawnFood = options.spawnFood ?? spawnFoodAtRandomFreeCell;
  const spawnPowerUp = options.spawnPowerUp;
  const board = options.board ?? DEFAULT_BOARD;
  const frameFallbackMs = options.tickMs ?? getTickIntervalForScore(0);

  let selectedWallMode = options.wallMode ?? parseWallMode(wallModeSelect.value);
  let selectedGameMode = options.gameMode ?? parseGameMode(gameModeSelect.value);
  wallModeSelect.value = selectedWallMode;
  gameModeSelect.value = selectedGameMode;

  const bestScores = createBestScoreSnapshot(storage);
  const renderer = options.renderer ?? createCanvasRenderer(canvas);

  let state = createInitialGameState({
    board,
    gameMode: selectedGameMode,
    wallMode: selectedWallMode,
    initialFood: options.initialFood,
    random,
    spawnFood,
    bestScore: bestScores[selectedGameMode][selectedWallMode]
  });

  let accumulator = 0;
  let frameId: number | null = null;
  let lastTimestamp: number | null = null;

  function syncUi(previousStatus: GameState["status"]): void {
    const isRunning = state.status === "running";
    const bestForSelection = bestScores[selectedGameMode][selectedWallMode];
    const displayState = isRunning
      ? state
      : {
          ...state,
          gameMode: selectedGameMode,
          wallMode: selectedWallMode,
          timeRemainingMs:
            selectedGameMode === "time-attack"
              ? TIME_ATTACK_DURATION_MS
              : null
        };

    scoreElement.textContent = String(state.score);
    bestScoreElement.textContent = String(
      isRunning ? state.bestScore : bestForSelection
    );
    timeRemainingElement.textContent = formatTimeRemaining(state.timeRemainingMs);
    activePowerUpElement.textContent = formatActivePowerUps(state);
    boardPowerUpElement.textContent = formatBoardPowerUps(state);
    statusElement.textContent = buildStatusText(displayState);
    restartButton.hidden = isRunning;
    restartButton.disabled = isRunning;
    wallModeSelect.disabled = isRunning;
    gameModeSelect.disabled = isRunning;
    wallModeSelect.value = selectedWallMode;
    gameModeSelect.value = selectedGameMode;
    renderer.render(displayState);

    if (previousStatus === "running" && !isRunning) {
      restartButton.focus();
    }
  }

  function step(currentState: GameState): GameState {
    const nextState = advanceGame(currentState, { random, spawnFood, spawnPowerUp });

    if (nextState.bestScore > currentState.bestScore) {
      bestScores[nextState.gameMode][nextState.wallMode] = nextState.bestScore;
      storage.saveBestScore(
        nextState.gameMode,
        nextState.wallMode,
        nextState.bestScore
      );
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
      gameMode: selectedGameMode,
      wallMode: selectedWallMode,
      initialFood: options.initialFood,
      random,
      spawnFood,
      bestScore: bestScores[selectedGameMode][selectedWallMode]
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

  function onGameModeChange(): void {
    if (state.status === "running") {
      gameModeSelect.value = selectedGameMode;
      return;
    }

    selectedGameMode = parseGameMode(gameModeSelect.value);
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

      const previousStatus = state.status;
      state = elapseTime(state, elapsedMs);
      if (state.status !== "running") {
        accumulator = 0;
        syncUi(previousStatus);
        stopLoop();
        return;
      }

      accumulator += elapsedMs;

      while (state.status === "running") {
        const interval = getEffectiveTickInterval(state);
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
      gameModeSelect.removeEventListener("change", onGameModeChange);
    },
    getState(): GameState {
      return state;
    }
  };

  window.addEventListener("keydown", onKeyDown);
  restartButton.addEventListener("click", onRestartClick);
  wallModeSelect.addEventListener("change", onWallModeChange);
  gameModeSelect.addEventListener("change", onGameModeChange);
  syncUi(state.status);

  if (options.autoStart !== false) {
    api.start();
  }

  return api;
}
