import {
  createBrowserScoreStorage,
  parseBestScore,
  BEST_SCORE_STORAGE_KEY_PREFIX
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

    expect(adapter.loadBestScore("solid")).toBe(0);
    expect(adapter.loadBestScore("wrap")).toBe(0);
    adapter.saveBestScore("solid", 7);
    adapter.saveBestScore("wrap", 11);
    expect(adapter.loadBestScore("solid")).toBe(7);
    expect(adapter.loadBestScore("wrap")).toBe(11);
  });

  it("falls back to legacy solid-mode key when mode key is missing", () => {
    const storage = createMemoryStorage();
    storage.setItem(BEST_SCORE_STORAGE_KEY_PREFIX, "13");

    const adapter = createBrowserScoreStorage(
      BEST_SCORE_STORAGE_KEY_PREFIX,
      () => storage,
      () => {}
    );

    expect(adapter.loadBestScore("solid")).toBe(13);
    expect(adapter.loadBestScore("wrap")).toBe(0);
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

    expect(adapter.loadBestScore("solid")).toBe(0);
    adapter.saveBestScore("solid", 5);
    expect(errors).toEqual(["read", "write"]);
  });
});
