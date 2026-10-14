import { mountSnakeGame as defaultMountSnakeGame } from "./app";

type GameId = "snake" | "tetris" | "pacman";

export interface DestroyableGame {
  destroy(): void;
}

export type GameMountFactory = (
  root?: Document
) => DestroyableGame | Promise<DestroyableGame>;

interface TetrisModule {
  mountTetrisGame?: GameMountFactory;
}

interface PacmanModule {
  mountPacmanGame?: GameMountFactory;
}

export interface ArcadeOptions {
  readonly hostId?: string;
  readonly mountSnakeGame?: GameMountFactory;
  readonly loadTetrisMount?: () => Promise<GameMountFactory>;
  readonly loadPacmanMount?: () => Promise<GameMountFactory>;
}

export interface ArcadeApp {
  destroy(): void;
  getActiveGame(): GameId | null;
}

const DEFAULT_HOST_ID = "arcade-root";

const HOME_MARKUP = `
  <section class="arcade-home" aria-label="Game launcher">
    <header class="arcade-home-header">
      <h1>Game Arcade</h1>
      <p>Choose a game to start a fresh run.</p>
    </header>
    <p id="arcade-status" class="arcade-status" role="status" aria-live="polite"></p>
    <ul class="arcade-card-grid">
      <li class="arcade-card">
        <h2>Snake</h2>
        <p>
          Classic Snake with wall modes, Time Attack, and stacked power-up play.
        </p>
        <button type="button" class="arcade-play-button" data-game="snake">
          Play Snake
        </button>
      </li>
      <li class="arcade-card">
        <h2>Tetris</h2>
        <p>
          Modern Tetris core with hold, next-piece preview, pause support, and
          local best score tracking.
        </p>
        <button type="button" class="arcade-play-button" data-game="tetris">
          Play Tetris
        </button>
      </li>
      <li class="arcade-card">
        <h2>Pac-Man</h2>
        <p>
          Navigate the original maze, dodge colorful ghosts, and chase fruit
          bonuses between power-pellet runs.
        </p>
        <button type="button" class="arcade-play-button" data-game="pacman">
          Play Pac-Man
        </button>
      </li>
    </ul>
  </section>
`;

const SNAKE_MARKUP = `
  <main class="app">
    <h1>Snake</h1>
    <section class="hud" aria-label="Scoreboard">
      <p>Score: <span id="score">0</span></p>
      <p>Best: <span id="best-score">0</span></p>
      <p>Time left: <span id="time-remaining">—</span>s</p>
      <label class="mode-control" for="game-mode">
        Mode:
        <select id="game-mode">
          <option value="classic">Classic</option>
          <option value="time-attack">Time Attack</option>
        </select>
      </label>
      <label class="mode-control" for="wall-mode">
        Walls:
        <select id="wall-mode">
          <option value="solid">Solid</option>
          <option value="wrap">Wrap around</option>
        </select>
      </label>
    </section>
    <section class="hud secondary-hud" aria-label="Power-up status">
      <p>Active power-up: <span id="active-power-up">None</span></p>
      <p>Board power-up: <span id="board-power-up">None</span></p>
    </section>
    <p id="game-status" class="status" aria-live="polite"></p>
    <canvas id="game-canvas" role="img" aria-label="Snake game board"></canvas>
    <p class="instructions">
      Controls: Arrow keys or WASD to move. Press R to restart after game over.
      Game mode and wall mode can be changed between rounds. Power-up legend:
      <strong>S</strong> Slow, <strong>G</strong> Ghost, <strong>M</strong>
      Magnet, <strong>F</strong> Feast (spawns temporary gold foods). Ghost adds
      a purple snake outline while active. Time Attack:
      60 seconds, stacked power-ups, faster uncapped speed.
    </p>
    <button id="restart-button" type="button" hidden disabled>Restart</button>
  </main>
`;

function getHostElement(root: Document, hostId: string): HTMLElement {
  const element = root.getElementById(hostId);
  if (!(element instanceof HTMLElement)) {
    throw new Error(`Missing required host element: #${hostId}`);
  }
  return element;
}

async function loadDefaultTetrisMount(): Promise<GameMountFactory> {
  const importedModule = (await import("./tetris/app")) as TetrisModule;

  if (typeof importedModule.mountTetrisGame !== "function") {
    throw new Error("Expected mountTetrisGame export from src/tetris/app.ts");
  }

  return importedModule.mountTetrisGame;
}

async function loadDefaultPacmanMount(): Promise<GameMountFactory> {
  const importedModule = (await import("./pacman/app")) as PacmanModule;

  if (typeof importedModule.mountPacmanGame !== "function") {
    throw new Error("Expected mountPacmanGame export from src/pacman/app.ts");
  }

  return importedModule.mountPacmanGame;
}

function gameTitle(gameId: GameId): string {
  if (gameId === "snake") {
    return "Snake";
  }
  if (gameId === "tetris") {
    return "Tetris";
  }
  return "Pac-Man";
}

