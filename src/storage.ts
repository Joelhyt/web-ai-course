import type { WallMode } from "./game/types";

export const BEST_SCORE_STORAGE_KEY_PREFIX = "snake.bestScore";

type StorageErrorReporter = (
  operation: "read" | "write",
  error: unknown
) => void;

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface ScoreStorage {
  loadBestScore(mode: WallMode): number;
  saveBestScore(mode: WallMode, score: number): void;
}

export function parseBestScore(rawValue: string | null): number {
  if (rawValue === null) {
    return 0;
  }

  const parsed = Number.parseInt(rawValue, 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return 0;
  }

  return parsed;
}

export function createBrowserScoreStorage(
  keyPrefix = BEST_SCORE_STORAGE_KEY_PREFIX,
  storageProvider: () => StorageLike = () => window.localStorage,
  reportError: StorageErrorReporter = (operation, error) => {
    console.warn(`Best-score storage ${operation} failed.`, error);
  }
): ScoreStorage {
  function buildModeKey(mode: WallMode): string {
    return `${keyPrefix}.${mode}`;
  }

  function readRawBestScore(storage: StorageLike, mode: WallMode): string | null {
    const modeKey = buildModeKey(mode);
    const modeValue = storage.getItem(modeKey);
    if (modeValue !== null) {
      return modeValue;
    }

    if (mode === "solid") {
      return storage.getItem(keyPrefix);
    }

    return null;
  }

  function readStorage(): StorageLike | null {
    try {
      return storageProvider();
    } catch (error) {
      reportError("read", error);
      return null;
    }
  }

  return {
    loadBestScore(mode): number {
      const storage = readStorage();
      if (!storage) {
        return 0;
      }

      try {
        return parseBestScore(readRawBestScore(storage, mode));
      } catch (error) {
        reportError("read", error);
        return 0;
      }
    },
    saveBestScore(mode, score): void {
      if (!Number.isFinite(score) || score < 0) {
        return;
      }

      const storage = readStorage();
      if (!storage) {
        return;
      }

      try {
        storage.setItem(buildModeKey(mode), String(Math.floor(score)));
      } catch (error) {
        reportError("write", error);
      }
    }
  };
}
