import { clearPatches } from "./game-rules.ts";

export type Mode = "tower" | "patch" | "core";
export type ViewMode = "orbit" | "spatial";
export type Axis = "x" | "y" | "z";
export type Vector = { x: number; y: number; z: number };
export type Quaternion = { x: number; y: number; z: number; w: number };
export type Cube = Vector & { color: string };
export type Piece = { cubes: Cube[]; color: string; shapeIndex: number };
export type Pace = "relaxed" | "challenge";
export type Game = {
  pace: Pace;
  bag: number[];
  undo: Game | null;
  message: string;
  mode: Mode;
  settled: Cube[];
  active: Piece;
  next: Piece;
  score: number;
  layers: number;
  radius: number;
  density: number;
  pieces: number;
  spawnCursor: number;
  paused: boolean;
  gameOver: boolean;
};
export type MotionStatus = "starting" | "active" | "unsupported" | "denied";
export type Projected = { x: number; y: number; depth: number };
export type Face = { points: Projected[]; depth: number; color: string };
export type Camera = { orientation: Quaternion; targetOrientation: Quaternion };
export type Gesture = {
  pointerId: number;
  startX: number;
  startY: number;
  lastX: number;
  lastY: number;
  distance: number;
  startedAt: number;
};

export const TOWER_BOARD = 5;
export const PATCH_BOARD = 9;
export const HEIGHT = 10;
export const PATCH_SIZE = 3;
export const COLORS = ["#ff5b79", "#ffc24b", "#65e6b4", "#7b8cff", "#e982ff"];
export const CORE_COLOR = "#d7ff56";
export const DEG = Math.PI / 180;
export const HALF_PI = Math.PI / 2;
export const DEFAULT_YAW = -Math.PI / 4;
export const DEFAULT_PITCH = Math.atan(1 / Math.sqrt(2));
export const SHAPES: Array<Array<[number, number, number]>> = [
  [[0, 0, 0], [1, 0, 0], [0, 0, 1], [1, 0, 1]],
  [[0, 0, 0], [1, 0, 0], [2, 0, 0], [1, 1, 0]],
  [[0, 0, 0], [0, 1, 0], [0, 0, 1], [1, 0, 1]],
  [[0, 0, 0], [1, 0, 0], [2, 0, 0], [2, 0, 1]],
  [[0, 0, 0], [1, 0, 0], [1, 1, 0], [1, 1, 1]],
  [[0, 0, 0], [1, 0, 0]],
  [[0, 0, 0], [1, 0, 0], [2, 0, 0]],
  [[0, 0, 0], [1, 0, 0], [0, 0, 1]],
  [[0, 0, 0]],
];
export const CORE_DIRECTIONS: Vector[] = [
  { x: 1, y: 0, z: 0 }, { x: -1, y: 0, z: 0 },
  { x: 0, y: 1, z: 0 }, { x: 0, y: -1, z: 0 },
  { x: 0, y: 0, z: 1 }, { x: 0, y: 0, z: -1 },
  { x: 1, y: 1, z: 0 }, { x: -1, y: 1, z: 0 },
  { x: 1, y: -1, z: 0 }, { x: -1, y: -1, z: 0 },
  { x: 1, y: 0, z: 1 }, { x: -1, y: 0, z: 1 },
  { x: 1, y: 0, z: -1 }, { x: -1, y: 0, z: -1 },
  { x: 0, y: 1, z: 1 }, { x: 0, y: -1, z: 1 },
  { x: 0, y: 1, z: -1 }, { x: 0, y: -1, z: -1 },
  { x: 1, y: 1, z: 1 }, { x: -1, y: 1, z: 1 },
  { x: 1, y: -1, z: 1 }, { x: -1, y: -1, z: 1 },
  { x: 1, y: 1, z: -1 }, { x: -1, y: 1, z: -1 },
  { x: 1, y: -1, z: -1 }, { x: -1, y: -1, z: -1 },
];

