import type {
  Direction,
  GhostHouseMetadata,
  GhostId,
  InitialPelletState,
  MazeActorRole,
  MazePosition,
  MazeTileKey,
  MazeTileKind,
  PacmanMazeDefinition
} from "./types";

export const PACMAN_MAZE_WIDTH = 28;
export const PACMAN_MAZE_HEIGHT = 31;

export const PACMAN_DIRECTIONS: readonly Direction[] = [
  "up",
  "right",
  "down",
  "left"
];

const DIRECTION_VECTORS: Readonly<Record<Direction, MazePosition>> = {
  up: { x: 0, y: -1 },
  right: { x: 1, y: 0 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 }
};

type BaseTile = "wall" | "corridor" | "ghost-house" | "ghost-door";

type Segment = readonly [index: number, from: number, to: number];

const POWER_PELLET_POSITIONS: readonly MazePosition[] = [
  { x: 1, y: 3 },
  { x: 26, y: 3 },
  { x: 1, y: 26 },
  { x: 26, y: 26 }
];

const PACMAN_SPAWN: MazePosition = { x: 13, y: 23 };
const FRUIT_SPAWN: MazePosition = { x: 14, y: 17 };

const GHOST_SPAWNS: Readonly<Record<GhostId, MazePosition>> = {
  blinky: { x: 13, y: 13 },
  pinky: { x: 14, y: 13 },
  inky: { x: 12, y: 14 },
  clyde: { x: 15, y: 14 }
};

const SCATTER_TARGETS: Readonly<Record<GhostId, MazePosition>> = {
  blinky: { x: 26, y: 1 },
  pinky: { x: 1, y: 1 },
  inky: { x: 26, y: 29 },
  clyde: { x: 1, y: 29 }
};

const GHOST_HOUSE: GhostHouseMetadata = {
  bounds: {
    minX: 11,
    maxX: 16,
    minY: 13,
    maxY: 15
  },
  doorTiles: [
    { x: 13, y: 12 },
    { x: 14, y: 12 }
  ],
  releaseTile: { x: 13, y: 11 },
  returnAnchor: { x: 13, y: 14 },
  releasePaths: {
    blinky: [
      { x: 13, y: 13 },
      { x: 13, y: 12 },
      { x: 13, y: 11 }
    ],
    pinky: [
      { x: 14, y: 13 },
      { x: 14, y: 12 },
      { x: 13, y: 12 },
      { x: 13, y: 11 }
    ],
    inky: [
      { x: 12, y: 14 },
      { x: 12, y: 13 },
      { x: 13, y: 13 },
      { x: 13, y: 12 },
      { x: 13, y: 11 }
    ],
    clyde: [
      { x: 15, y: 14 },
      { x: 15, y: 13 },
      { x: 14, y: 13 },
      { x: 14, y: 12 },
      { x: 13, y: 12 },
      { x: 13, y: 11 }
    ]
  },
  returnPath: [
    { x: 13, y: 11 },
    { x: 13, y: 12 },
    { x: 13, y: 13 },
    { x: 13, y: 14 }
  ]
};

function createBaseTileGrid(): BaseTile[][] {
  const base = Array.from({ length: PACMAN_MAZE_HEIGHT }, () =>
    Array<BaseTile>(PACMAN_MAZE_WIDTH).fill("wall")
  );

  const horizontalCorridors: readonly Segment[] = [
    [1, 1, 26],
    [3, 1, 12],
    [3, 15, 26],
    [5, 1, 26],
    [7, 1, 8],
    [7, 11, 16],
    [7, 19, 26],
    [9, 1, 26],
    [11, 1, 10],
    [11, 17, 26],
    [12, 1, 10],
    [12, 17, 26],
    [14, 0, 27],
    [16, 1, 10],
    [16, 17, 26],
    [18, 1, 26],
    [20, 1, 8],
    [20, 11, 16],
    [20, 19, 26],
    [22, 1, 26],
    [24, 1, 12],
    [24, 15, 26],
    [26, 1, 26],
    [28, 1, 26],
    [29, 1, 26]
  ];

  const verticalCorridors: readonly Segment[] = [
    [1, 1, 29],
    [26, 1, 29],
    [4, 1, 11],
    [4, 14, 29],
    [7, 3, 9],
    [7, 14, 26],
    [10, 1, 7],
    [10, 9, 12],
    [10, 16, 24],
    [10, 26, 29],
    [13, 1, 11],
    [13, 16, 29],
    [14, 1, 11],
    [14, 16, 29],
    [17, 1, 7],
    [17, 9, 12],
    [17, 16, 24],
    [17, 26, 29],
    [20, 3, 9],
    [20, 14, 26],
    [23, 1, 11],
    [23, 14, 29]
  ];

  for (const [row, fromX, toX] of horizontalCorridors) {
    for (let x = fromX; x <= toX; x += 1) {
      base[row][x] = "corridor";
    }
  }

  for (const [column, fromY, toY] of verticalCorridors) {
    for (let y = fromY; y <= toY; y += 1) {
      base[y][column] = "corridor";
    }
  }

  for (let y = GHOST_HOUSE.bounds.minY; y <= GHOST_HOUSE.bounds.maxY; y += 1) {
    for (let x = GHOST_HOUSE.bounds.minX; x <= GHOST_HOUSE.bounds.maxX; x += 1) {
      base[y][x] = "ghost-house";
    }
  }

  for (const door of GHOST_HOUSE.doorTiles) {
    base[door.y][door.x] = "ghost-door";
  }

  return base;
}

