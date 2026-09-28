export const TETRIS_BOARD_WIDTH = 10;
export const TETRIS_BOARD_HEIGHT = 20;

export const TETROMINO_TYPES = ["I", "O", "T", "S", "Z", "J", "L"] as const;

export type TetrominoType = (typeof TETROMINO_TYPES)[number];
export type RotationState = 0 | 1 | 2 | 3;
export type TetrisStatus = "running" | "paused" | "game-over";
export type HorizontalMoveDirection = "left" | "right";
export type CellValue = TetrominoType | null;

export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface ActivePiece {
  readonly type: TetrominoType;
  readonly rotation: RotationState;
  readonly x: number;
  readonly y: number;
}

export type BoardRow = readonly CellValue[];
export type BoardMatrix = readonly BoardRow[];

export interface TetrisState {
  readonly width: number;
  readonly height: number;
  readonly board: BoardMatrix;
  readonly status: TetrisStatus;
  readonly activePiece: ActivePiece;
  readonly nextPiece: TetrominoType;
  readonly queue: readonly TetrominoType[];
  readonly heldPiece: TetrominoType | null;
  readonly canHold: boolean;
  readonly score: number;
  readonly level: number;
  readonly totalLinesCleared: number;
  readonly randomSeed: number;
}

export interface CreateInitialTetrisStateOptions {
  readonly queue?: readonly TetrominoType[];
  readonly randomSeed?: number;
  readonly board?: BoardMatrix;
  readonly activePiece?: ActivePiece;
  readonly status?: TetrisStatus;
  readonly score?: number;
  readonly level?: number;
  readonly totalLinesCleared?: number;
  readonly heldPiece?: TetrominoType | null;
  readonly canHold?: boolean;
}
