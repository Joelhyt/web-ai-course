export type Direction = "up" | "down" | "left" | "right";
export type GameStatus = "running" | "game-over";
export type WallMode = "solid" | "wrap";

export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface BoardSize {
  readonly width: number;
  readonly height: number;
}

export interface GameState {
  readonly board: BoardSize;
  readonly snake: readonly Point[];
  readonly direction: Direction;
  readonly pendingDirection: Direction | null;
  readonly wallMode: WallMode;
  readonly food: Point;
  readonly score: number;
  readonly bestScore: number;
  readonly status: GameStatus;
}
