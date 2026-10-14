import {
  createBrowserScoreStorage,
  createBrowserPacmanScoreStorage,
  createBrowserTetrisScoreStorage,
  parseBestScore,
  BEST_SCORE_STORAGE_KEY_PREFIX,
  PACMAN_BEST_SCORE_STORAGE_KEY,
  TETRIS_BEST_SCORE_STORAGE_KEY
} from "./storage";

function createMemoryStorage() {
  const map = new Map<string, string>();
  return {
    getItem(key: string): string | null {
      return map.has(key) ? map.get(key)! : null;
    },
    setItem(key: string, value: string): void {
      map.set(key, value);
    }
  };
}

describe("best-score storage", () => {
  it("parses valid best-score values", () => {
    expect(parseBestScore("9")).toBe(9);
    expect(parseBestScore("0004")).toBe(4);
  });

  it("falls back to zero for invalid values", () => {
    expect(parseBestScore(null)).toBe(0);
    expect(parseBestScore("-1")).toBe(0);
    expect(parseBestScore("nope")).toBe(0);
  });

  it("loads and saves score to provided storage", () => {
    const storage = createMemoryStorage();
    const adapter = createBrowserScoreStorage(
      BEST_SCORE_STORAGE_KEY_PREFIX,
      () => storage,
      () => {}
    );

    expect(adapter.loadBestScore("classic", "solid")).toBe(0);
    expect(adapter.loadBestScore("classic", "wrap")).toBe(0);
    expect(adapter.loadBestScore("time-attack", "solid")).toBe(0);
    adapter.saveBestScore("classic", "solid", 7);
    adapter.saveBestScore("classic", "wrap", 11);
    adapter.saveBestScore("time-attack", "solid", 5);
    expect(adapter.loadBestScore("classic", "solid")).toBe(7);
    expect(adapter.loadBestScore("classic", "wrap")).toBe(11);
    expect(adapter.loadBestScore("time-attack", "solid")).toBe(5);
  });

  it("falls back to legacy solid-mode key when mode key is missing", () => {
    const storage = createMemoryStorage();
    storage.setItem(BEST_SCORE_STORAGE_KEY_PREFIX, "13");

    const adapter = createBrowserScoreStorage(
      BEST_SCORE_STORAGE_KEY_PREFIX,
      () => storage,
      () => {}
    );

    expect(adapter.loadBestScore("classic", "solid")).toBe(13);
    expect(adapter.loadBestScore("classic", "wrap")).toBe(0);
  });

  it("reports read and write errors without throwing", () => {
    const errors: string[] = [];
    const failingStorage = {
      getItem(): string | null {
        throw new Error("read failed");
      },
      setItem(): void {
        throw new Error("write failed");
      }
    };

    const adapter = createBrowserScoreStorage(
      BEST_SCORE_STORAGE_KEY_PREFIX,
      () => failingStorage,
      (operation) => {
        errors.push(operation);
      }
    );

    expect(adapter.loadBestScore("classic", "solid")).toBe(0);
    adapter.saveBestScore("classic", "solid", 5);
    expect(errors).toEqual(["read", "write"]);
  });

  it("stores Snake, Tetris, and Pac-Man scores independently", () => {
    const storage = createMemoryStorage();
    const snakeStorage = createBrowserScoreStorage(
      BEST_SCORE_STORAGE_KEY_PREFIX,
      () => storage,
      () => {}
    );
    const tetrisStorage = createBrowserTetrisScoreStorage(
      TETRIS_BEST_SCORE_STORAGE_KEY,
      () => storage,
      () => {}
    );
    const pacmanStorage = createBrowserPacmanScoreStorage(
      PACMAN_BEST_SCORE_STORAGE_KEY,
      () => storage,
      () => {}
    );

    snakeStorage.saveBestScore("classic", "solid", 12);
    tetrisStorage.saveBestScore(37);
    pacmanStorage.saveBestScore(99);

    expect(snakeStorage.loadBestScore("classic", "solid")).toBe(12);
    expect(tetrisStorage.loadBestScore()).toBe(37);
    expect(pacmanStorage.loadBestScore()).toBe(99);
  });

  it("reports unavailable Tetris storage without throwing", () => {
    const errors: string[] = [];
    const adapter = createBrowserTetrisScoreStorage(
      TETRIS_BEST_SCORE_STORAGE_KEY,
      () => {
        throw new Error("storage unavailable");
      },
      (operation) => {
        errors.push(operation);
      }
    );

    expect(adapter.loadBestScore()).toBe(0);
    adapter.saveBestScore(5);
    expect(errors).toEqual(["read", "read"]);
  });

  it("parses malformed Pac-Man values and rejects invalid scores", () => {
    const storage = createMemoryStorage();
    const adapter = createBrowserPacmanScoreStorage(
      PACMAN_BEST_SCORE_STORAGE_KEY,
      () => storage,
      () => {}
    );

    storage.setItem(PACMAN_BEST_SCORE_STORAGE_KEY, "bad-value");
    expect(adapter.loadBestScore()).toBe(0);

    adapter.saveBestScore(18);
    adapter.saveBestScore(-1);
    adapter.saveBestScore(Number.NaN);
    adapter.saveBestScore(Number.POSITIVE_INFINITY);
    expect(adapter.loadBestScore()).toBe(18);
  });

  it("reports unavailable Pac-Man storage without throwing", () => {
    const errors: string[] = [];
    const adapter = createBrowserPacmanScoreStorage(
      PACMAN_BEST_SCORE_STORAGE_KEY,
      () => {
        throw new Error("storage unavailable");
      },
      (operation) => {
        errors.push(operation);
      }
    );

    expect(adapter.loadBestScore()).toBe(0);
    adapter.saveBestScore(5);
    expect(errors).toEqual(["read", "read"]);
  });

  it("reports Pac-Man read and write errors without throwing", () => {
    const errors: string[] = [];
    const failingStorage = {
      getItem(): string | null {
        throw new Error("read failed");
      },
      setItem(): void {
        throw new Error("write failed");
      }
    };

    const adapter = createBrowserPacmanScoreStorage(
      PACMAN_BEST_SCORE_STORAGE_KEY,
      () => failingStorage,
      (operation) => {
        errors.push(operation);
      }
    );

    expect(adapter.loadBestScore()).toBe(0);
    adapter.saveBestScore(5);
    expect(errors).toEqual(["read", "write"]);
  });
});