export const cubeKey = ({ x, y, z }: Pick<Cube, "x" | "y" | "z">) => `${x},${y},${z}`;
export const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
export const distanceSquared = ({ x, y, z }: Vector) => x * x + y * y + z * z;
export const pieceDistance = (piece: Piece) => piece.cubes.reduce((sum, cube) => sum + distanceSquared(cube), 0);
// A shuffled bag gives every shape a turn, avoiding long runs of awkward pieces.
export function drawShape(bag: number[], mode: Mode, pace: Pace, random = Math.random) {
  const remaining = [...bag];
  if (!remaining.length) {
    remaining.push(...(pace === "relaxed" && mode !== "core" ? [0, 5, 6, 7, 8] : [0, 1, 2, 3, 4]));
    for (let i = remaining.length - 1; i > 0; i -= 1) {
      const j = Math.floor(random() * (i + 1));
      [remaining[i], remaining[j]] = [remaining[j], remaining[i]];
    }
  }
  return { index: remaining.shift()!, bag: remaining };
}

export function fallInterval(game: Pick<Game, "pace" | "layers" | "pieces" | "mode">) {
  if (game.pace === "relaxed") return null;
  const level = Math.floor((game.mode === "core" ? game.pieces / 5 : game.layers) / 3);
  return Math.max(260, 1400 - level * 120);
}
export const isBoundedMode = (mode: Mode) => mode !== "core";
export const boardSizeForMode = (mode: Mode) => mode === "patch" ? PATCH_BOARD : TOWER_BOARD;
export function quaternionNormalize(q: Quaternion): Quaternion {
  const length = Math.hypot(q.x, q.y, q.z, q.w) || 1;
  return { x: q.x / length, y: q.y / length, z: q.z / length, w: q.w / length };
}

export function quaternionConjugate(q: Quaternion): Quaternion {
  return { x: -q.x, y: -q.y, z: -q.z, w: q.w };
}

export function quaternionNegate(q: Quaternion): Quaternion {
  return { x: -q.x, y: -q.y, z: -q.z, w: -q.w };
}

export function quaternionDot(a: Quaternion, b: Quaternion) {
  return a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w;
}

export function quaternionMultiply(a: Quaternion, b: Quaternion): Quaternion {
  return {
    x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
    y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
    z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
    w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
  };
}

export function quaternionFromAxisAngle(axis: Axis, angle: number): Quaternion {
  const half = angle / 2;
  const sine = Math.sin(half);
  const cosine = Math.cos(half);
  if (axis === "x") return { x: sine, y: 0, z: 0, w: cosine };
  if (axis === "y") return { x: 0, y: sine, z: 0, w: cosine };
  return { x: 0, y: 0, z: sine, w: cosine };
}

export function quaternionFromEulerYXZ(x: number, y: number, z: number) {
  return quaternionNormalize(
    quaternionMultiply(
      quaternionMultiply(quaternionFromAxisAngle("y", y), quaternionFromAxisAngle("x", x)),
      quaternionFromAxisAngle("z", z),
    ),
  );
}

export function quaternionRotateVector(q: Quaternion, vector: Vector): Vector {
  const vectorQuaternion = { x: vector.x, y: vector.y, z: vector.z, w: 0 };
  const rotated = quaternionMultiply(quaternionMultiply(q, vectorQuaternion), quaternionConjugate(q));
  return { x: rotated.x, y: rotated.y, z: rotated.z };
}

export function quaternionSlerp(from: Quaternion, to: Quaternion, amount: number): Quaternion {
  let target = to;
  let dot = quaternionDot(from, target);
  if (dot < 0) {
    target = quaternionNegate(target);
    dot = -dot;
  }
  dot = clamp(dot, -1, 1);
  if (dot > 0.9995) {
    return quaternionNormalize({
      x: from.x + (target.x - from.x) * amount,
      y: from.y + (target.y - from.y) * amount,
      z: from.z + (target.z - from.z) * amount,
      w: from.w + (target.w - from.w) * amount,
    });
  }
  const theta = Math.acos(dot);
  const sine = Math.sin(theta);
  const fromWeight = Math.sin((1 - amount) * theta) / sine;
  const targetWeight = Math.sin(amount * theta) / sine;
  return quaternionNormalize({
    x: from.x * fromWeight + target.x * targetWeight,
    y: from.y * fromWeight + target.y * targetWeight,
    z: from.z * fromWeight + target.z * targetWeight,
    w: from.w * fromWeight + target.w * targetWeight,
  });
}

