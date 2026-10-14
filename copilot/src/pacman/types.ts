export type Direction = "up" | "right" | "down" | "left";

export interface MazePosition {
  readonly x: number;
  readonly y: number;
}

export type GhostId = "blinky" | "pinky" | "inky" | "clyde";

export type MazeActorRole = "pacman" | "ghost" | "eyes";

export type MazeTileKind =
  | "wall"
  | "corridor"
  | "pellet"
  | "power-pellet"
  | "ghost-house"
  | "ghost-door";

export interface MazeTunnelPair {
  readonly left: MazePosition;
  readonly right: MazePosition;
}

export interface MazeRectangle {
  readonly minX: number;
  readonly maxX: number;
  readonly minY: number;
  readonly maxY: number;
}

export interface GhostHouseMetadata {
  readonly bounds: MazeRectangle;
  readonly doorTiles: readonly MazePosition[];
  readonly releaseTile: MazePosition;
  readonly returnAnchor: MazePosition;
  readonly releasePaths: Readonly<Record<GhostId, readonly MazePosition[]>>;
  readonly returnPath: readonly MazePosition[];
}

export interface MazeSpawns {
  readonly pacman: MazePosition;
  readonly fruit: MazePosition;
  readonly ghosts: Readonly<Record<GhostId, MazePosition>>;
}

export type ScatterTargets = Readonly<Record<GhostId, MazePosition>>;

export type MazeTileKey = `${number},${number}`;

export interface InitialPelletState {
  readonly totalCount: number;
  readonly normalPellets: ReadonlySet<MazeTileKey>;
  readonly powerPellets: ReadonlySet<MazeTileKey>;
}

export interface PacmanMazeDefinition {
  readonly id: string;
  readonly width: number;
  readonly height: number;
  readonly tiles: readonly (readonly MazeTileKind[])[];
  readonly tunnel: MazeTunnelPair;
  readonly spawns: MazeSpawns;
  readonly scatterTargets: ScatterTargets;
  readonly ghostHouse: GhostHouseMetadata;
  readonly pelletTiles: readonly MazePosition[];
  readonly powerPelletTiles: readonly MazePosition[];
}