function toKey(position: MazePosition): MazeTileKey {
  return `${position.x},${position.y}`;
}

const RESERVED_NO_PELLET_KEYS = new Set<MazeTileKey>([
  toKey(PACMAN_SPAWN),
  toKey(FRUIT_SPAWN),
  toKey(GHOST_HOUSE.releaseTile),
  toKey(GHOST_HOUSE.returnAnchor),
  ...Object.values(GHOST_SPAWNS).map((position) => toKey(position))
]);

const POWER_PELLET_KEYS = new Set<MazeTileKey>(
  POWER_PELLET_POSITIONS.map((position) => toKey(position))
);

function createMazeTiles(base: readonly (readonly BaseTile[])[]): MazeTileKind[][] {
  return base.map((row, y) =>
    row.map((baseTile, x) => {
      if (baseTile === "wall") {
        return "wall";
      }

      if (baseTile === "ghost-house") {
        return "ghost-house";
      }

      if (baseTile === "ghost-door") {
        return "ghost-door";
      }

      const key = `${x},${y}` as MazeTileKey;

      if (POWER_PELLET_KEYS.has(key)) {
        return "power-pellet";
      }

      if (RESERVED_NO_PELLET_KEYS.has(key)) {
        return "corridor";
      }

      return "pellet";
    })
  );
}

function collectTilePositions(
  tiles: readonly (readonly MazeTileKind[])[],
  tileKind: MazeTileKind
): readonly MazePosition[] {
  const positions: MazePosition[] = [];

  for (let y = 0; y < tiles.length; y += 1) {
    for (let x = 0; x < tiles[y].length; x += 1) {
      if (tiles[y][x] === tileKind) {
        positions.push({ x, y });
      }
    }
  }

  return positions;
}

const BASE_TILES = createBaseTileGrid();
const MAZE_TILES = createMazeTiles(BASE_TILES);

const PELLET_POSITIONS = collectTilePositions(MAZE_TILES, "pellet");
const POWER_PELLETS = collectTilePositions(MAZE_TILES, "power-pellet");

export const PACMAN_CLASSIC_MAZE: PacmanMazeDefinition = {
  id: "classic-inspired-28x31",
  width: PACMAN_MAZE_WIDTH,
  height: PACMAN_MAZE_HEIGHT,
  tiles: MAZE_TILES,
  tunnel: {
    left: { x: 0, y: 14 },
    right: { x: 27, y: 14 }
  },
  spawns: {
    pacman: PACMAN_SPAWN,
    fruit: FRUIT_SPAWN,
    ghosts: GHOST_SPAWNS
  },
  scatterTargets: SCATTER_TARGETS,
  ghostHouse: GHOST_HOUSE,
  pelletTiles: PELLET_POSITIONS,
  powerPelletTiles: POWER_PELLETS
};

export function toMazeTileKey(position: MazePosition): MazeTileKey {
  return toKey(position);
}

export function isInMazeBounds(
  maze: PacmanMazeDefinition,
  position: MazePosition
): boolean {
  return (
    position.x >= 0 &&
    position.x < maze.width &&
    position.y >= 0 &&
    position.y < maze.height
  );
}

export function getMazeTile(
  maze: PacmanMazeDefinition,
  position: MazePosition
): MazeTileKind | null {
  if (!isInMazeBounds(maze, position)) {
    return null;
  }

  return maze.tiles[position.y][position.x];
}

