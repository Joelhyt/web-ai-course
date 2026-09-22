import type { GameState } from "./types";

export interface GameRenderer {
  render(state: GameState): void;
}

const GRID_COLOR = "#ececec";
const SNAKE_COLOR = "#1f1f1f";
const FOOD_COLOR = "#1f7a1f";
const BACKGROUND_COLOR = "#ffffff";

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

export function createCanvasRenderer(
  canvas: HTMLCanvasElement,
  cellSize = 24
): GameRenderer {
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Canvas 2D context is not available.");
  }

  context.imageSmoothingEnabled = false;

  return {
    render(state) {
      const width = state.board.width * cellSize;
      const height = state.board.height * cellSize;

      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }

      context.fillStyle = BACKGROUND_COLOR;
      context.fillRect(0, 0, width, height);

      drawGrid(context, state.board.width, state.board.height, cellSize);

      context.fillStyle = FOOD_COLOR;
      context.fillRect(
        state.food.x * cellSize,
        state.food.y * cellSize,
        cellSize,
        cellSize
      );

      context.fillStyle = SNAKE_COLOR;
      for (const segment of state.snake) {
        context.fillRect(
          segment.x * cellSize,
          segment.y * cellSize,
          cellSize,
          cellSize
        );
      }

      if (state.status === "game-over") {
        context.fillStyle = "rgba(0, 0, 0, 0.25)";
        context.fillRect(0, 0, width, height);
      }

      const head = state.snake[0];
      canvas.dataset.headX = String(head.x);
      canvas.dataset.headY = String(head.y);
      canvas.dataset.status = state.status;
    }
  };
}
