// @vitest-environment jsdom

import { mountArcade, type ArcadeApp, type GameMountFactory } from "./arcade";

function renderArcadeHost(): void {
  document.body.innerHTML = `<div id="arcade-root"></div>`;
}

function getPlayButton(game: "snake" | "tetris" | "pacman"): HTMLButtonElement {
  const button = document.querySelector<HTMLButtonElement>(`[data-game="${game}"]`);
  if (!(button instanceof HTMLButtonElement)) {
    throw new Error(`Missing play button for ${game}`);
  }
  return button;
}

function getBackButton(): HTMLButtonElement {
  const button = document.querySelector<HTMLButtonElement>(
    "[data-action='back-to-games']"
  );
  if (!(button instanceof HTMLButtonElement)) {
    throw new Error("Missing Back to games button");
  }
  return button;
}

async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe("mountArcade", () => {
  let arcade: ArcadeApp | null = null;

  afterEach(() => {
    arcade?.destroy();
    arcade = null;
    document.body.innerHTML = "";
  });

  it("renders an accessible launcher with Snake, Tetris, and Pac-Man cards", () => {
    renderArcadeHost();

    arcade = mountArcade(document);

    expect(document.querySelector("h1")?.textContent).toBe("Game Arcade");
    expect(getPlayButton("snake").textContent).toContain("Play Snake");
    expect(getPlayButton("tetris").textContent).toContain("Play Tetris");
    expect(getPlayButton("pacman").textContent).toContain("Play Pac-Man");
    expect(document.getElementById("arcade-status")?.getAttribute("role")).toBe(
      "status"
    );
    expect(arcade.getActiveGame()).toBeNull();
  });

  it("mounts Snake shell IDs and destroys game before returning home", () => {
    renderArcadeHost();
    const snakeDestroy = vi.fn();
    const snakeMount = vi.fn((root: Document = document) => {
      expect(root.getElementById("score")).toBeInstanceOf(HTMLSpanElement);
      expect(root.getElementById("best-score")).toBeInstanceOf(HTMLSpanElement);
      expect(root.getElementById("game-canvas")).toBeInstanceOf(HTMLCanvasElement);
      return { destroy: snakeDestroy };
    });

    arcade = mountArcade(document, {
      mountSnakeGame: snakeMount,
      loadTetrisMount: async () => {
        throw new Error("not used");
      }
    });

    getPlayButton("snake").click();
    expect(snakeMount).toHaveBeenCalledTimes(1);
    expect(arcade.getActiveGame()).toBe("snake");

    getBackButton().click();
    expect(snakeDestroy).toHaveBeenCalledTimes(1);
    expect(arcade.getActiveGame()).toBeNull();
    expect(getPlayButton("snake")).toBeInstanceOf(HTMLButtonElement);
  });

  it("loads Tetris mount factory dynamically and destroys it on back", async () => {
    renderArcadeHost();
    const tetrisDestroy = vi.fn();
    const tetrisMount = vi.fn(() => ({ destroy: tetrisDestroy }));
    const loadTetrisMount = vi.fn(async () => tetrisMount as GameMountFactory);

    arcade = mountArcade(document, {
      mountSnakeGame: () => ({ destroy: vi.fn() }),
      loadTetrisMount
    });

    getPlayButton("tetris").click();
    await flushPromises();

    expect(loadTetrisMount).toHaveBeenCalledTimes(1);
    expect(tetrisMount).toHaveBeenCalledWith(document);
    expect(arcade.getActiveGame()).toBe("tetris");

    getBackButton().click();
    expect(tetrisDestroy).toHaveBeenCalledTimes(1);
    expect(arcade.getActiveGame()).toBeNull();
  });

  it("shows loading status while waiting for the Tetris mount factory", async () => {
    renderArcadeHost();
    const tetrisDestroy = vi.fn();
    const tetrisMount = vi.fn(() => ({ destroy: tetrisDestroy }));
    let resolveLoader: ((factory: GameMountFactory) => void) | null = null;
    const loadTetrisMount = vi.fn(
      () =>
        new Promise<GameMountFactory>((resolve) => {
          resolveLoader = resolve;
        })
    );

    arcade = mountArcade(document, {
      mountSnakeGame: () => ({ destroy: vi.fn() }),
      loadTetrisMount
    });

    getPlayButton("tetris").click();

    expect(document.querySelector(".arcade-game-host .arcade-status")?.textContent).toContain(
      "Loading Tetris"
    );
    expect(arcade.getActiveGame()).toBeNull();
    expect(resolveLoader).not.toBeNull();

    resolveLoader?.(tetrisMount as GameMountFactory);
    await flushPromises();

    expect(tetrisMount).toHaveBeenCalledWith(document);
    expect(arcade.getActiveGame()).toBe("tetris");
  });

  it("disposes late Tetris mount results after user returns home", async () => {
    renderArcadeHost();
    const tetrisDestroy = vi.fn();
    const tetrisMount = vi.fn(() => ({ destroy: tetrisDestroy }));
    let resolveLoader: ((factory: GameMountFactory) => void) | null = null;
    const loadTetrisMount = vi.fn(
      () =>
        new Promise<GameMountFactory>((resolve) => {
          resolveLoader = resolve;
        })
    );

    arcade = mountArcade(document, {
      mountSnakeGame: () => ({ destroy: vi.fn() }),
      loadTetrisMount
    });

    getPlayButton("tetris").click();
    getBackButton().click();
    expect(getPlayButton("snake")).toBeInstanceOf(HTMLButtonElement);

    resolveLoader?.(tetrisMount as GameMountFactory);
    await flushPromises();

    expect(tetrisMount).toHaveBeenCalledWith(document);
    expect(tetrisDestroy).toHaveBeenCalledTimes(1);
    expect(arcade.getActiveGame()).toBeNull();
    expect(getPlayButton("tetris")).toBeInstanceOf(HTMLButtonElement);
  });

  it("returns home with status message when Tetris mount cannot load", async () => {
    renderArcadeHost();

    arcade = mountArcade(document, {
      mountSnakeGame: () => ({ destroy: vi.fn() }),
      loadTetrisMount: async () => {
        throw new Error("missing module");
      }
    });

    getPlayButton("tetris").click();
    await flushPromises();

    expect(getPlayButton("tetris")).toBeInstanceOf(HTMLButtonElement);
    expect(document.getElementById("arcade-status")?.textContent).toContain(
      "Tetris is currently unavailable."
    );
    expect(arcade.getActiveGame()).toBeNull();
  });

  it("loads Pac-Man mount factory dynamically and destroys it on back", async () => {
    renderArcadeHost();
    const pacmanDestroy = vi.fn();
    const pacmanMount = vi.fn(() => ({ destroy: pacmanDestroy }));
    const loadPacmanMount = vi.fn(async () => pacmanMount as GameMountFactory);

    arcade = mountArcade(document, {
      mountSnakeGame: () => ({ destroy: vi.fn() }),
      loadTetrisMount: async () => {
        throw new Error("not used");
      },
      loadPacmanMount
    });

    getPlayButton("pacman").click();
    expect(document.querySelector(".arcade-game-host .arcade-status")?.textContent).toContain(
      "Loading Pac-Man"
    );
    await flushPromises();

    expect(loadPacmanMount).toHaveBeenCalledTimes(1);
    expect(pacmanMount).toHaveBeenCalledWith(document);
    expect(arcade.getActiveGame()).toBe("pacman");

    getBackButton().click();
    expect(pacmanDestroy).toHaveBeenCalledTimes(1);
    expect(arcade.getActiveGame()).toBeNull();
  });

  it("returns home with status message when Pac-Man mount cannot load", async () => {
    renderArcadeHost();

    arcade = mountArcade(document, {
      mountSnakeGame: () => ({ destroy: vi.fn() }),
      loadTetrisMount: async () => {
        throw new Error("not used");
      },
      loadPacmanMount: async () => {
        throw new Error("missing module");
      }
    });

    getPlayButton("pacman").click();
    await flushPromises();

    expect(getPlayButton("pacman")).toBeInstanceOf(HTMLButtonElement);
    expect(document.getElementById("arcade-status")?.textContent).toContain(
      "Pac-Man is currently unavailable."
    );
    expect(arcade.getActiveGame()).toBeNull();
  });

  it("disposes late Pac-Man mount results after user returns home", async () => {
    renderArcadeHost();
    const pacmanDestroy = vi.fn();
    const pacmanMount = vi.fn(() => ({ destroy: pacmanDestroy }));
    let resolveLoader: ((factory: GameMountFactory) => void) | null = null;
    const loadPacmanMount = vi.fn(
      () =>
        new Promise<GameMountFactory>((resolve) => {
          resolveLoader = resolve;
        })
    );

    arcade = mountArcade(document, {
      mountSnakeGame: () => ({ destroy: vi.fn() }),
      loadTetrisMount: async () => {
        throw new Error("not used");
      },
      loadPacmanMount
    });

    getPlayButton("pacman").click();
    getBackButton().click();
    expect(getPlayButton("snake")).toBeInstanceOf(HTMLButtonElement);

    resolveLoader?.(pacmanMount as GameMountFactory);
    await flushPromises();

    expect(pacmanMount).toHaveBeenCalledWith(document);
    expect(pacmanDestroy).toHaveBeenCalledTimes(1);
    expect(arcade.getActiveGame()).toBeNull();
    expect(getPlayButton("pacman")).toBeInstanceOf(HTMLButtonElement);
  });

  it("destroys the active game when arcade is destroyed", () => {
    renderArcadeHost();
    const snakeDestroy = vi.fn();

    arcade = mountArcade(document, {
      mountSnakeGame: () => ({ destroy: snakeDestroy }),
      loadTetrisMount: async () => {
        throw new Error("not used");
      }
    });

    getPlayButton("snake").click();
    arcade.destroy();
    arcade = null;

    expect(snakeDestroy).toHaveBeenCalledTimes(1);
    expect(document.getElementById("arcade-root")?.innerHTML).toBe("");
  });
});