export function isTraversableTileKind(
  tile: MazeTileKind,
  actorRole: MazeActorRole = "pacman"
): boolean {
  if (tile === "wall") {
    return false;
  }

  if (tile === "ghost-house" || tile === "ghost-door") {
    return actorRole !== "pacman";
  }

  return true;
}

export function isTraversable(
  maze: PacmanMazeDefinition,
  position: MazePosition,
  actorRole: MazeActorRole = "pacman"
): boolean {
  const tile = getMazeTile(maze, position);

  if (tile === null) {
    return false;
  }

  return isTraversableTileKind(tile, actorRole);
}

export function getRawNeighbor(
  position: MazePosition,
  direction: Direction
): MazePosition {
  const vector = DIRECTION_VECTORS[direction];
  return {
    x: position.x + vector.x,
    y: position.y + vector.y
  };
}

export function normalizeTunnelPosition(
  maze: PacmanMazeDefinition,
  position: MazePosition
): MazePosition | null {
  if (isInMazeBounds(maze, position)) {
    return position;
  }

  const tunnelRow = maze.tunnel.left.y;
  if (position.y !== tunnelRow) {
    return null;
  }

  if (position.x < 0) {
    return { x: maze.width - 1, y: tunnelRow };
  }

  if (position.x >= maze.width) {
    return { x: 0, y: tunnelRow };
  }

  return null;
}

export function normalizeTunnelStep(
  maze: PacmanMazeDefinition,
  from: MazePosition,
  direction: Direction
): MazePosition | null {
  const neighbor = getRawNeighbor(from, direction);
  return normalizeTunnelPosition(maze, neighbor);
}

export function getMovementNeighbor(
  maze: PacmanMazeDefinition,
  from: MazePosition,
  direction: Direction,
  actorRole: MazeActorRole = "pacman"
): MazePosition | null {
  const next = normalizeTunnelStep(maze, from, direction);

  if (next === null) {
    return null;
  }

  return isTraversable(maze, next, actorRole) ? next : null;
}

export function getAvailableDirections(
  maze: PacmanMazeDefinition,
  from: MazePosition,
  actorRole: MazeActorRole = "pacman"
): readonly Direction[] {
  const directions: Direction[] = [];

  for (const direction of PACMAN_DIRECTIONS) {
    if (getMovementNeighbor(maze, from, direction, actorRole) !== null) {
      directions.push(direction);
    }
  }

  return directions;
}

export function isIntersection(
  maze: PacmanMazeDefinition,
  position: MazePosition,
  actorRole: MazeActorRole = "pacman"
): boolean {
  if (!isTraversable(maze, position, actorRole)) {
    return false;
  }

  return getAvailableDirections(maze, position, actorRole).length >= 3;
}

export function getInitialPelletState(
  maze: PacmanMazeDefinition = PACMAN_CLASSIC_MAZE
): InitialPelletState {
  const normalPellets = new Set<MazeTileKey>(
    maze.pelletTiles.map((position) => toMazeTileKey(position))
  );

  const powerPellets = new Set<MazeTileKey>(
    maze.powerPelletTiles.map((position) => toMazeTileKey(position))
  );

  return {
    totalCount: normalPellets.size + powerPellets.size,
    normalPellets,
    powerPellets
  };
}

export function getInitialPelletCount(
  maze: PacmanMazeDefinition = PACMAN_CLASSIC_MAZE
): number {
  return maze.pelletTiles.length + maze.powerPelletTiles.length;
}

export function getPacmanSpawn(
  maze: PacmanMazeDefinition = PACMAN_CLASSIC_MAZE
): MazePosition {
  return maze.spawns.pacman;
}

export function getFruitSpawn(
  maze: PacmanMazeDefinition = PACMAN_CLASSIC_MAZE
): MazePosition {
  return maze.spawns.fruit;
}

export function getGhostSpawn(
  ghostId: GhostId,
  maze: PacmanMazeDefinition = PACMAN_CLASSIC_MAZE
): MazePosition {
  return maze.spawns.ghosts[ghostId];
}

export function getGhostSpawns(
  maze: PacmanMazeDefinition = PACMAN_CLASSIC_MAZE
): Readonly<Record<GhostId, MazePosition>> {
  return maze.spawns.ghosts;
}

export function getScatterTarget(
  ghostId: GhostId,
  maze: PacmanMazeDefinition = PACMAN_CLASSIC_MAZE
): MazePosition {
  return maze.scatterTargets[ghostId];
}

