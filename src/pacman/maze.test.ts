import {
  PACMAN_CLASSIC_MAZE,
  PACMAN_MAZE_HEIGHT,
  PACMAN_MAZE_WIDTH,
  getAvailableDirections,
  getGhostHouseMetadata,
  getGhostReleasePath,
  getGhostReturnPath,
  getGhostSpawns,
  getInitialPelletCount,
  getInitialPelletState,
  getMazeTile,
  getMovementNeighbor,
  getPacmanSpawn,
  isIntersection,
  isTraversable,
  normalizeTunnelStep,
  toMazeTileKey,
  validatePacmanMazeDefinition
} from "./maze";
import type { GhostId, MazePosition } from "./types";

describe("pacman maze foundation", () => {
  it("defines a deterministic rectangular 28x31 maze", () => {
    expect(PACMAN_CLASSIC_MAZE.width).toBe(PACMAN_MAZE_WIDTH);
    expect(PACMAN_CLASSIC_MAZE.height).toBe(PACMAN_MAZE_HEIGHT);
    expect(PACMAN_CLASSIC_MAZE.tiles).toHaveLength(PACMAN_MAZE_HEIGHT);

    for (const row of PACMAN_CLASSIC_MAZE.tiles) {
      expect(row).toHaveLength(PACMAN_MAZE_WIDTH);
    }
  });

  it("passes internal invariant validation", () => {
    expect(validatePacmanMazeDefinition(PACMAN_CLASSIC_MAZE)).toEqual([]);
  });

  it("tracks pellet metadata with exactly four power pellets", () => {
    const initial = getInitialPelletState(PACMAN_CLASSIC_MAZE);

    expect(PACMAN_CLASSIC_MAZE.powerPelletTiles).toHaveLength(4);
    expect(initial.powerPellets.size).toBe(4);
    expect(initial.totalCount).toBe(getInitialPelletCount(PACMAN_CLASSIC_MAZE));

    for (const powerPellet of PACMAN_CLASSIC_MAZE.powerPelletTiles) {
      expect(getMazeTile(PACMAN_CLASSIC_MAZE, powerPellet)).toBe("power-pellet");
    }

    for (const pellet of PACMAN_CLASSIC_MAZE.pelletTiles) {
      const key = toMazeTileKey(pellet);
      expect(initial.normalPellets.has(key)).toBe(true);
      expect(isTraversable(PACMAN_CLASSIC_MAZE, pellet, "pacman")).toBe(true);
    }
  });

  it("wraps movement through side tunnels", () => {
    const left = PACMAN_CLASSIC_MAZE.tunnel.left;
    const right = PACMAN_CLASSIC_MAZE.tunnel.right;

    expect(normalizeTunnelStep(PACMAN_CLASSIC_MAZE, left, "left")).toEqual(right);
    expect(normalizeTunnelStep(PACMAN_CLASSIC_MAZE, right, "right")).toEqual(left);
    expect(getMovementNeighbor(PACMAN_CLASSIC_MAZE, left, "right", "pacman")).toEqual({
      x: 1,
      y: left.y
    });
  });

  it("keeps spawn tiles and ghost-house semantics coherent", () => {
    const pacmanSpawn = getPacmanSpawn(PACMAN_CLASSIC_MAZE);
    expect(isTraversable(PACMAN_CLASSIC_MAZE, pacmanSpawn, "pacman")).toBe(true);

    const house = getGhostHouseMetadata(PACMAN_CLASSIC_MAZE);
    for (const door of house.doorTiles) {
      expect(getMazeTile(PACMAN_CLASSIC_MAZE, door)).toBe("ghost-door");
      expect(isTraversable(PACMAN_CLASSIC_MAZE, door, "pacman")).toBe(false);
      expect(isTraversable(PACMAN_CLASSIC_MAZE, door, "ghost")).toBe(true);
    }

    const ghostSpawns = getGhostSpawns(PACMAN_CLASSIC_MAZE);
    const ghostIds: readonly GhostId[] = ["blinky", "pinky", "inky", "clyde"];
    for (const ghostId of ghostIds) {
      const spawn = ghostSpawns[ghostId];
      expect(getMazeTile(PACMAN_CLASSIC_MAZE, spawn)).toBe("ghost-house");
      expect(isTraversable(PACMAN_CLASSIC_MAZE, spawn, "pacman")).toBe(false);
      expect(isTraversable(PACMAN_CLASSIC_MAZE, spawn, "ghost")).toBe(true);

      assertContiguousPath(getGhostReleasePath(ghostId, PACMAN_CLASSIC_MAZE));
    }

    assertContiguousPath(getGhostReturnPath(PACMAN_CLASSIC_MAZE));
  });

  it("exposes movement neighbors and intersections for future AI", () => {
    const candidates: MazePosition[] = [];

    for (let y = 0; y < PACMAN_CLASSIC_MAZE.height; y += 1) {
      for (let x = 0; x < PACMAN_CLASSIC_MAZE.width; x += 1) {
        const position = { x, y };
        if (isIntersection(PACMAN_CLASSIC_MAZE, position, "pacman")) {
          candidates.push(position);
        }
      }
    }

    expect(candidates.length).toBeGreaterThan(0);

    const pacmanSpawn = getPacmanSpawn(PACMAN_CLASSIC_MAZE);
    const spawnOptions = getAvailableDirections(
      PACMAN_CLASSIC_MAZE,
      pacmanSpawn,
      "pacman"
    );

    expect(spawnOptions.length).toBeLessThanOrEqual(2);
    expect(isIntersection(PACMAN_CLASSIC_MAZE, pacmanSpawn, "pacman")).toBe(false);
  });
});

function assertContiguousPath(path: readonly MazePosition[]): void {
  expect(path.length).toBeGreaterThan(1);

  for (let index = 1; index < path.length; index += 1) {
    const prev = path[index - 1];
    const next = path[index];
    const manhattan = Math.abs(prev.x - next.x) + Math.abs(prev.y - next.y);
    expect(manhattan).toBe(1);
  }
}
