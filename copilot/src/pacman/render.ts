import type { GhostState } from "./ghosts";
import type { Direction, MazePosition } from "./types";
import type { PacmanState } from "./state";

export interface PacmanRenderer {
  render(state: PacmanState): void;
}

const WALL_COLOR = "#193a7a";
const CORRIDOR_COLOR = "#050505";
const PELLET_COLOR = "#f4f4b9";
const POWER_PELLET_COLOR = "#ffffff";
const FRUIT_COLOR = "#d62728";

const GHOST_COLORS: Readonly<Record<GhostState["id"], string>> = {
  blinky: "#e53935",
  pinky: "#ff79c6",
  inky: "#4dd0e1",
  clyde: "#ff9f43"
};

function parseTileKey(key: string): MazePosition {
  const [xRaw, yRaw] = key.split(",");
  return {
    x: Number.parseInt(xRaw, 10),
    y: Number.parseInt(yRaw, 10)
  };
}

function drawMaze(
  context: CanvasRenderingContext2D,
  state: PacmanState,
  tileSize: number
): void {
  context.fillStyle = CORRIDOR_COLOR;
  context.fillRect(0, 0, state.maze.width * tileSize, state.maze.height * tileSize);

  context.fillStyle = WALL_COLOR;
  for (let y = 0; y < state.maze.height; y += 1) {
    for (let x = 0; x < state.maze.width; x += 1) {
      const tile = state.maze.tiles[y][x];
      if (tile === "wall") {
        context.fillRect(x * tileSize, y * tileSize, tileSize, tileSize);
      }
    }
  }
}

function drawPellets(
  context: CanvasRenderingContext2D,
  state: PacmanState,
  tileSize: number
): void {
  const half = tileSize / 2;

  context.fillStyle = PELLET_COLOR;
  for (const tileKey of state.remainingNormalPellets) {
    const { x, y } = parseTileKey(tileKey);
    context.beginPath();
    context.arc(x * tileSize + half, y * tileSize + half, tileSize * 0.1, 0, Math.PI * 2);
    context.fill();
  }

  context.fillStyle = POWER_PELLET_COLOR;
  for (const tileKey of state.remainingPowerPellets) {
    const { x, y } = parseTileKey(tileKey);
    context.beginPath();
    context.arc(x * tileSize + half, y * tileSize + half, tileSize * 0.24, 0, Math.PI * 2);
    context.fill();
  }
}

function drawFruit(
  context: CanvasRenderingContext2D,
  state: PacmanState,
  tileSize: number
): void {
  if (!state.fruit.active) {
    return;
  }

  const centerX = state.fruit.position.x * tileSize + tileSize / 2;
  const centerY = state.fruit.position.y * tileSize + tileSize / 2;
  const radius = tileSize * 0.28;

  context.fillStyle = FRUIT_COLOR;
  context.beginPath();
  context.arc(centerX, centerY, radius, 0, Math.PI * 2);
  context.fill();

  context.strokeStyle = "#3faf3f";
  context.lineWidth = Math.max(1, tileSize * 0.08);
  context.beginPath();
  context.moveTo(centerX, centerY - radius);
  context.lineTo(centerX + radius * 0.35, centerY - radius * 1.35);
  context.stroke();
}

function drawPacman(
  context: CanvasRenderingContext2D,
  state: PacmanState,
  tileSize: number
): void {
  const centerX = state.player.position.x * tileSize + tileSize / 2;
  const centerY = state.player.position.y * tileSize + tileSize / 2;
  const direction = state.player.direction ?? "left";
  const baseAngle = directionToAngle(direction);
  const mouthAngle = state.status === "running" ? Math.PI / 6 : Math.PI / 14;

  context.fillStyle = "#ffd800";
  context.beginPath();
  context.moveTo(centerX, centerY);
  context.arc(
    centerX,
    centerY,
    tileSize * 0.45,
    baseAngle + mouthAngle,
    baseAngle + Math.PI * 2 - mouthAngle
  );
  context.closePath();
  context.fill();
}