export function getScatterTargets(
  maze: PacmanMazeDefinition = PACMAN_CLASSIC_MAZE
): Readonly<Record<GhostId, MazePosition>> {
  return maze.scatterTargets;
}

export function getGhostHouseMetadata(
  maze: PacmanMazeDefinition = PACMAN_CLASSIC_MAZE
): GhostHouseMetadata {
  return maze.ghostHouse;
}

export function getGhostReleasePath(
  ghostId: GhostId,
  maze: PacmanMazeDefinition = PACMAN_CLASSIC_MAZE
): readonly MazePosition[] {
  return maze.ghostHouse.releasePaths[ghostId];
}

export function getGhostReturnPath(
  maze: PacmanMazeDefinition = PACMAN_CLASSIC_MAZE
): readonly MazePosition[] {
  return maze.ghostHouse.returnPath;
}

function areOrthogonalNeighbors(a: MazePosition, b: MazePosition): boolean {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y) === 1;
}

function findReachableKeys(
  maze: PacmanMazeDefinition,
  start: MazePosition,
  actorRole: MazeActorRole
): ReadonlySet<MazeTileKey> {
  const visited = new Set<MazeTileKey>();
  const queue: MazePosition[] = [start];

  while (queue.length > 0) {
    const current = queue.shift();

    if (current === undefined) {
      continue;
    }

    const key = toMazeTileKey(current);
    if (visited.has(key)) {
      continue;
    }

    visited.add(key);

    for (const direction of PACMAN_DIRECTIONS) {
      const neighbor = getMovementNeighbor(maze, current, direction, actorRole);
      if (neighbor !== null && !visited.has(toMazeTileKey(neighbor))) {
        queue.push(neighbor);
      }
    }
  }

  return visited;
}

function validatePath(
  maze: PacmanMazeDefinition,
  path: readonly MazePosition[],
  expectedStart: MazePosition,
  expectedEnd: MazePosition,
  actorRole: MazeActorRole,
  label: string
): readonly string[] {
  const errors: string[] = [];

  if (path.length === 0) {
    errors.push(`${label}: path is empty`);
    return errors;
  }

  const first = path[0];
  const last = path[path.length - 1];

  if (first.x !== expectedStart.x || first.y !== expectedStart.y) {
    errors.push(`${label}: does not start at expected tile`);
  }

  if (last.x !== expectedEnd.x || last.y !== expectedEnd.y) {
    errors.push(`${label}: does not end at expected tile`);
  }

  for (let index = 0; index < path.length; index += 1) {
    const position = path[index];
    if (!isTraversable(maze, position, actorRole)) {
      errors.push(`${label}: includes non-traversable tile at ${toMazeTileKey(position)}`);
    }

    if (index > 0 && !areOrthogonalNeighbors(path[index - 1], position)) {
      errors.push(`${label}: has non-adjacent step at index ${index}`);
    }
  }

  return errors;
}

