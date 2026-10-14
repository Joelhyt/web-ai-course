import type { GameState } from "./types";

export interface GameRenderer {
  render(state: GameState): void;
}

const GRID_COLOR = "#ececec";
const SNAKE_COLOR = "#1f1f1f";
const GHOST_OUTLINE_COLOR = "#8b5cf6";
const GHOST_OUTLINE_WIDTH = 2;
const FOOD_COLOR = "#1f7a1f";
const FEAST_FOOD_COLOR = "#d9a400";
const BACKGROUND_COLOR = "#ffffff";
const POWER_UP_STYLES = {
  slow: { color: "#1f4db3", label: "S" },
  ghost: { color: "#7a2eb3", label: "G" },
  magnet: { color: "#b34a1f", label: "M" },
  feast: { color: "#b37a00", label: "F" }
} as const;

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

function hasGhostEffect(state: GameState): boolean {
  return state.activePowerUps.some((powerUp) => powerUp.type === "ghost");
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

      context.fillStyle = FEAST_FOOD_COLOR;
      for (const food of state.extraFoods) {
        context.fillRect(food.x * cellSize, food.y * cellSize, cellSize, cellSize);
      }

      for (const boardPowerUp of state.boardPowerUps) {
        const style = POWER_UP_STYLES[boardPowerUp.type];
        const x = boardPowerUp.position.x * cellSize;
        const y = boardPowerUp.position.y * cellSize;

        context.fillStyle = style.color;
        context.fillRect(x, y, cellSize, cellSize);
        context.fillStyle = "#ffffff";
        context.font = `${Math.floor(cellSize * 0.65)}px Arial`;
        context.textAlign = "center";
        context.textBaseline = "middle";
        context.fillText(style.label, x + cellSize / 2, y + cellSize / 2 + 0.5);
      }

      context.fillStyle = SNAKE_COLOR;
      for (const segment of state.snake) {
        context.fillRect(
          segment.x * cellSize,
          segment.y * cellSize,
          cellSize,
          cellSize
        );
      }

      if (hasGhostEffect(state)) {
        const inset = 1;
        const outlineSize = Math.max(1, cellSize - inset * 2);
        context.strokeStyle = GHOST_OUTLINE_COLOR;
        context.lineWidth = GHOST_OUTLINE_WIDTH;
        for (const segment of state.snake) {
          context.strokeRect(
            segment.x * cellSize + inset,
            segment.y * cellSize + inset,
            outlineSize,
            outlineSize
          );
        }
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
