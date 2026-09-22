export type Direction = "up" | "down" | "left" | "right";
export type GameStatus = "running" | "game-over";
export type GameMode = "classic" | "time-attack";
export type GameEndReason = "collision" | "time-expired" | null;
export type WallMode = "solid" | "wrap";
export type PowerUpType = "slow" | "ghost" | "magnet" | "feast";

export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface BoardSize {
  readonly width: number;
  readonly height: number;
}

export interface ActivePowerUp {
  readonly type: PowerUpType;
  readonly remainingSteps: number;
}

export interface BoardPowerUp {
  readonly type: PowerUpType;
  readonly position: Point;
  readonly remainingSteps: number;
}

export interface GameState {
  readonly board: BoardSize;
  readonly gameMode: GameMode;
  readonly endReason: GameEndReason;
  readonly timeRemainingMs: number | null;
  readonly snake: readonly Point[];
  readonly direction: Direction;
  readonly pendingDirection: Direction | null;
  readonly wallMode: WallMode;
  readonly activePowerUps: readonly ActivePowerUp[];
  readonly boardPowerUps: readonly BoardPowerUp[];
  readonly activePowerUp: ActivePowerUp | null;
  readonly boardPowerUp: BoardPowerUp | null;
  readonly food: Point;
  readonly extraFoods: readonly Point[];
  readonly score: number;
  readonly bestScore: number;
  readonly status: GameStatus;
}