function drawGhost(
  context: CanvasRenderingContext2D,
  ghost: GhostState,
  tileSize: number
): void {
  const x = ghost.position.x * tileSize;
  const y = ghost.position.y * tileSize;
  const bodyTop = y + tileSize * 0.2;
  const bodyBottom = y + tileSize * 0.92;
  const centerX = x + tileSize / 2;
  const radius = tileSize * 0.32;

  if (ghost.mode === "eaten-returning") {
    drawGhostEyes(context, centerX, y + tileSize * 0.45, tileSize, ghost.direction);
    return;
  }

  context.fillStyle = ghost.mode === "frightened" ? "#2554d8" : GHOST_COLORS[ghost.id];
  context.beginPath();
  context.arc(centerX, bodyTop + radius, radius, Math.PI, 0, false);
  context.lineTo(x + tileSize * 0.82, bodyBottom);
  context.lineTo(x + tileSize * 0.62, bodyBottom - tileSize * 0.1);
  context.lineTo(x + tileSize * 0.5, bodyBottom);
  context.lineTo(x + tileSize * 0.38, bodyBottom - tileSize * 0.1);
  context.lineTo(x + tileSize * 0.18, bodyBottom);
  context.closePath();
  context.fill();

  drawGhostEyes(context, centerX, y + tileSize * 0.45, tileSize, ghost.direction);
}

function drawGhostEyes(
  context: CanvasRenderingContext2D,
  centerX: number,
  centerY: number,
  tileSize: number,
  direction: Direction
): void {
  const eyeRadius = tileSize * 0.1;
  const pupilRadius = tileSize * 0.045;
  const leftEyeX = centerX - tileSize * 0.12;
  const rightEyeX = centerX + tileSize * 0.12;
  const pupilOffset = pupilOffsetByDirection(direction, tileSize * 0.035);

  context.fillStyle = "#ffffff";
  context.beginPath();
  context.arc(leftEyeX, centerY, eyeRadius, 0, Math.PI * 2);
  context.arc(rightEyeX, centerY, eyeRadius, 0, Math.PI * 2);
  context.fill();

  context.fillStyle = "#1d2d5f";
  context.beginPath();
  context.arc(leftEyeX + pupilOffset.x, centerY + pupilOffset.y, pupilRadius, 0, Math.PI * 2);
  context.arc(rightEyeX + pupilOffset.x, centerY + pupilOffset.y, pupilRadius, 0, Math.PI * 2);
  context.fill();
}

function drawGhosts(
  context: CanvasRenderingContext2D,
  state: PacmanState,
  tileSize: number
): void {
  drawGhost(context, state.ghosts.blinky, tileSize);
  drawGhost(context, state.ghosts.pinky, tileSize);
  drawGhost(context, state.ghosts.inky, tileSize);
  drawGhost(context, state.ghosts.clyde, tileSize);
}

function drawOverlay(
  context: CanvasRenderingContext2D,
  state: PacmanState,
  width: number,
  height: number
): void {
  if (state.status === "running") {
    return;
  }

  context.fillStyle = "rgba(0, 0, 0, 0.45)";
  context.fillRect(0, 0, width, height);

  context.fillStyle = "#ffffff";
  context.font = "bold 28px Arial, sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(state.status === "paused" ? "Paused" : "Game Over", width / 2, height / 2);
}

function directionToAngle(direction: Direction): number {
  if (direction === "right") {
    return 0;
  }
  if (direction === "down") {
    return Math.PI / 2;
  }
  if (direction === "left") {
    return Math.PI;
  }
  return (3 * Math.PI) / 2;
}

function pupilOffsetByDirection(
  direction: Direction,
  size: number
): MazePosition {
  if (direction === "up") {
    return { x: 0, y: -size };
  }
  if (direction === "right") {
    return { x: size, y: 0 };
  }
  if (direction === "down") {
    return { x: 0, y: size };
  }
  return { x: -size, y: 0 };
}

function getVisiblePelletCount(state: PacmanState): number {
  return state.remainingNormalPellets.size;
}

export function createPacmanCanvasRenderer(
  canvas: HTMLCanvasElement,
  tileSize = 20
): PacmanRenderer {
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Canvas 2D context is not available.");
  }

  context.imageSmoothingEnabled = false;

  return {
    render(state): void {
      const width = state.maze.width * tileSize;
      const height = state.maze.height * tileSize;

      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }

      drawMaze(context, state, tileSize);
      drawPellets(context, state, tileSize);
      drawFruit(context, state, tileSize);
      drawGhosts(context, state, tileSize);
      drawPacman(context, state, tileSize);
      drawOverlay(context, state, width, height);

      canvas.dataset.status = state.status;
      canvas.dataset.score = String(state.score);
      canvas.dataset.lives = String(state.lives);
      canvas.dataset.round = String(state.round);
      canvas.dataset.pelletsRemaining = String(state.pelletsRemaining);
      canvas.dataset.normalPellets = String(getVisiblePelletCount(state));
    }
  };
}