export function quaternionToRotationVector(q: Quaternion): Vector {
  let normalized = quaternionNormalize(q);
  if (normalized.w < 0) normalized = quaternionNegate(normalized);
  const sineHalf = Math.hypot(normalized.x, normalized.y, normalized.z);
  if (sineHalf < 1e-7) return { x: 0, y: 0, z: 0 };
  const angle = 2 * Math.atan2(sineHalf, clamp(normalized.w, -1, 1));
  const scale = angle / sineHalf;
  return { x: normalized.x * scale, y: normalized.y * scale, z: normalized.z * scale };
}

export function deviceQuaternion(alpha: number, beta: number, gamma: number, screenAngle: number) {
  const orientation = quaternionFromEulerYXZ(beta * DEG, alpha * DEG, -gamma * DEG);
  const cameraCorrection = quaternionFromAxisAngle("x", -HALF_PI);
  const screenCorrection = quaternionFromAxisAngle("z", -screenAngle * DEG);
  return quaternionNormalize(quaternionMultiply(quaternionMultiply(orientation, cameraCorrection), screenCorrection));
}

export function getScreenOrientationAngle() {
  if (typeof window === "undefined") return 0;
  if (typeof window.screen?.orientation?.angle === "number") return window.screen.orientation.angle;
  const legacyWindow = window as Window & { orientation?: number };
  return typeof legacyWindow.orientation === "number" ? legacyWindow.orientation : 0;
}

export const DEFAULT_WORLD_TO_VIEW = quaternionNormalize(
  quaternionMultiply(quaternionFromAxisAngle("x", DEFAULT_PITCH), quaternionFromAxisAngle("y", -DEFAULT_YAW)),
);
export const DEFAULT_CAMERA_ORIENTATION = quaternionConjugate(DEFAULT_WORLD_TO_VIEW);

export function projectDirection(vector: Vector, camera: Camera) {
  const view = quaternionRotateVector(quaternionConjugate(camera.orientation), vector);
  return { x: view.x, y: -view.y, depth: view.z };
}

export function centeredOffsets(shapeIndex: number) {
  const shape = SHAPES[shapeIndex % SHAPES.length];
  const axisCenter = (axis: 0 | 1 | 2) => {
    const values = shape.map((offset) => offset[axis]);
    return Math.floor((Math.min(...values) + Math.max(...values)) / 2);
  };
  const [cx, cy, cz] = [axisCenter(0), axisCenter(1), axisCenter(2)];
  return shape.map(([x, y, z]) => ({ x: x - cx, y: y - cy, z: z - cz }));
}

export function makeTemplatePiece(shapeIndex: number): Piece {
  const color = COLORS[shapeIndex % COLORS.length];
  return {
    color,
    shapeIndex,
    cubes: centeredOffsets(shapeIndex).map((offset) => ({ ...offset, color })),
  };
}

export function makeTowerPiece(shapeIndex: number, mode: Exclude<Mode, "core">): Piece {
  const offsets = SHAPES[shapeIndex % SHAPES.length];
  const color = COLORS[shapeIndex % COLORS.length];
  const highestOffset = Math.max(...offsets.map(([, y]) => y));
  const width = Math.max(...offsets.map(([x]) => x)) + 1;
  const depth = Math.max(...offsets.map(([, , z]) => z)) + 1;
  const boardSize = boardSizeForMode(mode);
  const spawnX = Math.floor((boardSize - width) / 2);
  const spawnZ = Math.floor((boardSize - depth) / 2);
  return {
    color,
    shapeIndex,
    cubes: offsets.map(([x, y, z]) => ({
      x: x + spawnX,
      y: y + HEIGHT - 1 - highestOffset,
      z: z + spawnZ,
      color,
    })),
  };
}

