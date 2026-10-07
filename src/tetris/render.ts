import { getPieceCells } from "./state";
import type { CellValue, TetrisState, TetrominoType } from "./types";

export interface TetrisRenderer {
  render(state: TetrisState): void;
}

const GRID_COLOR = "#d7d7d7";
const BACKGROUND_COLOR = "#ffffff";
const PREVIEW_BACKGROUND = "#f7f8fb";
const PREVIEW_BORDER = "#c8d0e0";

const PIECE_COLORS: Readonly<Record<TetrominoType, string>> = {
  I: "#4dd0e1",
  O: "#ffd54f",
  T: "#ba68c8",
  S: "#81c784",
  Z: "#e57373",
  J: "#64b5f6",
  L: "#ffb74d"
};

function paintBeveledBlock(
  context: CanvasRenderingContext2D,
  color: string,
  px: number,
  py: number,
  size: number
): void {
  context.fillStyle = color;
  context.fillRect(px, py, size, size);
  context.strokeStyle = "rgba(0, 0, 0, 0.25)";
  context.lineWidth = Math.max(1, Math.floor(size * 0.08));
  context.strokeRect(px + 0.5, py + 0.5, size - 1, size - 1);
  context.fillStyle = "rgba(255, 255, 255, 0.25)";
  context.fillRect(px + 1, py + 1, size - 2, Math.max(1, Math.floor(size * 0.2)));
}

function drawGrid(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  cellSize: number
): void {
  context.strokeStyle = GRID_COLOR;
  context.lineWidth = 1;

  for (let x = 0; x <= width; x += 1) {
    const px = x * cellSize + 0.5;
    context.beginPath();
    context.moveTo(px, 0);
    context.lineTo(px, height * cellSize);
    context.stroke();
  }

  for (let y = 0; y <= height; y += 1) {
    const py = y * cellSize + 0.5;
    context.beginPath();
    context.moveTo(0, py);
    context.lineTo(width * cellSize, py);
    context.stroke();
  }
}

function drawCell(
  context: CanvasRenderingContext2D,
  type: TetrominoType,
  x: number,
  y: number,
  cellSize: number
): void {
  paintBeveledBlock(context, PIECE_COLORS[type], x * cellSize, y * cellSize, cellSize);
}

function drawLockedBoard(
  context: CanvasRenderingContext2D,
  state: TetrisState,
  cellSize: number
): void {
  for (let y = 0; y < state.height; y += 1) {
    for (let x = 0; x < state.width; x += 1) {
      const cell: CellValue = state.board[y][x];
      if (cell !== null) {
        drawCell(context, cell, x, y, cellSize);
      }
    }
  }
}

function drawActivePiece(
  context: CanvasRenderingContext2D,
  state: TetrisState,
  cellSize: number
): void {
  for (const cell of getPieceCells(state.activePiece)) {
    if (cell.y >= 0 && cell.y < state.height && cell.x >= 0 && cell.x < state.width) {
      drawCell(context, state.activePiece.type, cell.x, cell.y, cellSize);
    }
  }
}

function getPreviewOffsets(
  pieceType: TetrominoType
): readonly { readonly x: number; readonly y: number }[] {
  return getPieceCells({
    type: pieceType,
    rotation: 0,
    x: 0,
    y: 0
  });
}

export function renderTetrominoPreview(
  canvas: HTMLCanvasElement,
  pieceType: TetrominoType | null,
  previewCellSize = 12
): void {
  const context = canvas.getContext("2d");
  if (!context) {
    canvas.dataset.pieceType = pieceType ?? "empty";
    return;
  }

  const width = 84;
  const height = 66;

  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }

  context.fillStyle = PREVIEW_BACKGROUND;
  context.fillRect(0, 0, width, height);
  context.strokeStyle = PREVIEW_BORDER;
  context.lineWidth = 1;
  context.strokeRect(0.5, 0.5, width - 1, height - 1);

  if (pieceType === null) {
    canvas.dataset.pieceType = "empty";
    return;
  }

  const cells = getPreviewOffsets(pieceType);
  const minX = Math.min(...cells.map((cell) => cell.x));
  const maxX = Math.max(...cells.map((cell) => cell.x));
  const minY = Math.min(...cells.map((cell) => cell.y));
  const maxY = Math.max(...cells.map((cell) => cell.y));
  const shapeWidth = maxX - minX + 1;
  const shapeHeight = maxY - minY + 1;
  const offsetX = Math.floor((width - shapeWidth * previewCellSize) / 2);
  const offsetY = Math.floor((height - shapeHeight * previewCellSize) / 2);

  for (const cell of cells) {
    const px = offsetX + (cell.x - minX) * previewCellSize;
    const py = offsetY + (cell.y - minY) * previewCellSize;
    paintBeveledBlock(context, PIECE_COLORS[pieceType], px, py, previewCellSize);
  }

  canvas.dataset.pieceType = pieceType;
}

export function createTetrisCanvasRenderer(
  canvas: HTMLCanvasElement,
  cellSize = 28
): TetrisRenderer {
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Canvas 2D context is not available.");
  }

  context.imageSmoothingEnabled = false;

  return {
    render(state): void {
      const width = state.width * cellSize;
      const height = state.height * cellSize;

      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }

      context.fillStyle = BACKGROUND_COLOR;
      context.fillRect(0, 0, width, height);
      drawGrid(context, state.width, state.height, cellSize);
      drawLockedBoard(context, state, cellSize);
      drawActivePiece(context, state, cellSize);

      if (state.status !== "running") {
        context.fillStyle = "rgba(0, 0, 0, 0.25)";
        context.fillRect(0, 0, width, height);
      }

      canvas.dataset.status = state.status;
      canvas.dataset.score = String(state.score);
      canvas.dataset.level = String(state.level);
      canvas.dataset.lines = String(state.totalLinesCleared);
    }
  };
}