export function validatePacmanMazeDefinition(
  maze: PacmanMazeDefinition = PACMAN_CLASSIC_MAZE
): readonly string[] {
  const errors: string[] = [];

  if (maze.height !== maze.tiles.length) {
    errors.push("Maze height does not match tile row count.");
  }

  for (const [rowIndex, row] of maze.tiles.entries()) {
    if (row.length !== maze.width) {
      errors.push(`Row ${rowIndex} width does not match maze width.`);
    }
  }

  let scannedPelletCount = 0;
  let scannedPowerCount = 0;

  for (let y = 0; y < maze.height; y += 1) {
    for (let x = 0; x < maze.width; x += 1) {
      const position = { x, y };
      const tile = maze.tiles[y][x];

      if (tile === "pellet" || tile === "power-pellet") {
        const traversable = isTraversable(maze, position, "pacman");
        if (!traversable) {
          errors.push(`Pellet tile is not traversable at ${toMazeTileKey(position)}.`);
        }
      }

      if (tile === "pellet") {
        scannedPelletCount += 1;
      }

      if (tile === "power-pellet") {
        scannedPowerCount += 1;
      }
    }
  }

  if (scannedPelletCount !== maze.pelletTiles.length) {
    errors.push("pelletTiles metadata does not match map pellet count.");
  }

  if (scannedPowerCount !== maze.powerPelletTiles.length) {
    errors.push("powerPelletTiles metadata does not match map power pellet count.");
  }

  if (scannedPowerCount !== 4) {
    errors.push(`Expected exactly four power pellets, got ${scannedPowerCount}.`);
  }

  const tunnelLeft = maze.tunnel.left;
  const tunnelRight = maze.tunnel.right;
  if (tunnelLeft.y !== tunnelRight.y) {
    errors.push("Tunnel endpoints must share the same row.");
  }

  if (!isTraversable(maze, tunnelLeft, "pacman")) {
    errors.push("Left tunnel endpoint is not traversable for Pac-Man.");
  }

  if (!isTraversable(maze, tunnelRight, "pacman")) {
    errors.push("Right tunnel endpoint is not traversable for Pac-Man.");
  }

  const wrappedFromLeft = normalizeTunnelStep(maze, tunnelLeft, "left");
  const wrappedFromRight = normalizeTunnelStep(maze, tunnelRight, "right");

  if (
    wrappedFromLeft === null ||
    wrappedFromLeft.x !== tunnelRight.x ||
    wrappedFromLeft.y !== tunnelRight.y
  ) {
    errors.push("Tunnel wrap from left endpoint is invalid.");
  }

  if (
    wrappedFromRight === null ||
    wrappedFromRight.x !== tunnelLeft.x ||
    wrappedFromRight.y !== tunnelLeft.y
  ) {
    errors.push("Tunnel wrap from right endpoint is invalid.");
  }

  const pacmanSpawn = maze.spawns.pacman;
  if (!isTraversable(maze, pacmanSpawn, "pacman")) {
    errors.push("Pac-Man spawn tile is invalid.");
  }

  const fruitSpawn = maze.spawns.fruit;
  if (!isTraversable(maze, fruitSpawn, "pacman")) {
    errors.push("Fruit spawn tile is invalid.");
  }

  for (const [ghostId, spawn] of Object.entries(maze.spawns.ghosts) as [
    GhostId,
    MazePosition
  ][]) {
    if (!isTraversable(maze, spawn, "ghost")) {
      errors.push(`${ghostId} spawn tile is not traversable for ghosts.`);
    }

    const tile = getMazeTile(maze, spawn);
    if (tile !== "ghost-house") {
      errors.push(`${ghostId} spawn tile must be inside the ghost house.`);
    }
  }

  for (const door of maze.ghostHouse.doorTiles) {
    if (getMazeTile(maze, door) !== "ghost-door") {
      errors.push(`Ghost house door metadata points to non-door tile ${toMazeTileKey(door)}.`);
    }
  }

  if (!isTraversable(maze, maze.ghostHouse.releaseTile, "ghost")) {
    errors.push("Ghost house release tile is not ghost-traversable.");
  }

  if (!isTraversable(maze, maze.ghostHouse.returnAnchor, "ghost")) {
    errors.push("Ghost house return anchor is not ghost-traversable.");
  }

  for (const [ghostId, path] of Object.entries(maze.ghostHouse.releasePaths) as [
    GhostId,
    readonly MazePosition[]
  ][]) {
    errors.push(
      ...validatePath(
        maze,
        path,
        maze.spawns.ghosts[ghostId],
        maze.ghostHouse.releaseTile,
        "ghost",
        `${ghostId} release path`
      )
    );
  }

  errors.push(
    ...validatePath(
      maze,
      maze.ghostHouse.returnPath,
      maze.ghostHouse.releaseTile,
      maze.ghostHouse.returnAnchor,
      "ghost",
      "return path"
    )
  );

  const reachableForPacman = findReachableKeys(maze, maze.spawns.pacman, "pacman");
  const requiredPacmanReachable = [
    ...maze.pelletTiles,
    ...maze.powerPelletTiles,
    maze.spawns.fruit,
    maze.tunnel.left,
    maze.tunnel.right
  ];

  for (const position of requiredPacmanReachable) {
    if (!reachableForPacman.has(toMazeTileKey(position))) {
      errors.push(`Unreachable Pac-Man target tile ${toMazeTileKey(position)}.`);
    }
  }

  return errors;
}

const PACMAN_MAZE_VALIDATION_ERRORS = validatePacmanMazeDefinition(
  PACMAN_CLASSIC_MAZE
);

if (PACMAN_MAZE_VALIDATION_ERRORS.length > 0) {
  throw new Error(
    `Pac-Man maze validation failed:\n${PACMAN_MAZE_VALIDATION_ERRORS
      .map((error) => `- ${error}`)
      .join("\n")}`
  );
}