export function coreStats(cubes: Cube[]) {
  const radius = cubes.length ? Math.sqrt(Math.max(...cubes.map(distanceSquared))) : 0;
  const shell = Math.max(1, Math.ceil(radius));
  let capacity = 0;
  for (let x = -shell; x <= shell; x += 1) {
    for (let y = -shell; y <= shell; y += 1) {
      for (let z = -shell; z <= shell; z += 1) {
        if (x * x + y * y + z * z <= shell * shell) capacity += 1;
      }
    }
  }
  return { radius, density: capacity ? Math.min(1, cubes.length / capacity) : 0 };
}

export function isValidTower(cubes: Cube[], settled: Cube[], boardSize: number) {
  const occupied = new Set(settled.map(cubeKey));
  return cubes.every((cube) =>
    cube.x >= 0 && cube.x < boardSize &&
    cube.z >= 0 && cube.z < boardSize &&
    cube.y >= 0 && cube.y < HEIGHT &&
    !occupied.has(cubeKey(cube))
  );
}

export function isValidCore(cubes: Cube[], settled: Cube[]) {
  const occupied = new Set(settled.map(cubeKey));
  return cubes.every((cube) => !occupied.has(cubeKey(cube)));
}

export function isValidForGame(game: Game, cubes: Cube[]) {
  return isBoundedMode(game.mode)
    ? isValidTower(cubes, game.settled, boardSizeForMode(game.mode))
    : isValidCore(cubes, game.settled);
}

export function spawnCorePiece(shapeIndex: number, settled: Cube[], preferredDirection: number) {
  const color = COLORS[shapeIndex % COLORS.length];
  const offsets = centeredOffsets(shapeIndex);
  const clusterRadius = coreStats(settled).radius;
  const spawnRadius = Math.max(4, Math.ceil(clusterRadius) + 3);

  for (let attempt = 0; attempt < CORE_DIRECTIONS.length; attempt += 1) {
    const directionIndex = (preferredDirection + attempt) % CORE_DIRECTIONS.length;
    const direction = CORE_DIRECTIONS[directionIndex];
    const length = Math.sqrt(distanceSquared(direction));
    const anchor = {
      x: Math.round(direction.x / length * spawnRadius),
      y: Math.round(direction.y / length * spawnRadius),
      z: Math.round(direction.z / length * spawnRadius),
    };
    const piece: Piece = {
      color,
      shapeIndex,
      cubes: offsets.map((offset) => ({
        x: anchor.x + offset.x,
        y: anchor.y + offset.y,
        z: anchor.z + offset.z,
        color,
      })),
    };
    if (isValidCore(piece.cubes, settled)) return { piece, directionIndex };
  }
  return null;
}

export function initialGame(mode: Mode = "tower", pace: Pace = "relaxed"): Game {
  const common = { pace, bag: [] as number[], undo: null, message: "Move the block, then press Drop." };
  if (mode === "core") {
    const settled = [{ x: 0, y: 0, z: 0, color: CORE_COLOR }];
    const spawned = spawnCorePiece(0, settled, 0)!;
    const stats = coreStats(settled);
    return {
      ...common,
      mode,
      settled,
      active: spawned.piece,
      next: makeTemplatePiece(3),
      score: 0,
      layers: 0,
      radius: stats.radius,
      density: stats.density,
      pieces: 0,
      spawnCursor: spawned.directionIndex + 7,
      paused: false,
      gameOver: false,
    };
  }

  const boundedMode = mode as Exclude<Mode, "core">;
  const boardSize = boardSizeForMode(boundedMode);
  // A clearly introduced starter puzzle: one square completes the first floor.
  const settled: Cube[] = [];
  if (mode === "tower" && pace === "relaxed") {
    for (let x = 0; x < boardSize; x += 1) {
      for (let z = 0; z < boardSize; z += 1) {
        if ((x === 1 || x === 2) && (z === 1 || z === 2)) continue;
        settled.push({ x, y: 0, z, color: "#677694" });
      }
    }
  }
  return {
    ...common,
    mode,
    settled,
    active: makeTowerPiece(0, boundedMode),
    next: makeTowerPiece(pace === "relaxed" ? 5 : 3, boundedMode),
    score: 0,
    layers: 0,
    radius: 0,
    density: 0,
    pieces: 0,
    spawnCursor: 0,
    paused: false,
    gameOver: false,
  };
}

