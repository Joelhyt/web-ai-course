import type { GameMode, WallMode } from "./game/types";

export const BEST_SCORE_STORAGE_KEY_PREFIX = "snake.bestScore";
export const TETRIS_BEST_SCORE_STORAGE_KEY = "tetris.bestScore";

type StorageErrorReporter = (
  operation: "read" | "write",
  error: unknown
) => void;

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface ScoreStorage {
  loadBestScore(gameMode: GameMode, wallMode: WallMode): number;
  saveBestScore(gameMode: GameMode, wallMode: WallMode, score: number): void;
}

export interface TetrisScoreStorage {
  loadBestScore(): number;
  saveBestScore(score: number): void;
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
  function buildModeKey(gameMode: GameMode, wallMode: WallMode): string {
    return `${keyPrefix}.${gameMode}.${wallMode}`;
  }

  function readRawBestScore(
    storage: StorageLike,
    gameMode: GameMode,
    wallMode: WallMode
  ): string | null {
    const modeKey = buildModeKey(gameMode, wallMode);
    const modeValue = storage.getItem(modeKey);
    if (modeValue !== null) {
      return modeValue;
    }

    if (gameMode === "classic") {
      const legacyModeKey = `${keyPrefix}.${wallMode}`;
      const legacyModeValue = storage.getItem(legacyModeKey);
      if (legacyModeValue !== null) {
        return legacyModeValue;
      }

      if (wallMode === "solid") {
        return storage.getItem(keyPrefix);
      }
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
    loadBestScore(gameMode, wallMode): number {
      const storage = readStorage();
      if (!storage) {
        return 0;
      }

      try {
        return parseBestScore(readRawBestScore(storage, gameMode, wallMode));
      } catch (error) {
        reportError("read", error);
        return 0;
      }
    },
    saveBestScore(gameMode, wallMode, score): void {
      if (!Number.isFinite(score) || score < 0) {
        return;
      }

      const storage = readStorage();
      if (!storage) {
        return;
      }

      try {
        storage.setItem(
          buildModeKey(gameMode, wallMode),
          String(Math.floor(score))
        );
      } catch (error) {
        reportError("write", error);
      }
    }
  };
}

export function createBrowserTetrisScoreStorage(
  key = TETRIS_BEST_SCORE_STORAGE_KEY,
  storageProvider: () => StorageLike = () => window.localStorage,
  reportError: StorageErrorReporter = (operation, error) => {
    console.warn(`Tetris best-score storage ${operation} failed.`, error);
  }
): TetrisScoreStorage {
  function readStorage(): StorageLike | null {
    try {
      return storageProvider();
    } catch (error) {
      reportError("read", error);
      return null;
    }
  }

  return {
    loadBestScore(): number {
      const storage = readStorage();
      if (!storage) {
        return 0;
      }

      try {
        return parseBestScore(storage.getItem(key));
      } catch (error) {
        reportError("read", error);
        return 0;
      }
    },
    saveBestScore(score): void {
      if (!Number.isFinite(score) || score < 0) {
        return;
      }

      const storage = readStorage();
      if (!storage) {
        return;
      }

      try {
        storage.setItem(key, String(Math.floor(score)));
      } catch (error) {
        reportError("write", error);
      }
    }
  };
}