function renderGameShell(host: HTMLElement): HTMLButtonElement {
  host.innerHTML = `
    <section class="arcade-game-view">
      <button type="button" class="arcade-back-button" data-action="back-to-games">
        Back to games
      </button>
      <div class="arcade-game-host"></div>
    </section>
  `;
  const backButton = host.querySelector<HTMLButtonElement>(
    "[data-action='back-to-games']"
  );
  if (!(backButton instanceof HTMLButtonElement)) {
    throw new Error("Missing Back to games button");
  }
  return backButton;
}

export function mountArcade(
  root: Document = document,
  options: ArcadeOptions = {}
): ArcadeApp {
  const host = getHostElement(root, options.hostId ?? DEFAULT_HOST_ID);
  const mountSnake = options.mountSnakeGame ?? defaultMountSnakeGame;
  const loadTetrisMount = options.loadTetrisMount ?? loadDefaultTetrisMount;
  const loadPacmanMount = options.loadPacmanMount ?? loadDefaultPacmanMount;

  let destroyed = false;
  let activeGameId: GameId | null = null;
  let activeGame: DestroyableGame | null = null;
  let transitionToken = 0;
  const listenerCleanups: Array<() => void> = [];

  function addListener<K extends keyof HTMLElementEventMap>(
    element: HTMLElement,
    eventName: K,
    listener: (event: HTMLElementEventMap[K]) => void
  ): void {
    element.addEventListener(eventName, listener as EventListener);
    listenerCleanups.push(() => {
      element.removeEventListener(eventName, listener as EventListener);
    });
  }

  function removeListeners(): void {
    while (listenerCleanups.length > 0) {
      const cleanup = listenerCleanups.pop();
      cleanup?.();
    }
  }

  function destroyActiveGame(): void {
    if (activeGame !== null) {
      activeGame.destroy();
      activeGame = null;
      activeGameId = null;
    }
  }

  function updateHomeStatus(message: string): void {
    const status = host.querySelector<HTMLElement>("#arcade-status");
    if (status !== null) {
      status.textContent = message;
    }
  }

  function renderHome(statusMessage = ""): void {
    removeListeners();
    host.innerHTML = HOME_MARKUP;
    updateHomeStatus(statusMessage);

    const snakeButton = host.querySelector<HTMLButtonElement>("[data-game='snake']");
    const tetrisButton = host.querySelector<HTMLButtonElement>(
      "[data-game='tetris']"
    );
    const pacmanButton = host.querySelector<HTMLButtonElement>(
      "[data-game='pacman']"
    );

    if (!(snakeButton instanceof HTMLButtonElement)) {
      throw new Error("Missing Snake launcher button");
    }
    if (!(tetrisButton instanceof HTMLButtonElement)) {
      throw new Error("Missing Tetris launcher button");
    }
    if (!(pacmanButton instanceof HTMLButtonElement)) {
      throw new Error("Missing Pac-Man launcher button");
    }

    addListener(snakeButton, "click", () => {
      void launchGame("snake");
    });
    addListener(tetrisButton, "click", () => {
      void launchGame("tetris");
    });
    addListener(pacmanButton, "click", () => {
      void launchGame("pacman");
    });
  }

  function createBackHandler(): () => void {
    const tokenAtRegistration = transitionToken;
    return () => {
      if (destroyed || tokenAtRegistration !== transitionToken) {
        return;
      }
      transitionToken += 1;
      removeListeners();
      destroyActiveGame();
      renderHome();
    };
  }

  async function launchGame(gameId: GameId): Promise<void> {
    if (destroyed) {
      return;
    }

    transitionToken += 1;
    const token = transitionToken;
    removeListeners();
    destroyActiveGame();

    const backButton = renderGameShell(host);
    addListener(backButton, "click", createBackHandler());

    if (gameId === "snake") {
      const gameHost = host.querySelector<HTMLElement>(".arcade-game-host");
      if (gameHost === null) {
        throw new Error("Missing game host container");
      }
      gameHost.innerHTML = SNAKE_MARKUP;
    } else {
      const gameHost = host.querySelector<HTMLElement>(".arcade-game-host");
      if (gameHost === null) {
        throw new Error("Missing game host container");
      }
      gameHost.innerHTML = `<p class="arcade-status" role="status" aria-live="polite">Loading ${gameTitle(
        gameId
      )}…</p>`;
    }

    try {
      const mountGame =
        gameId === "snake"
          ? mountSnake
          : gameId === "tetris"
            ? await loadTetrisMount()
            : await loadPacmanMount();
      const mounted = await mountGame(root);

      if (destroyed || token !== transitionToken) {
        mounted.destroy();
        return;
      }

      activeGame = mounted;
      activeGameId = gameId;
    } catch {
      if (destroyed || token !== transitionToken) {
        return;
      }
      transitionToken += 1;
      removeListeners();
      destroyActiveGame();
      renderHome(`${gameTitle(gameId)} is currently unavailable.`);
    }
  }

  renderHome();

  return {
    destroy(): void {
      if (destroyed) {
        return;
      }
      destroyed = true;
      transitionToken += 1;
      removeListeners();
      destroyActiveGame();
      host.innerHTML = "";
    },
    getActiveGame(): GameId | null {
      return activeGameId;
    }
  };
}