export function translatePiece(piece: Piece, vector: Vector): Piece {
  return {
    ...piece,
    cubes: piece.cubes.map((cube) => ({
      ...cube,
      x: cube.x + vector.x,
      y: cube.y + vector.y,
      z: cube.z + vector.z,
    })),
  };
}

export function radialStep(piece: Piece, settled: Cube[]) {
  const currentDistance = pieceDistance(piece);
  const candidates: Vector[] = [
    { x: -1, y: 0, z: 0 }, { x: 1, y: 0, z: 0 },
    { x: 0, y: -1, z: 0 }, { x: 0, y: 1, z: 0 },
    { x: 0, y: 0, z: -1 }, { x: 0, y: 0, z: 1 },
  ];
  return candidates
    .map((vector) => {
      const moved = translatePiece(piece, vector);
      return { moved, improvement: currentDistance - pieceDistance(moved) };
    })
    .filter(({ improvement }) => improvement > 0)
    .sort((a, b) => b.improvement - a.improvement)
    .find(({ moved }) => isValidCore(moved.cubes, settled))?.moved ?? null;
}

export function lockTowerAndSpawn(game: Game, piece: Piece): Game {
  const merged = [...game.settled, ...piece.cubes];
  const boardSize = boardSizeForMode(game.mode);
  let clears = 0;
  let remaining: Cube[];
  if (game.mode === "patch") {
    const result = clearPatches(merged, PATCH_BOARD, PATCH_SIZE, HEIGHT);
    clears = result.patches;
    remaining = result.remaining;
  } else {
    const fullLayers = Array.from({ length: HEIGHT }, (_, y) => y)
      .filter((y) => merged.filter((cube) => cube.y === y).length === boardSize * boardSize);
    clears = fullLayers.length;
    remaining = merged
      .filter((cube) => !fullLayers.includes(cube.y))
      .map((cube) => ({
        ...cube,
        y: cube.y - fullLayers.filter((clearedY) => clearedY < cube.y).length,
      }));
  }
  const incoming = game.next;
  const drawn = drawShape(game.bag, game.mode, game.pace);
  return {
    ...game,
    settled: remaining,
    active: incoming,
    next: makeTowerPiece(drawn.index, game.mode as Exclude<Mode, "core">),
    bag: drawn.bag,
    undo: { ...game, undo: null },
    message: clears ? (game.layers === 0 ? "Your first clear! Beautiful." : `${clears > 1 ? `${clears} at once!` : "Nicely done!"} Keep going.`) : (game.mode === "patch" ? "Placed! Fill a 3 × 3 square to clear it." : "Placed! Fill the gaps to clear a floor."),
    score: game.score + (clears ? clears * 500 : 20),
    layers: game.layers + clears,
    pieces: game.pieces + 1,
    gameOver: !isValidTower(incoming.cubes, remaining, boardSize),
  };
}

