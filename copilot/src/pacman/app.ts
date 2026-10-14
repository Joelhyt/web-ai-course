import { createPacmanCanvasRenderer, type PacmanRenderer } from "./render";
import {
  advancePacmanState,
  createInitialPacmanState,
  getPacmanStepIntervalMs,
  queueDirectionChange,
  restartGame as restartPacmanGame,
  togglePause,
  type PacmanState
} from "./state";
import {
  createBrowserPacmanScoreStorage,
  type PacmanScoreStorage
} from "../storage";

export interface PacmanAppOptions {
  readonly tickMs?: number;
  readonly autoStart?: boolean;
  readonly storage?: PacmanScoreStorage;
  readonly renderer?: PacmanRenderer;
  readonly createInitialState?: () => PacmanState;
}

export interface PacmanApp {
  start(): void;
  stop(): void;
  restart(): void;
  tick(elapsedMs?: number): void;
  destroy(): void;
  getState(): PacmanState;
}

const PACMAN_MARKUP = `
  <main class="app pacman-app">
    <h1>Pac-Man</h1>
    <section class="hud pacman-hud" aria-label="Pac-Man scoreboard">
      <p>Score: <span id="pacman-score">0</span></p>
      <p>Best: <span id="pacman-best-score">0</span></p>
      <p>Lives: <span id="pacman-lives">3</span></p>
      <p>Round: <span id="pacman-round">1</span></p>
      <p>Ghost mode: <span id="pacman-ghost-mode">scatter</span></p>
      <p>Frightened: <span id="pacman-frightened">0.0</span>s</p>
      <p>Fruit: <span id="pacman-fruit">No</span></p>
    </section>
    <p id="pacman-status" class="status" aria-live="polite"></p>
    <canvas id="pacman-canvas" role="img" aria-label="Pac-Man maze and actors"></canvas>
    <div class="tetris-controls">
      <button id="pacman-pause-button" type="button">Pause</button>
      <button id="pacman-restart-button" type="button" hidden disabled>Restart</button>
    </div>
    <p class="instructions">
      Controls: Arrow keys or WASD to steer, P pause/resume, and R restart after game over.
      Eat pellets, power pellets, and fruit while avoiding ghosts.
    </p>
  </main>
`;

const DIRECTION_KEYS = new Set([
  "arrowup",
  "arrowright",
  "arrowdown",
  "arrowleft",
  "w",
  "a",
  "s",
  "d"
]);

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

function mountGameShell(root: Document): HTMLElement {
  const host = root.querySelector<HTMLElement>(".arcade-game-host");
  if (!(host instanceof HTMLElement)) {
    throw new Error("Missing .arcade-game-host");
  }
  host.innerHTML = PACMAN_MARKUP;
  return host;
}

function formatSeconds(ms: number): string {
  return (ms / 1000).toFixed(1);
}

function buildStatusText(state: PacmanState): string {
  if (state.status === "paused") {
    return "Paused. Press P or Pause to resume.";
  }
  if (state.status === "game-over") {
    return `Game over. Score ${state.score}. Press R or Restart.`;
  }
  return "Game running. Eat pellets and avoid ghosts.";
}

function persistBestScore(
  state: PacmanState,
  storage: PacmanScoreStorage,
  bestScore: number
): number {
  if (state.candidateBestScore <= bestScore) {
    return bestScore;
  }

  storage.saveBestScore(state.candidateBestScore);
  return state.candidateBestScore;
}

export function mountPacmanGame(
  root: Document = document,
  options: PacmanAppOptions = {}
): PacmanApp {
  const hostWindow = root.defaultView ?? window;
  const now = (): number => hostWindow.performance?.now() ?? Date.now();
  const shell = mountGameShell(root);

  const scoreElement = getRequiredElement(shell, "#pacman-score", HTMLSpanElement);
  const bestScoreElement = getRequiredElement(
    shell,
    "#pacman-best-score",
    HTMLSpanElement
  );
  const livesElement = getRequiredElement(shell, "#pacman-lives", HTMLSpanElement);
  const roundElement = getRequiredElement(shell, "#pacman-round", HTMLSpanElement);
  const ghostModeElement = getRequiredElement(
    shell,
    "#pacman-ghost-mode",
    HTMLSpanElement
  );
  const frightenedElement = getRequiredElement(
    shell,
    "#pacman-frightened",
    HTMLSpanElement
  );
  const fruitElement = getRequiredElement(shell, "#pacman-fruit", HTMLSpanElement);
  const statusElement = getRequiredElement(
    shell,
    "#pacman-status",
    HTMLParagraphElement
  );
  const pauseButton = getRequiredElement(
    shell,
    "#pacman-pause-button",
    HTMLButtonElement
  );
  const restartButton = getRequiredElement(
    shell,
    "#pacman-restart-button",
    HTMLButtonElement
  );
  const canvas = getRequiredElement(shell, "#pacman-canvas", HTMLCanvasElement);

  const storage = options.storage ?? createBrowserPacmanScoreStorage();
  const renderer = options.renderer ?? createPacmanCanvasRenderer(canvas);

  function createFreshState(currentBestScore: number): PacmanState {
    if (typeof options.createInitialState === "function") {
      return options.createInitialState();
    }
    return createInitialPacmanState({ bestScore: currentBestScore });
  }

  let bestScore = storage.loadBestScore();
  let state = createFreshState(bestScore);
  bestScore = Math.max(bestScore, state.bestScore);
  bestScore = persistBestScore(state, storage, bestScore);
  let frameId: number | null = null;
  let lastTimestamp: number | null = null;
  let isDestroyed = false;
  const frameFallbackMs = options.tickMs ?? getPacmanStepIntervalMs(state.round);

  function syncUi(previousStatus: PacmanState["status"]): void {
    scoreElement.textContent = String(state.score);
    bestScoreElement.textContent = String(bestScore);
    livesElement.textContent = String(state.lives);
    roundElement.textContent = String(state.round);
    ghostModeElement.textContent = state.scheduledGhostMode;
    frightenedElement.textContent = formatSeconds(state.frightenedMsRemaining);
    fruitElement.textContent = state.fruit.active ? "Yes" : "No";
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

  function restart(): void {
    state = restartPacmanGame(state);
    bestScore = Math.max(bestScore, state.bestScore);
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
    restart();
  }

  function onKeyDown(event: KeyboardEvent): void {
    const key = event.key.toLowerCase();

    if (key === "r" && state.status === "game-over") {
      event.preventDefault();
      restart();
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

    if (!DIRECTION_KEYS.has(key)) {
      return;
    }

    event.preventDefault();
    const previousStatus = state.status;
    state = queueDirectionChange(state, event.key);
    syncUi(previousStatus);
  }

  pauseButton.addEventListener("click", onPauseClick);
  restartButton.addEventListener("click", onRestartClick);
  hostWindow.addEventListener("keydown", onKeyDown);

  syncUi(state.status);

  const api: PacmanApp = {
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
      restart();
    },
    tick(elapsedMs = frameFallbackMs): void {
      if (isDestroyed || state.status !== "running") {
        return;
      }

      const previousStatus = state.status;
      state = advancePacmanState(state, elapsedMs);
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
      pauseButton.removeEventListener("click", onPauseClick);
      restartButton.removeEventListener("click", onRestartClick);
      hostWindow.removeEventListener("keydown", onKeyDown);
      shell.innerHTML = "";
    },
    getState(): PacmanState {
      return state;
    }
  };

  if (options.autoStart !== false) {
    api.start();
  }

  return api;
}
