"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";

type Mode = "tower" | "core";
type ViewMode = "orbit" | "spatial";
type Axis = "x" | "y" | "z";
type Vector = { x: number; y: number; z: number };
type Quaternion = { x: number; y: number; z: number; w: number };
type Cube = Vector & { color: string };
type Piece = { cubes: Cube[]; color: string; shapeIndex: number };
type Game = {
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
type MotionStatus = "starting" | "active" | "unsupported" | "denied";
type Projected = { x: number; y: number; depth: number };
type Face = { points: Projected[]; depth: number; color: string };
type Camera = { orientation: Quaternion; targetOrientation: Quaternion };
type Gesture = {
  pointerId: number;
  startX: number;
  startY: number;
  lastX: number;
  lastY: number;
  distance: number;
  startedAt: number;
};

const BOARD = 5;
const HEIGHT = 10;
const COLORS = ["#ff5b79", "#ffc24b", "#65e6b4", "#7b8cff", "#e982ff"];
const CORE_COLOR = "#d7ff56";
const DEG = Math.PI / 180;
const HALF_PI = Math.PI / 2;
const DEFAULT_YAW = -Math.PI / 4;
const DEFAULT_PITCH = Math.atan(1 / Math.sqrt(2));
const SHAPES: Array<Array<[number, number, number]>> = [
  [[0, 0, 0], [1, 0, 0], [0, 0, 1], [1, 0, 1]],
  [[0, 0, 0], [1, 0, 0], [2, 0, 0], [1, 1, 0]],
  [[0, 0, 0], [0, 1, 0], [0, 0, 1], [1, 0, 1]],
  [[0, 0, 0], [1, 0, 0], [2, 0, 0], [2, 0, 1]],
  [[0, 0, 0], [1, 0, 0], [1, 1, 0], [1, 1, 1]],
];
const CORE_DIRECTIONS: Vector[] = [
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

const cubeKey = ({ x, y, z }: Pick<Cube, "x" | "y" | "z">) => `${x},${y},${z}`;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const distanceSquared = ({ x, y, z }: Vector) => x * x + y * y + z * z;
const pieceDistance = (piece: Piece) => piece.cubes.reduce((sum, cube) => sum + distanceSquared(cube), 0);
const randomShapeIndex = () => Math.floor(Math.random() * SHAPES.length);

function quaternionNormalize(q: Quaternion): Quaternion {
  const length = Math.hypot(q.x, q.y, q.z, q.w) || 1;
  return { x: q.x / length, y: q.y / length, z: q.z / length, w: q.w / length };
}

function quaternionConjugate(q: Quaternion): Quaternion {
  return { x: -q.x, y: -q.y, z: -q.z, w: q.w };
}

function quaternionNegate(q: Quaternion): Quaternion {
  return { x: -q.x, y: -q.y, z: -q.z, w: -q.w };
}

function quaternionDot(a: Quaternion, b: Quaternion) {
  return a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w;
}

function quaternionMultiply(a: Quaternion, b: Quaternion): Quaternion {
  return {
    x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
    y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
    z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
    w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
  };
}

function quaternionFromAxisAngle(axis: Axis, angle: number): Quaternion {
  const half = angle / 2;
  const sine = Math.sin(half);
  const cosine = Math.cos(half);
  if (axis === "x") return { x: sine, y: 0, z: 0, w: cosine };
  if (axis === "y") return { x: 0, y: sine, z: 0, w: cosine };
  return { x: 0, y: 0, z: sine, w: cosine };
}

function quaternionFromEulerYXZ(x: number, y: number, z: number) {
  return quaternionNormalize(
    quaternionMultiply(
      quaternionMultiply(quaternionFromAxisAngle("y", y), quaternionFromAxisAngle("x", x)),
      quaternionFromAxisAngle("z", z),
    ),
  );
}

function quaternionRotateVector(q: Quaternion, vector: Vector): Vector {
  const vectorQuaternion = { x: vector.x, y: vector.y, z: vector.z, w: 0 };
  const rotated = quaternionMultiply(quaternionMultiply(q, vectorQuaternion), quaternionConjugate(q));
  return { x: rotated.x, y: rotated.y, z: rotated.z };
}

function quaternionSlerp(from: Quaternion, to: Quaternion, amount: number): Quaternion {
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

function quaternionToRotationVector(q: Quaternion): Vector {
  let normalized = quaternionNormalize(q);
  if (normalized.w < 0) normalized = quaternionNegate(normalized);
  const sineHalf = Math.hypot(normalized.x, normalized.y, normalized.z);
  if (sineHalf < 1e-7) return { x: 0, y: 0, z: 0 };
  const angle = 2 * Math.atan2(sineHalf, clamp(normalized.w, -1, 1));
  const scale = angle / sineHalf;
  return { x: normalized.x * scale, y: normalized.y * scale, z: normalized.z * scale };
}

function deviceQuaternion(alpha: number, beta: number, gamma: number, screenAngle: number) {
  const orientation = quaternionFromEulerYXZ(beta * DEG, alpha * DEG, -gamma * DEG);
  const cameraCorrection = quaternionFromAxisAngle("x", -HALF_PI);
  const screenCorrection = quaternionFromAxisAngle("z", -screenAngle * DEG);
  return quaternionNormalize(quaternionMultiply(quaternionMultiply(orientation, cameraCorrection), screenCorrection));
}

function getScreenOrientationAngle() {
  if (typeof window === "undefined") return 0;
  if (typeof window.screen?.orientation?.angle === "number") return window.screen.orientation.angle;
  const legacyWindow = window as Window & { orientation?: number };
  return typeof legacyWindow.orientation === "number" ? legacyWindow.orientation : 0;
}

const DEFAULT_WORLD_TO_VIEW = quaternionNormalize(
  quaternionMultiply(quaternionFromAxisAngle("x", DEFAULT_PITCH), quaternionFromAxisAngle("y", -DEFAULT_YAW)),
);
const DEFAULT_CAMERA_ORIENTATION = quaternionConjugate(DEFAULT_WORLD_TO_VIEW);

function projectDirection(vector: Vector, camera: Camera) {
  const view = quaternionRotateVector(quaternionConjugate(camera.orientation), vector);
  return { x: view.x, y: -view.y, depth: view.z };
}

function centeredOffsets(shapeIndex: number) {
  const shape = SHAPES[shapeIndex % SHAPES.length];
  const axisCenter = (axis: 0 | 1 | 2) => {
    const values = shape.map((offset) => offset[axis]);
    return Math.floor((Math.min(...values) + Math.max(...values)) / 2);
  };
  const [cx, cy, cz] = [axisCenter(0), axisCenter(1), axisCenter(2)];
  return shape.map(([x, y, z]) => ({ x: x - cx, y: y - cy, z: z - cz }));
}

function makeTemplatePiece(shapeIndex: number): Piece {
  const color = COLORS[shapeIndex % COLORS.length];
  return {
    color,
    shapeIndex,
    cubes: centeredOffsets(shapeIndex).map((offset) => ({ ...offset, color })),
  };
}

function makeTowerPiece(shapeIndex: number): Piece {
  const offsets = SHAPES[shapeIndex % SHAPES.length];
  const color = COLORS[shapeIndex % COLORS.length];
  const highestOffset = Math.max(...offsets.map(([, y]) => y));
  return {
    color,
    shapeIndex,
    cubes: offsets.map(([x, y, z]) => ({
      x: x + 1,
      y: y + HEIGHT - 1 - highestOffset,
      z: z + 1,
      color,
    })),
  };
}

function coreStats(cubes: Cube[]) {
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

function isValidTower(cubes: Cube[], settled: Cube[]) {
  const occupied = new Set(settled.map(cubeKey));
  return cubes.every((cube) =>
    cube.x >= 0 && cube.x < BOARD &&
    cube.z >= 0 && cube.z < BOARD &&
    cube.y >= 0 && cube.y < HEIGHT &&
    !occupied.has(cubeKey(cube))
  );
}

function isValidCore(cubes: Cube[], settled: Cube[]) {
  const occupied = new Set(settled.map(cubeKey));
  return cubes.every((cube) => !occupied.has(cubeKey(cube)));
}

function isValidForGame(game: Game, cubes: Cube[]) {
  return game.mode === "tower" ? isValidTower(cubes, game.settled) : isValidCore(cubes, game.settled);
}

function spawnCorePiece(shapeIndex: number, settled: Cube[], preferredDirection: number) {
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

function initialGame(mode: Mode = "tower"): Game {
  if (mode === "core") {
    const settled = [{ x: 0, y: 0, z: 0, color: CORE_COLOR }];
    const spawned = spawnCorePiece(0, settled, 0)!;
    const stats = coreStats(settled);
    return {
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

  return {
    mode,
    settled: [
      { x: 0, y: 0, z: 0, color: "#7b8cff" },
      { x: 1, y: 0, z: 0, color: "#7b8cff" },
      { x: 1, y: 0, z: 1, color: "#7b8cff" },
      { x: 2, y: 0, z: 1, color: "#65e6b4" },
      { x: 3, y: 0, z: 1, color: "#65e6b4" },
      { x: 3, y: 0, z: 2, color: "#65e6b4" },
    ],
    active: makeTowerPiece(0),
    next: makeTowerPiece(3),
    score: 120,
    layers: 0,
    radius: 0,
    density: 0,
    pieces: 0,
    spawnCursor: 0,
    paused: false,
    gameOver: false,
  };
}

function translatePiece(piece: Piece, vector: Vector): Piece {
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

function radialStep(piece: Piece, settled: Cube[]) {
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

function lockTowerAndSpawn(game: Game, piece: Piece): Game {
  const merged = [...game.settled, ...piece.cubes];
  const fullLayers = Array.from({ length: HEIGHT }, (_, y) => y)
    .filter((y) => merged.filter((cube) => cube.y === y).length === BOARD * BOARD);
  const remaining = merged
    .filter((cube) => !fullLayers.includes(cube.y))
    .map((cube) => ({
      ...cube,
      y: cube.y - fullLayers.filter((clearedY) => clearedY < cube.y).length,
    }));
  const incoming = game.next;
  return {
    ...game,
    settled: remaining,
    active: incoming,
    next: makeTowerPiece(randomShapeIndex()),
    score: game.score + (fullLayers.length ? fullLayers.length * 500 : 20),
    layers: game.layers + fullLayers.length,
    pieces: game.pieces + 1,
    gameOver: !isValidTower(incoming.cubes, remaining),
  };
}

function lockCoreAndSpawn(game: Game, piece: Piece): Game {
  const merged = [...game.settled, ...piece.cubes];
  const previous = coreStats(game.settled);
  const stats = coreStats(merged);
  const compactnessGain = Math.max(0, stats.density - previous.density);
  const spawned = spawnCorePiece(game.next.shapeIndex, merged, game.spawnCursor);
  return {
    ...game,
    settled: merged,
    active: spawned?.piece ?? game.active,
    next: makeTemplatePiece(randomShapeIndex()),
    score: game.score + 50 + Math.round(stats.density * 350 + compactnessGain * 2000),
    radius: stats.radius,
    density: stats.density,
    pieces: game.pieces + 1,
    spawnCursor: (spawned?.directionIndex ?? game.spawnCursor) + 7,
    gameOver: !spawned,
  };
}

function advanceGame(game: Game): Game {
  if (game.paused || game.gameOver) return game;
  if (game.mode === "tower") {
    const moved = translatePiece(game.active, { x: 0, y: -1, z: 0 });
    return isValidTower(moved.cubes, game.settled) ? { ...game, active: moved } : lockTowerAndSpawn(game, game.active);
  }
  const moved = radialStep(game.active, game.settled);
  return moved ? { ...game, active: moved } : lockCoreAndSpawn(game, game.active);
}

function shade(hex: string, amount: number) {
  const value = parseInt(hex.slice(1), 16);
  const channel = (shift: number) => clamp(((value >> shift) & 255) + amount, 0, 255);
  return `rgb(${channel(16)}, ${channel(8)}, ${channel(0)})`;
}

export default function Game() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [game, setGame] = useState<Game>(() => initialGame());
  const gameRef = useRef(game);
  const [motionStatus, setMotionStatus] = useState<MotionStatus>("starting");
  const [viewMode, setViewMode] = useState<ViewMode>("orbit");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [multiplier, setMultiplier] = useState(1);
  const [smoothing, setSmoothing] = useState(0.18);
  const settingsReady = useRef(false);
  const baselineDevice = useRef<Quaternion | null>(null);
  const latestDevice = useRef<Quaternion | null>(null);
  const camera = useRef<Camera>({
    orientation: { ...DEFAULT_CAMERA_ORIENTATION },
    targetOrientation: { ...DEFAULT_CAMERA_ORIENTATION },
  });
  const gesture = useRef<Gesture | null>(null);

  useEffect(() => { gameRef.current = game; }, [game]);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      try {
        const saved = JSON.parse(localStorage.getItem("3d-blocks-motion") ?? "null");
        if (saved?.viewMode === "orbit" || saved?.viewMode === "spatial") setViewMode(saved.viewMode);
        if (typeof saved?.multiplier === "number") {
          setMultiplier(clamp(saved.multiplier, 0.2, 5));
        } else {
          const legacy = [saved?.xMultiplier, saved?.yMultiplier].filter((value) => typeof value === "number") as number[];
          if (legacy.length) setMultiplier(clamp(legacy.reduce((sum, value) => sum + value, 0) / legacy.length, 0.2, 5));
        }
        if (typeof saved?.smoothing === "number") setSmoothing(clamp(saved.smoothing, 0.06, 0.42));
      } catch { /* Ignore damaged local settings. */ }
      settingsReady.current = true;
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (!settingsReady.current) return;
    localStorage.setItem("3d-blocks-motion", JSON.stringify({ viewMode, multiplier, smoothing }));
  }, [multiplier, smoothing, viewMode]);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      if (!("DeviceOrientationEvent" in window)) {
        setMotionStatus("unsupported");
        return;
      }
      type PermissionOrientationEvent = typeof DeviceOrientationEvent & {
        requestPermission?: () => Promise<"granted" | "denied">;
      };
      const OrientationEvent = DeviceOrientationEvent as PermissionOrientationEvent;
      setMotionStatus(OrientationEvent.requestPermission ? "starting" : "active");
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  const recenter = useCallback(() => {
    baselineDevice.current = latestDevice.current;
    camera.current.targetOrientation = { ...DEFAULT_CAMERA_ORIENTATION };
  }, []);

  const selectViewMode = useCallback((mode: ViewMode) => {
    setViewMode(mode);
    baselineDevice.current = latestDevice.current;
    camera.current.targetOrientation = { ...DEFAULT_CAMERA_ORIENTATION };
  }, []);

  useEffect(() => {
    if (motionStatus !== "active") return;
    const onOrientation = (event: DeviceOrientationEvent) => {
      if (event.alpha == null || event.beta == null || event.gamma == null) return;
      let sample = deviceQuaternion(event.alpha, event.beta, event.gamma, getScreenOrientationAngle());
      if (latestDevice.current && quaternionDot(sample, latestDevice.current) < 0) sample = quaternionNegate(sample);
      latestDevice.current = sample;
      baselineDevice.current ??= sample;
      const baseline = baselineDevice.current;
      const localDelta = quaternionNormalize(quaternionMultiply(quaternionConjugate(baseline), sample));

      if (viewMode === "spatial") {
        camera.current.targetOrientation = quaternionNormalize(quaternionMultiply(DEFAULT_CAMERA_ORIENTATION, localDelta));
        return;
      }

      const rotation = quaternionToRotationVector(localDelta);
      const yaw = clamp(DEFAULT_YAW + rotation.y * multiplier, -HALF_PI, 0);
      const pitch = clamp(DEFAULT_PITCH + rotation.x * multiplier, 0, HALF_PI);
      const worldToView = quaternionNormalize(
        quaternionMultiply(quaternionFromAxisAngle("x", pitch), quaternionFromAxisAngle("y", -yaw)),
      );
      camera.current.targetOrientation = quaternionConjugate(worldToView);
    };
    window.addEventListener("deviceorientation", onOrientation, true);
    return () => window.removeEventListener("deviceorientation", onOrientation, true);
  }, [motionStatus, multiplier, viewMode]);

  const enableMotion = useCallback(async () => {
    if (motionStatus === "active" || motionStatus === "unsupported") return;
    if (!("DeviceOrientationEvent" in window)) {
      setMotionStatus("unsupported");
      return;
    }
    type PermissionOrientationEvent = typeof DeviceOrientationEvent & { requestPermission?: () => Promise<"granted" | "denied"> };
    try {
      const OrientationEvent = DeviceOrientationEvent as PermissionOrientationEvent;
      const permission = OrientationEvent.requestPermission ? await OrientationEvent.requestPermission() : "granted";
      if (permission !== "granted") {
        setMotionStatus("denied");
        return;
      }
      baselineDevice.current = null;
      latestDevice.current = null;
      camera.current.targetOrientation = { ...DEFAULT_CAMERA_ORIENTATION };
      setMotionStatus("active");
    } catch {
      setMotionStatus("denied");
    }
  }, [motionStatus]);

  const move = useCallback((x: number, y: number, z: number) => {
    setGame((current) => {
      if (current.paused || current.gameOver) return current;
      const moved = translatePiece(current.active, { x, y, z });
      return isValidForGame(current, moved.cubes) ? { ...current, active: moved } : current;
    });
  }, []);

  const rotatePiece = useCallback((axis: Axis = "y") => {
    setGame((current) => {
      if (current.paused || current.gameOver) return current;
      const pivot = current.active.cubes[0];
      const cubes = current.active.cubes.map((cube) => {
        const dx = cube.x - pivot.x;
        const dy = cube.y - pivot.y;
        const dz = cube.z - pivot.z;
        if (axis === "x") return { ...cube, y: pivot.y - dz, z: pivot.z + dy };
        if (axis === "z") return { ...cube, x: pivot.x - dy, y: pivot.y + dx };
        return { ...cube, x: pivot.x - dz, z: pivot.z + dx };
      });
      return isValidForGame(current, cubes) ? { ...current, active: { ...current.active, cubes } } : current;
    });
  }, []);

  const hardDrop = useCallback(() => {
    setGame((current) => {
      if (current.paused || current.gameOver) return current;
      if (current.mode === "tower") {
        let piece = current.active;
        let moved = translatePiece(piece, { x: 0, y: -1, z: 0 });
        while (isValidTower(moved.cubes, current.settled)) {
          piece = moved;
          moved = translatePiece(piece, { x: 0, y: -1, z: 0 });
        }
        return lockTowerAndSpawn(current, piece);
      }
      let piece = current.active;
      for (let step = 0; step < 2000; step += 1) {
        const moved = radialStep(piece, current.settled);
        if (!moved) return lockCoreAndSpawn(current, piece);
        piece = moved;
      }
      return current;
    });
  }, []);

  const moveFromScreenVector = useCallback((screenX: number, screenY: number) => {
    const current = gameRef.current;
    if (current.paused || current.gameOver) return;
    const directions = current.mode === "core"
      ? [
          { x: 1, y: 0, z: 0 }, { x: -1, y: 0, z: 0 },
          { x: 0, y: 1, z: 0 }, { x: 0, y: -1, z: 0 },
          { x: 0, y: 0, z: 1 }, { x: 0, y: 0, z: -1 },
        ]
      : [
          { x: 1, y: 0, z: 0 }, { x: -1, y: 0, z: 0 },
          { x: 0, y: 0, z: 1 }, { x: 0, y: 0, z: -1 },
        ];
    const gestureLength = Math.hypot(screenX, screenY) || 1;
    const best = directions
      .map((direction) => {
        const projected = projectDirection(direction, camera.current);
        const axisLength = Math.hypot(projected.x, projected.y) || 1;
        return {
          direction,
          score: (screenX * projected.x + screenY * projected.y) / (gestureLength * axisLength),
        };
      })
      .sort((a, b) => b.score - a.score)[0];
    move(best.direction.x, best.direction.y, best.direction.z);
  }, [move]);

  const rotateFromCamera = useCallback(() => {
    const axes: Array<{ axis: Axis; vector: Vector }> = [
      { axis: "x", vector: { x: 1, y: 0, z: 0 } },
      { axis: "y", vector: { x: 0, y: 1, z: 0 } },
      { axis: "z", vector: { x: 0, y: 0, z: 1 } },
    ];
    const axis = axes
      .map((candidate) => ({ ...candidate, depth: Math.abs(projectDirection(candidate.vector, camera.current).depth) }))
      .sort((a, b) => b.depth - a.depth)[0].axis;
    rotatePiece(axis);
  }, [rotatePiece]);

  const onPointerDown = useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    void enableMotion();
    event.currentTarget.setPointerCapture(event.pointerId);
    gesture.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      lastX: event.clientX,
      lastY: event.clientY,
      distance: 0,
      startedAt: performance.now(),
    };
  }, [enableMotion]);

  const onPointerMove = useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
    const current = gesture.current;
    if (!current || current.pointerId !== event.pointerId) return;
    const dx = event.clientX - current.lastX;
    const dy = event.clientY - current.lastY;
    current.distance = Math.max(current.distance, Math.hypot(event.clientX - current.startX, event.clientY - current.startY));
    const delta = Math.hypot(dx, dy);
    if (delta < 34) return;
    const steps = Math.min(3, Math.floor(delta / 34));
    for (let step = 0; step < steps; step += 1) moveFromScreenVector(dx, dy);
    current.lastX = event.clientX;
    current.lastY = event.clientY;
  }, [moveFromScreenVector]);

  const finishGesture = useCallback((event: React.PointerEvent<HTMLCanvasElement>, cancelled = false) => {
    const current = gesture.current;
    if (!current || current.pointerId !== event.pointerId) return;
    gesture.current = null;
    if (cancelled || current.distance >= 14) return;
    if (performance.now() - current.startedAt >= 520) hardDrop();
    else rotateFromCamera();
  }, [hardDrop, rotateFromCamera]);

  useEffect(() => {
    const timer = window.setInterval(() => setGame(advanceGame), 780);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Space"].includes(event.code)) event.preventDefault();
      if (event.key === "ArrowLeft") move(-1, 0, 0);
      if (event.key === "ArrowRight") move(1, 0, 0);
      if (event.key === "ArrowUp") move(0, 0, -1);
      if (event.key === "ArrowDown") move(0, 0, 1);
      if (event.key.toLowerCase() === "q") move(0, -1, 0);
      if (event.key.toLowerCase() === "e") move(0, 1, 0);
      if (["x", "y", "z"].includes(event.key.toLowerCase())) rotatePiece(event.key.toLowerCase() as Axis);
      if (event.key.toLowerCase() === "r") rotatePiece("y");
      if (event.code === "Space") hardDrop();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [hardDrop, move, rotatePiece]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    let frame = 0;

    const draw = () => {
      const current = gameRef.current;
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const pixelWidth = Math.max(1, Math.round(rect.width * dpr));
      const pixelHeight = Math.max(1, Math.round(rect.height * dpr));
      if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
        canvas.width = pixelWidth;
        canvas.height = pixelHeight;
      }
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      const width = rect.width;
      const height = rect.height;
      context.clearRect(0, 0, width, height);

      const motion = camera.current;
      motion.orientation = quaternionSlerp(motion.orientation, motion.targetOrientation, smoothing);
      const activeRadius = Math.sqrt(Math.max(...current.active.cubes.map(distanceSquared), 0));
      const sceneRadius = current.mode === "core" ? Math.max(4, current.radius + 1.5, activeRadius + 1) : 6;
      const scale = current.mode === "core"
        ? Math.min(width, height) / (sceneRadius * 2.15)
        : Math.min(width / 9.2, height / 14.5);
      const centerY = current.mode === "core" ? height * 0.5 : height * 0.53;
      const worldToView = quaternionConjugate(motion.orientation);

      const project = (x: number, y: number, z: number): Projected => {
        const centeredX = current.mode === "core" ? x : x - BOARD / 2;
        const centeredY = current.mode === "core" ? y : y - HEIGHT / 2;
        const centeredZ = current.mode === "core" ? z : z - BOARD / 2;
        const view = quaternionRotateVector(worldToView, { x: centeredX, y: centeredY, z: centeredZ });
        const perspectiveDistance = Math.max(12, sceneRadius * 4);
        const perspective = perspectiveDistance / (perspectiveDistance - view.z * 0.42);
        return { x: width / 2 + view.x * scale * perspective, y: centerY - view.y * scale * perspective, depth: view.z };
      };

      context.lineWidth = 1;
      if (current.mode === "tower") {
        context.strokeStyle = "rgba(255,255,255,.10)";
        for (let i = 0; i <= BOARD; i += 1) {
          const a = project(i, 0, 0);
          const b = project(i, 0, BOARD);
          const c = project(0, 0, i);
          const d = project(BOARD, 0, i);
          context.beginPath(); context.moveTo(a.x, a.y); context.lineTo(b.x, b.y); context.stroke();
          context.beginPath(); context.moveTo(c.x, c.y); context.lineTo(d.x, d.y); context.stroke();
        }
      } else {
        const guideRadius = Math.max(2.25, current.radius + 1.35);
        context.strokeStyle = "rgba(115,245,255,.17)";
        const drawOrbit = (plane: Axis) => {
          context.beginPath();
          for (let index = 0; index <= 64; index += 1) {
            const angle = index / 64 * Math.PI * 2;
            const a = Math.cos(angle) * guideRadius;
            const b = Math.sin(angle) * guideRadius;
            const point = plane === "x" ? project(0, a, b) : plane === "y" ? project(a, 0, b) : project(a, b, 0);
            if (index === 0) context.moveTo(point.x, point.y); else context.lineTo(point.x, point.y);
          }
          context.stroke();
        };
        drawOrbit("x"); drawOrbit("y"); drawOrbit("z");

        const centroid = current.active.cubes.reduce((total, cube) => ({
          x: total.x + cube.x / current.active.cubes.length,
          y: total.y + cube.y / current.active.cubes.length,
          z: total.z + cube.z / current.active.cubes.length,
        }), { x: 0, y: 0, z: 0 });
        const from = project(centroid.x, centroid.y, centroid.z);
        const core = project(0, 0, 0);
        context.save();
        context.setLineDash([5, 5]);
        context.strokeStyle = "rgba(215,255,86,.5)";
        context.beginPath(); context.moveTo(from.x, from.y); context.lineTo(core.x, core.y); context.stroke();
        context.restore();
        const glow = context.createRadialGradient(core.x, core.y, 0, core.x, core.y, 24);
        glow.addColorStop(0, "rgba(215,255,86,.95)");
        glow.addColorStop(.22, "rgba(215,255,86,.32)");
        glow.addColorStop(1, "rgba(215,255,86,0)");
        context.fillStyle = glow;
        context.beginPath(); context.arc(core.x, core.y, 24, 0, Math.PI * 2); context.fill();
      }

      const faces: Face[] = [];
      const faceDefs = [
        { corners: [[0,0,0],[1,0,0],[1,1,0],[0,1,0]], shade: -24 },
        { corners: [[0,0,1],[0,1,1],[1,1,1],[1,0,1]], shade: -10 },
        { corners: [[0,0,0],[0,1,0],[0,1,1],[0,0,1]], shade: -34 },
        { corners: [[1,0,0],[1,0,1],[1,1,1],[1,1,0]], shade: -18 },
        { corners: [[0,1,0],[1,1,0],[1,1,1],[0,1,1]], shade: 28 },
        { corners: [[0,0,0],[0,0,1],[1,0,1],[1,0,0]], shade: -40 },
      ] as const;
      const cubeOffset = current.mode === "core" ? -0.5 : 0;
      [...current.settled, ...current.active.cubes].forEach((cube) => {
        faceDefs.forEach((face) => {
          const points = face.corners.map(([x, y, z]) => project(cube.x + x + cubeOffset, cube.y + y + cubeOffset, cube.z + z + cubeOffset));
          faces.push({
            points,
            depth: points.reduce((sum, point) => sum + point.depth, 0) / points.length,
            color: shade(cube.color, face.shade),
          });
        });
      });
      faces.sort((a, b) => a.depth - b.depth).forEach((face) => {
        context.beginPath();
        face.points.forEach((point, index) => index ? context.lineTo(point.x, point.y) : context.moveTo(point.x, point.y));
        context.closePath();
        context.fillStyle = face.color;
        context.fill();
        context.strokeStyle = "rgba(255,255,255,.24)";
        context.stroke();
      });

      frame = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(frame);
  }, [smoothing]);

  const togglePause = () => setGame((current) => ({ ...current, paused: !current.paused }));
  const restart = () => setGame((current) => initialGame(current.mode));
  const selectMode = (mode: Mode) => setGame(initialGame(mode));
  const level = Math.floor(game.layers / 3) + 1;
  const motionTitle = motionStatus === "active"
    ? (viewMode === "orbit" ? "ORBIT ACTIVE" : "SPATIAL ACTIVE")
    : "TILT CAMERA";
  const motionSubtitle = motionStatus === "active"
    ? (viewMode === "orbit" ? "Tilt between front, top, and side" : "1:1 full-sphere orientation")
    : "Enable motion to steer the view";

  return (
    <main className={`game-shell ${game.mode === "core" ? "core-mode" : ""}`}>
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">3D</span>
          <div><strong>3D BLOCKS</strong><small>{game.mode === "core" ? "RADIAL CORE" : "MOTION TOWER"}</small></div>
        </div>
        <button className="icon-btn" onClick={togglePause} aria-label={game.paused ? "Resume" : "Pause"}>{game.paused ? "▶" : "Ⅱ"}</button>
      </header>

      <nav className="mode-switch" aria-label="Game mode">
        <button className={game.mode === "tower" ? "active" : ""} onClick={() => selectMode("tower")}><b>↓</b><span>TOWER<small>ONE-WAY GRAVITY</small></span></button>
        <button className={game.mode === "core" ? "active" : ""} onClick={() => selectMode("core")}><b>◎</b><span>CORE<small>360° GRAVITY</small></span></button>
      </nav>

      <nav className="mode-switch" aria-label="View mode">
        <button className={viewMode === "orbit" ? "active" : ""} onClick={() => selectViewMode("orbit")}><b>↻</b><span>ORBIT<small>FRONT · TOP · SIDE</small></span></button>
        <button className={viewMode === "spatial" ? "active" : ""} onClick={() => selectViewMode("spatial")}><b>◉</b><span>SPATIAL<small>FULL-SPHERE 1:1 VIEW</small></span></button>
      </nav>

      <section className="motion-bar" aria-label="Motion camera controls">
        <div className="motion-copy">
          <span className={`status-dot ${motionStatus}`} />
          <div><strong>{motionTitle}</strong><small>{motionSubtitle}</small></div>
        </div>
        {motionStatus === "active"
          ? <button onClick={recenter}>RECENTER</button>
          : <button onClick={enableMotion}>{motionStatus === "denied" ? "TRY AGAIN" : "ENABLE"}</button>}
        <button className="settings-toggle" onClick={() => setSettingsOpen((open) => !open)} aria-expanded={settingsOpen} aria-label="Motion settings">⚙</button>
      </section>

      {settingsOpen && (
        <section className="motion-settings" aria-label="Motion sensitivity settings">
          <label>
            <span>Orbit multiplier <b>{multiplier.toFixed(1)}×</b></span>
            <input type="range" min="0.2" max="5" step="0.1" value={multiplier} disabled={viewMode === "spatial"} onChange={(event) => setMultiplier(Number(event.target.value))} />
          </label>
          <label><span>Smoothing <b>{Math.round(smoothing * 100)}%</b></span><input type="range" min="0.06" max="0.42" step="0.02" value={smoothing} onChange={(event) => setSmoothing(Number(event.target.value))} /></label>
          {viewMode === "spatial" && <p>Spatial view is 1:1. The multiplier applies only to Orbit.</p>}
          {(motionStatus === "unsupported" || motionStatus === "denied") && <p>{motionStatus === "unsupported" ? "Motion sensors are unavailable here. The game still works with a fixed view." : "Motion access was blocked. Allow motion access in your browser settings, then try again."}</p>}
        </section>
      )}

      <section className="game-card">
        {game.mode === "core" && <div className="core-brief"><i /> <span><strong>PACK THE CORE</strong><small>Every piece seeks point zero. Keep the radius small and the density high.</small></span></div>}
        <div className="score-row">
          <div><small>SCORE</small><strong>{game.score.toLocaleString()}</strong></div>
          {game.mode === "tower" ? (
            <><div><small>LEVEL</small><strong>{level}</strong></div><div><small>LAYERS</small><strong>{game.layers}</strong></div></>
          ) : (
            <><div><small>RADIUS</small><strong>{game.radius.toFixed(1)}</strong></div><div><small>DENSITY</small><strong>{Math.round(game.density * 100)}%</strong></div></>
          )}
        </div>

        <div className="canvas-wrap">
          <canvas
            ref={canvasRef}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={(event) => finishGesture(event)}
            onPointerCancel={(event) => finishGesture(event, true)}
            aria-label={game.mode === "core" ? "Radial 3D Blocks core. Swipe to move, tap to rotate, and hold to pull the active piece toward the center." : "3D Blocks tower. Swipe to move, tap to rotate, and hold to drop the active piece. Camera orientation follows the selected motion view."}
            aria-describedby="gesture-help"
          />
          <div className="axis-chip">{game.mode === "core" ? `CORE · ${viewMode.toUpperCase()}` : `${viewMode.toUpperCase()} VIEW`}</div>
          <div className="gesture-help" id="gesture-help"><span>SWIPE</span> MOVE <i /> <span>TAP</span> ROTATE <i /> <span>HOLD</span> {game.mode === "core" ? "PULL" : "DROP"}</div>
          {(game.paused || game.gameOver) && (
            <div className="overlay">
              <strong>{game.gameOver ? (game.mode === "core" ? "CORE SEALED" : "TOWER FULL") : "PAUSED"}</strong>
              <button onClick={game.gameOver ? restart : togglePause}>{game.gameOver ? "PLAY AGAIN" : "CONTINUE"}</button>
            </div>
          )}
        </div>
      </section>

      <footer>
        <span>NEXT</span>
        <div className="next-piece" aria-hidden="true">{game.next.cubes.map((_, index) => <i key={index} style={{ background: game.next.color }} />)}</div>
        {game.mode === "core" && <em>{game.pieces} PIECES PACKED</em>}
        <button onClick={restart}>NEW GAME</button>
      </footer>

      <a className="wofi-badge" href="https://wofi.ai/ideas/sha256%3Ac472014b92b2e4c50702ad044544f964707a78157100c5e79ce161bc01eca510" target="_blank" rel="noreferrer" aria-label="View the Wofi Idea behind 3D Blocks">
        <Image src="/wofi-logo.svg" width={22} height={22} alt="" />
        <span>THIS IS A WOFI IDEA</span>
      </a>
    </main>
  );
}