export function lockCoreAndSpawn(game: Game, piece: Piece): Game {
  const merged = [...game.settled, ...piece.cubes];
  const previous = coreStats(game.settled);
  const stats = coreStats(merged);
  const compactnessGain = Math.max(0, stats.density - previous.density);
  const spawned = spawnCorePiece(game.next.shapeIndex, merged, game.spawnCursor);
  const drawn = drawShape(game.bag, game.mode, game.pace);
  return {
    ...game,
    settled: merged,
    active: spawned?.piece ?? game.active,
    next: makeTemplatePiece(drawn.index),
    bag: drawn.bag,
    undo: { ...game, undo: null },
    message: "Packed! Keep the blocks close to the center.",
    score: game.score + 50 + Math.round(stats.density * 350 + compactnessGain * 2000),
    radius: stats.radius,
    density: stats.density,
    pieces: game.pieces + 1,
    spawnCursor: (spawned?.directionIndex ?? game.spawnCursor) + 7,
    gameOver: !spawned,
  };
}

export function advanceGame(game: Game): Game {
  if (game.paused || game.gameOver || game.pace === "relaxed") return game;
  if (isBoundedMode(game.mode)) {
    const moved = translatePiece(game.active, { x: 0, y: -1, z: 0 });
    return isValidTower(moved.cubes, game.settled, boardSizeForMode(game.mode)) ? { ...game, active: moved } : lockTowerAndSpawn(game, game.active);
  }
  const moved = radialStep(game.active, game.settled);
  return moved ? { ...game, active: moved } : lockCoreAndSpawn(game, game.active);
}

export function shade(hex: string, amount: number) {
  const value = parseInt(hex.slice(1), 16);
  const channel = (shift: number) => clamp(((value >> shift) & 255) + amount, 0, 255);
  return `rgb(${channel(16)}, ${channel(8)}, ${channel(0)})`;
}

export function landingPiece(game: Game): Piece {
  let piece = game.active;
  for (let step = 0; step < 2000; step += 1) {
    const moved = game.mode === "core"
      ? radialStep(piece, game.settled)
      : translatePiece(piece, { x: 0, y: -1, z: 0 });
    if (!moved || !isValidForGame(game, moved.cubes)) return piece;
    piece = moved;
  }
  return piece;
}

export function dropGame(game: Game): Game {
  if (game.paused || game.gameOver) return game;
  const piece = landingPiece(game);
  return game.mode === "core" ? lockCoreAndSpawn(game, piece) : lockTowerAndSpawn(game, piece);
}

export function undoGame(game: Game): Game {
  if (game.paused || !game.undo || game.pace !== "relaxed") return game;
  return { ...game.undo, paused: false, message: "Try another spot. Take your time.", undo: null };
}

// Assign the two floor axes to different screen directions, even in an
// isometric tie. A dot-product winner alone can map all arrows to one axis.
export function screenMove(screenX: number, screenY: number, camera: Camera, mode: Mode): Vector {
  if (mode === "core") {
    const vectors = [{ x: 1, y: 0, z: 0 }, { x: -1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }, { x: 0, y: -1, z: 0 }, { x: 0, y: 0, z: 1 }, { x: 0, y: 0, z: -1 }];
    return vectors.sort((a,b) => {
      const score = (vector: Vector) => { const p = projectDirection(vector, camera); return (screenX*p.x + screenY*p.y) / (Math.hypot(p.x,p.y) || 1); };
      return score(b)-score(a);
    })[0];
  }
  const x = projectDirection({ x: 1, y: 0, z: 0 }, camera);
  const z = projectDirection({ x: 0, y: 0, z: 1 }, camera);
  const xHorizontal = Math.abs(x.x) >= Math.abs(z.x) - 1e-6;
  const horizontalAxis = xHorizontal ? "x" : "z";
  const verticalAxis = xHorizontal ? "z" : "x";
  const horizontal = xHorizontal ? x : z;
  const vertical = xHorizontal ? z : x;
  const vector = { x: 0, y: 0, z: 0 };
  if (Math.abs(screenX) >= Math.abs(screenY)) {
    vector[horizontalAxis] = Math.sign(screenX) * (Math.sign(horizontal.x) || 1);
  } else {
    vector[verticalAxis] = Math.sign(screenY) * (Math.sign(Math.abs(vertical.y) > .01 ? vertical.y : vertical.depth) || 1);
  }
  return vector;
}
