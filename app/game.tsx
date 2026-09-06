"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { findWallKickedRotation } from "./game-rules";
import {
  type Game as GameState, type Mode, type Pace, type ViewMode, type Axis, type Piece,
  type Vector, type Quaternion, type Camera, type Gesture, type Projected, type Face,
  HEIGHT, DEFAULT_YAW, DEFAULT_PITCH, HALF_PI, DEFAULT_CAMERA_ORIENTATION,
  clamp, distanceSquared, initialGame, translatePiece, isValidForGame,
  advanceGame, fallInterval, landingPiece, dropGame, undoGame, boardSizeForMode, isBoundedMode,
  shade, screenMove, projectDirection, deviceQuaternion, getScreenOrientationAngle,
  quaternionSlerp, quaternionNormalize, quaternionMultiply, quaternionConjugate,
  quaternionNegate, quaternionDot, quaternionToRotationVector, quaternionFromAxisAngle,
  quaternionRotateVector,
} from "./game-engine";

type MotionStatus = "starting" | "active" | "unsupported" | "denied";
type JoystickName = "move" | "action";
type JoystickVector = { x: number; y: number };
const idleJoystick = (): Record<JoystickName, JoystickVector> => ({ move: { x: 0, y: 0 }, action: { x: 0, y: 0 } });

export default function Game() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const [game, setGame] = useState<GameState>(() => ({ ...initialGame(), paused: true }));
  const gameRef = useRef(game);
  const [menu, setMenu] = useState<"welcome" | "new" | "help" | null>("welcome");
  const [chosenMode, setChosenMode] = useState<Mode>("tower");
  const [chosenPace, setChosenPace] = useState<Pace>("relaxed");
  const [fixedView, setFixedView] = useState("3D");
  const [best, setBest] = useState(0);
  const boardHelpId = "board-help";
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
  const [joystickPosition, setJoystickPosition] = useState(idleJoystick);
  const joystickVectors = useRef(idleJoystick());
  const joystickPointers = useRef<Record<JoystickName, number | null>>({ move: null, action: null });
  const joystickTimers = useRef<Record<JoystickName, number | null>>({ move: null, action: null });
  const joystickTicks = useRef<Record<JoystickName, number>>({ move: 0, action: 0 });

  useEffect(() => { gameRef.current = game; }, [game]);

  // Keep keyboard focus in the currently open game dialog, then restore it.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const previous = document.activeElement as HTMLElement | null;
    const buttons = () => Array.from(dialog.querySelectorAll<HTMLButtonElement>("button:not(:disabled)"));
    buttons()[0]?.focus({ preventScroll: true });
    const onDialogKey = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const items = buttons();
      const current = items.indexOf(document.activeElement as HTMLButtonElement);
      if (event.shiftKey && current <= 0) { event.preventDefault(); items.at(-1)?.focus(); }
      else if (!event.shiftKey && (current === items.length - 1 || current < 0)) { event.preventDefault(); items[0]?.focus(); }
    };
    document.addEventListener("keydown", onDialogKey);
    return () => {
      document.removeEventListener("keydown", onDialogKey);
      if (previous?.isConnected && !previous.closest(".overlay")) previous.focus({ preventScroll: true });
    };
  }, [menu, game.paused, game.gameOver]);

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
    try { localStorage.setItem("3d-blocks-motion", JSON.stringify({ viewMode, multiplier, smoothing })); } catch { /* Play still works when storage is blocked. */ }
  }, [multiplier, smoothing, viewMode]);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      if (!("DeviceOrientationEvent" in window)) {
        setMotionStatus("unsupported");
        return;
      }
      setMotionStatus("starting");
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

  const rotatePiece = useCallback((axis: Axis = "y", direction: 1 | -1 = 1) => {
    setGame((current) => {
      if (current.paused || current.gameOver) return current;
      const pivot = current.active.cubes[0];
      let cubes = current.active.cubes;
      const turns = direction === 1 ? 1 : 3;
      for (let turn = 0; turn < turns; turn += 1) {
        cubes = cubes.map((cube) => {
          const dx = cube.x - pivot.x;
          const dy = cube.y - pivot.y;
          const dz = cube.z - pivot.z;
          if (axis === "x") return { ...cube, y: pivot.y - dz, z: pivot.z + dy };
          if (axis === "z") return { ...cube, x: pivot.x - dy, y: pivot.y + dx };
          return { ...cube, x: pivot.x - dz, z: pivot.z + dx };
        });
      }
      const kicked = findWallKickedRotation(cubes, axis, (candidate) => isValidForGame(current, candidate));
      return kicked ? { ...current, active: { ...current.active, cubes: kicked } } : current;
    });
  }, []);

  const hardDrop = useCallback(() => { setGame(dropGame); }, []);
  const undo = useCallback(() => setGame(undoGame), []);

  const moveFromScreenVector = useCallback((screenX: number, screenY: number) => {
    const current = gameRef.current;
    if (current.paused || current.gameOver) return;
    const direction = screenMove(screenX, screenY, camera.current, current.mode);
    move(direction.x, direction.y, direction.z);
  }, [move]);

  const rotateFromCamera = useCallback((direction: 1 | -1 = 1) => {
    if (gameRef.current.mode !== "core") { rotatePiece("y", direction); return; }
    const axes: Array<{ axis: Axis; vector: Vector }> = [
      { axis: "x", vector: { x: 1, y: 0, z: 0 } },
      { axis: "y", vector: { x: 0, y: 1, z: 0 } },
      { axis: "z", vector: { x: 0, y: 0, z: 1 } },
    ];
    const axis = axes
      .map((candidate) => ({ ...candidate, depth: Math.abs(projectDirection(candidate.vector, camera.current).depth) }))
      .sort((a, b) => b.depth - a.depth)[0].axis;
    rotatePiece(axis, direction);
  }, [rotatePiece]);

  const actOnJoystick = useCallback((name: JoystickName, vector: JoystickVector, immediate = false) => {
    const length = Math.hypot(vector.x, vector.y);
    if (length < 0.34) return;
    const x = vector.x / length;
    const y = vector.y / length;
    if (name === "move") {
      moveFromScreenVector(x, y);
      return;
    }
    if (Math.abs(y) >= Math.abs(x)) {
      move(0, y < 0 ? 1 : -1, 0);
      return;
    }
    if (immediate || joystickTicks.current.action % 3 === 0) {
      rotateFromCamera(x < 0 ? -1 : 1);
    }
  }, [move, moveFromScreenVector, rotateFromCamera]);

  const updateJoystick = useCallback((name: JoystickName, event: React.PointerEvent<HTMLButtonElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const radius = Math.max(1, Math.min(bounds.width, bounds.height) * 0.34);
    const rawX = (event.clientX - (bounds.left + bounds.width / 2)) / radius;
    const rawY = (event.clientY - (bounds.top + bounds.height / 2)) / radius;
    const length = Math.hypot(rawX, rawY);
    const scale = length > 1 ? 1 / length : 1;
    const vector = { x: rawX * scale, y: rawY * scale };
    joystickVectors.current[name] = vector;
    setJoystickPosition((current) => ({ ...current, [name]: vector }));
    return vector;
  }, []);

  const startJoystick = useCallback((name: JoystickName, event: React.PointerEvent<HTMLButtonElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    joystickPointers.current[name] = event.pointerId;
    joystickTicks.current[name] = 0;
    const vector = updateJoystick(name, event);
    actOnJoystick(name, vector, true);
    if (joystickTimers.current[name] != null) window.clearInterval(joystickTimers.current[name]!);
    joystickTimers.current[name] = window.setInterval(() => {
      joystickTicks.current[name] += 1;
      actOnJoystick(name, joystickVectors.current[name]);
    }, 115);
  }, [actOnJoystick, updateJoystick]);

  const moveJoystick = useCallback((name: JoystickName, event: React.PointerEvent<HTMLButtonElement>) => {
    if (joystickPointers.current[name] !== event.pointerId) return;
    updateJoystick(name, event);
  }, [updateJoystick]);

  const stopJoystick = useCallback((name: JoystickName, pointerId: number) => {
    if (joystickPointers.current[name] !== pointerId) return;
    joystickPointers.current[name] = null;
    joystickVectors.current[name] = { x: 0, y: 0 };
    setJoystickPosition((current) => ({ ...current, [name]: { x: 0, y: 0 } }));
    if (joystickTimers.current[name] != null) window.clearInterval(joystickTimers.current[name]!);
    joystickTimers.current[name] = null;
  }, []);

  const onJoystickKeyDown = useCallback((name: JoystickName, event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (!event.key.startsWith("Arrow")) return;
    event.preventDefault();
    event.stopPropagation();
    if (name === "move") {
      if (event.key === "ArrowLeft") moveFromScreenVector(-1, 0);
      if (event.key === "ArrowRight") moveFromScreenVector(1, 0);
      if (event.key === "ArrowUp") moveFromScreenVector(0, -1);
      if (event.key === "ArrowDown") moveFromScreenVector(0, 1);
      return;
    }
    if (event.key === "ArrowLeft") rotateFromCamera(-1);
    if (event.key === "ArrowRight") rotateFromCamera(1);
    if (event.key === "ArrowUp") move(0, 1, 0);
    if (event.key === "ArrowDown") move(0, -1, 0);
  }, [move, moveFromScreenVector, rotateFromCamera]);

  useEffect(() => () => {
    (Object.keys(joystickTimers.current) as JoystickName[]).forEach((name) => {
      if (joystickTimers.current[name] != null) window.clearInterval(joystickTimers.current[name]!);
    });
  }, []);

  const onPointerDown = useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
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
  }, []);

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
    else rotatePiece("y");
  }, [hardDrop, rotatePiece]);

  const interval = fallInterval(game);
  useEffect(() => {
    if (interval === null || game.paused || game.gameOver) return;
    const timer = window.setInterval(() => setGame(advanceGame), interval);
    return () => window.clearInterval(timer);
  }, [interval, game.paused, game.gameOver, game.pieces]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (menu) {
        if (event.key === "Escape" && menu !== "welcome") { setMenu(null); setGame((current) => ({ ...current, paused: false })); }
        return;
      }
      if (target.matches("input, select, textarea") || target.isContentEditable) return;
      const key = event.key.toLowerCase();
      if (key === "p" || key === "escape") {
        event.preventDefault();
        if (!event.repeat) setGame((current) => (current.gameOver ? current : { ...current, paused: !current.paused }));
        return;
      }
      // Let focused buttons keep their native Space/Enter activation.
      if (target.closest("button") && (event.code === "Space" || key === "enter")) return;
      if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Space"].includes(event.code)) event.preventDefault();
      if (event.key === "ArrowLeft" || key === "a") moveFromScreenVector(-1, 0);
      if (event.key === "ArrowRight" || key === "d") moveFromScreenVector(1, 0);
      if (event.key === "ArrowUp" || key === "w") moveFromScreenVector(0, -1);
      if (event.key === "ArrowDown" || key === "s") moveFromScreenVector(0, 1);
      if (event.repeat) return;
      if (key === "r") rotatePiece("y");
      if (["x", "y", "z"].includes(key)) rotatePiece(key as Axis);
      if (key === "q") move(0, -1, 0);
      if (key === "e") move(0, 1, 0);
      if (key === "u") undo();
      if (event.code === "Space") hardDrop();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [hardDrop, move, moveFromScreenVector, rotatePiece, undo, menu]);

  useEffect(() => {
    const pauseAway = () => {
      if (document.hidden) setGame((current) => (current.gameOver ? current : { ...current, paused: true }));
    };
    const onBlur = () => {
      setGame((current) => (current.gameOver ? current : { ...current, paused: true }));
      gesture.current = null;
      (Object.keys(joystickPointers.current) as JoystickName[]).forEach((name) => {
        const pointer = joystickPointers.current[name];
        if (pointer !== null) stopJoystick(name, pointer);
      });
    };
    document.addEventListener("visibilitychange", pauseAway);
    window.addEventListener("blur", onBlur);
    return () => {
      document.removeEventListener("visibilitychange", pauseAway);
      window.removeEventListener("blur", onBlur);
    };
  }, [stopJoystick]);

  useEffect(() => {
    const key = `3d-blocks-best-${game.mode}-${game.pace}`;
    const frame = requestAnimationFrame(() => {
      try {
        const stored = Number(localStorage.getItem(key));
        const value = Math.max(game.score, Number.isFinite(stored) ? stored : 0);
        setBest(value);
        localStorage.setItem(key, String(value));
      } catch { setBest(game.score); }
    });
    return () => cancelAnimationFrame(frame);
  }, [game.score, game.mode, game.pace]);

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

      const landing = landingPiece(current);
      // With no falling timer, hover the piece near its landing position so
      // the useful part of the board can occupy more of a small screen.
      const relaxedFloor = current.pace === "relaxed" && isBoundedMode(current.mode);
      const hoverOffset = relaxedFloor ? Math.min(...landing.cubes.map(cube => cube.y)) + 3 - Math.min(...current.active.cubes.map(cube => cube.y)) : 0;
      const displayedActive = current.active.cubes.map(cube => ({ ...cube, y: cube.y + hoverOffset }));
      const viewHeight = relaxedFloor ? Math.max(5, ...current.settled.map(cube => cube.y + 2), ...displayedActive.map(cube => cube.y + 2)) : HEIGHT;
      const motion = camera.current;
      motion.orientation = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? motion.targetOrientation : quaternionSlerp(motion.orientation, motion.targetOrientation, smoothing);
      const activeRadius = Math.sqrt(Math.max(...current.active.cubes.map(distanceSquared), 0));
      const boardSize = boardSizeForMode(current.mode);
      const sceneRadius = current.mode === "core" ? Math.max(4, current.radius + 1.5, activeRadius + 1) : Math.max(boardSize, viewHeight) * 0.72;
      const scale = current.mode === "core"
        ? Math.min(width, height) / (sceneRadius * 2.15)
        : Math.min(width / (boardSize * 1.62), height / (viewHeight * 1.45));
      const centerY = current.mode === "core" ? height * 0.5 : height * 0.53;
      const worldToView = quaternionConjugate(motion.orientation);

      const project = (x: number, y: number, z: number): Projected => {
        const centeredX = current.mode === "core" ? x : x - boardSize / 2;
        const centeredY = current.mode === "core" ? y : y - viewHeight / 2;
        const centeredZ = current.mode === "core" ? z : z - boardSize / 2;
        const view = quaternionRotateVector(worldToView, { x: centeredX, y: centeredY, z: centeredZ });
        const perspectiveDistance = Math.max(12, sceneRadius * 4);
        const perspective = perspectiveDistance / (perspectiveDistance - view.z * 0.42);
        return { x: width / 2 + view.x * scale * perspective, y: centerY - view.y * scale * perspective, depth: view.z };
      };

      context.lineWidth = 1;
      if (isBoundedMode(current.mode)) {
        context.strokeStyle = "rgba(188,207,238,.27)";
        for (let i = 0; i <= boardSize; i += 1) {
          const a = project(i, 0, 0);
          const b = project(i, 0, boardSize);
          const c = project(0, 0, i);
          const d = project(boardSize, 0, i);
          context.beginPath(); context.moveTo(a.x, a.y); context.lineTo(b.x, b.y); context.stroke();
          context.beginPath(); context.moveTo(c.x, c.y); context.lineTo(d.x, d.y); context.stroke();
        }
        context.strokeStyle = "rgba(188,207,238,.13)";
        for (const [x, z] of [[0, 0], [0, boardSize], [boardSize, 0], [boardSize, boardSize]]) {
          const bottom = project(x, 0, z);
          const top = project(x, viewHeight, z);
          context.beginPath(); context.moveTo(bottom.x, bottom.y); context.lineTo(top.x, top.y); context.stroke();
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

      const faces: (Face & { active: boolean })[] = [];
      const faceDefs = [
        { corners: [[0,0,0],[1,0,0],[1,1,0],[0,1,0]], shade: -24 },
        { corners: [[0,0,1],[0,1,1],[1,1,1],[1,0,1]], shade: -10 },
        { corners: [[0,0,0],[0,1,0],[0,1,1],[0,0,1]], shade: -34 },
        { corners: [[1,0,0],[1,0,1],[1,1,1],[1,1,0]], shade: -18 },
        { corners: [[0,1,0],[1,1,0],[1,1,1],[0,1,1]], shade: 28 },
        { corners: [[0,0,0],[0,0,1],[1,0,1],[1,0,0]], shade: -40 },
      ] as const;
      const cubeOffset = current.mode === "core" ? -0.5 : 0;
      [...current.settled, ...displayedActive].forEach((cube) => {
        faceDefs.forEach((face) => {
          const points = face.corners.map(([x, y, z]) => project(cube.x + x + cubeOffset, cube.y + y + cubeOffset, cube.z + z + cubeOffset));
          faces.push({
            points,
            depth: points.reduce((sum, point) => sum + point.depth, 0) / points.length,
            color: shade(cube.color, face.shade),
            active: displayedActive.includes(cube),
          });
        });
      });
      faces.sort((a, b) => a.depth - b.depth).forEach((face) => {
        context.beginPath();
        face.points.forEach((point, index) => index ? context.lineTo(point.x, point.y) : context.moveTo(point.x, point.y));
        context.closePath();
        context.fillStyle = face.color;
        context.fill();
        context.lineWidth = face.active ? 1.8 : 0.7;
        context.strokeStyle = face.active ? "rgba(255,255,255,.85)" : "rgba(255,255,255,.19)";
        context.stroke();
      });

      // The exact same landing calculation is used by Drop and its preview.
      if (!current.gameOver) {
        context.save();
        context.lineWidth = 2;
        context.setLineDash([4, 3]);
        context.strokeStyle = "#e2ff81";
        context.fillStyle = "rgba(215,255,86,.18)";
        landing.cubes.forEach((cube) => {
          const points = [[0, 1.025, 0], [1, 1.025, 0], [1, 1.025, 1], [0, 1.025, 1]]
            .map(([x, y, z]) => project(cube.x + x + cubeOffset, cube.y + y + cubeOffset, cube.z + z + cubeOffset));
          context.beginPath();
          points.forEach((point, index) => index ? context.lineTo(point.x, point.y) : context.moveTo(point.x, point.y));
          context.closePath(); context.fill(); context.stroke();
        });
        context.restore();
      }

      frame = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(frame);
  }, [smoothing]);

  const togglePause = () => setGame((current) => (current.gameOver ? current : { ...current, paused: !current.paused }));
  const openMenu = (next: "new" | "help") => {
    setChosenMode(game.mode);
    setChosenPace(game.pace);
    setGame((current) => (current.gameOver ? current : { ...current, paused: true }));
    setMenu(next);
  };
  const chooseView = (name: string) => {
    setFixedView(name);
    if (motionStatus === "active") setMotionStatus("starting");
    const angles: Record<string, [number, number]> = { "3D": [DEFAULT_PITCH, -DEFAULT_YAW], Top: [HALF_PI, 0], Front: [0, 0], Side: [0, HALF_PI] };
    const [pitch, yaw] = angles[name];
    const orientation = quaternionConjugate(quaternionMultiply(quaternionFromAxisAngle("x", pitch), quaternionFromAxisAngle("y", yaw)));
    camera.current.targetOrientation = orientation;
  };
  const startRound = () => {
    setGame(initialGame(chosenMode, chosenPace));
    setMenu(null);
    chooseView("3D");
  };
  const continueGame = () => { setMenu(null); setGame((current) => ({ ...current, paused: false })); };
  const controlsDisabled = game.paused || game.gameOver;
  const firstPuzzle = game.mode === "tower" && game.pace === "relaxed" && game.pieces === 0;
  const clearLabel = game.mode === "patch" ? "patches" : "layers";
  const goal = game.mode === "core" ? "Pack blocks around the glowing center." : game.mode === "patch" ? "Fill any 3 × 3 square to clear it." : "Fill a whole floor to clear a layer.";
  const stepText = firstPuzzle ? "Aim for the gap. Undo is here if you miss." : game.pace === "relaxed" ? "Take your time. The block waits for you." : "Blocks fall slowly. Find a spot before they land.";

  return (
    <main className={`game-shell ${game.mode === "core" ? "core-mode" : game.mode === "patch" ? "patch-mode" : ""}`}>
      <header className="topbar">
        <div className="brand"><span className="brand-mark">3D</span><h1>3D BLOCKS</h1></div>
        <div className="header-actions">
          <button onClick={() => openMenu("help")} disabled={menu !== null} aria-label="How to play">?</button>
          <button onClick={togglePause} disabled={menu !== null || game.gameOver} aria-label={game.paused ? "Resume" : "Pause"}>{game.paused ? "▶" : "Ⅱ"}</button>
        </div>
      </header>
      <div className="round-bar"><span><i />{game.pace === "relaxed" ? "Relaxed" : "Challenge"} · {game.mode === "tower" ? "Tower" : game.mode === "patch" ? "Patch" : "Core"}</span><button onClick={() => openMenu("new")} disabled={menu !== null}>New game</button></div>

      <section className="game-card" aria-label="Game">
        <div className="score-row">
          <div><small>Score</small><strong>{game.score.toLocaleString()}</strong></div>
          <div><small>{game.mode === "core" ? "Packed" : "Cleared"}</small><strong>{game.mode === "core" ? game.pieces : game.layers}<em> {game.mode === "core" ? (game.pieces === 1 ? "piece" : "pieces") : (game.layers === 1 ? clearLabel.slice(0, -1) : clearLabel)}</em></strong></div>
          <div className="next-block"><small>Next</small><NextPiece piece={game.next} /></div>
        </div>
        <div className="play-stage">
          <div className="tablet-stick move-stick"><strong>Move</strong>
            <button type="button" disabled={controlsDisabled} aria-label="Move the active piece relative to the view"
              onPointerDown={(event) => startJoystick("move", event)} onPointerMove={(event) => moveJoystick("move", event)}
              onPointerUp={(event) => stopJoystick("move", event.pointerId)} onPointerCancel={(event) => stopJoystick("move", event.pointerId)}
              onLostPointerCapture={(event) => stopJoystick("move", event.pointerId)} onKeyDown={(event) => onJoystickKeyDown("move", event)}>
              <i style={{ transform: `translate(-50%, -50%) translate(${joystickPosition.move.x * 34}px, ${joystickPosition.move.y * 34}px)` }} />
            </button><small>Follow the view</small>
          </div>
          <div className={`canvas-wrap ${game.layers > 0 && game.message.includes("!") ? "has-clear" : ""}`}>
            <canvas ref={canvasRef} onPointerDown={onPointerDown} onPointerMove={onPointerMove}
              onPointerUp={(event) => finishGesture(event)} onPointerCancel={(event) => finishGesture(event, true)}
              onLostPointerCapture={(event) => finishGesture(event, true)}
              aria-label="3D Blocks play area. Drag to move, tap to turn. The green outline shows where the block will land."
              aria-describedby={boardHelpId} />
            <span className="landing-key"><i /> Landing spot</span>
            <div className="board-message" key={`${game.mode}-${game.pieces}-${game.layers}`} role="status" aria-live="polite">
              <strong>{game.pieces === 0 ? goal : game.message}</strong><span>{stepText}</span>
            </div>
            {(menu || game.paused || game.gameOver) && (
              <div ref={dialogRef} className="overlay" role="dialog" aria-modal="true" aria-label={menu === "welcome" ? "Welcome to 3D Blocks" : menu === "new" ? "New game" : menu === "help" ? "How to play" : game.gameOver ? "Round finished" : "Paused"}>
                {menu === "welcome" ? <>
                  <span className="eyebrow">A little puzzle. A little victory.</span>
                  <h2>One block.<br />Your first clear.</h2>
                  <p>We left a gap for you. Fit the bright block into it and watch the floor disappear.</p>
                  <span className="calm-note">No timer. You can undo a move.</span>
                  <button className="primary" onClick={startRound}>Let’s play <span>→</span></button>
                  <button className="text-button" onClick={() => setMenu("new")}>Choose a different mode</button>
                </> : menu === "new" ? <>
                  <h2>Make it your game.</h2>
                  <fieldset><legend>Pace</legend><div className="choice-row">
                    <button aria-pressed={chosenPace === "relaxed"} onClick={() => setChosenPace("relaxed")}><strong>Relaxed</strong><small>No timer · Undo</small></button>
                    <button aria-pressed={chosenPace === "challenge"} onClick={() => setChosenPace("challenge")}><strong>Challenge</strong><small>Falling blocks</small></button>
                  </div></fieldset>
                  <fieldset><legend>Playground</legend><div className="choice-row modes">
                    <button aria-pressed={chosenMode === "tower"} onClick={() => setChosenMode("tower")}><strong>Tower</strong><small>Fill a floor</small></button>
                    <button aria-pressed={chosenMode === "patch"} onClick={() => setChosenMode("patch")}><strong>Patch</strong><small>Clear 3 × 3</small></button>
                    <button aria-pressed={chosenMode === "core"} onClick={() => setChosenMode("core")}><strong>Core</strong><small>Pack a sphere</small></button>
                  </div></fieldset>
                  <button className="primary" onClick={startRound}>Start new game →</button>
                  <button className="text-button" onClick={continueGame}>Back to this game</button>
                </> : menu === "help" ? <>
                  <h2>Aim. Turn. Drop.</h2><p>{goal}</p>
                  <ol><li>Move with the arrows or drag the block.</li><li>Turn it to fit. Green outlines show its landing spot.</li><li>Press <b>Drop</b> when you’re happy.</li></ol>
                  <p className="keyboard-guide">Keyboard: arrows / WASD move · R turns · Space drops · U undoes · P pauses. X / Y / Z tumble.</p>
                  <button className="primary" onClick={continueGame}>Got it. Let’s play →</button>
                </> : game.gameOver ? <>
                  <span className="eyebrow">Nice playing!</span><h2>Room for another try.</h2>
                  <p>{game.score.toLocaleString()} points · {game.mode === "core" ? `${game.pieces} pieces packed` : `${game.layers} ${clearLabel} cleared`}</p>
                  {game.pace === "relaxed" && game.undo && <button className="primary" onClick={undo}>Undo the last block ↶</button>}
                  <button className={game.pace === "relaxed" && game.undo ? "text-button" : "primary"} onClick={startRound}>Play again →</button>
                </> : <><span className="eyebrow">Take a breather</span><h2>We’ll wait here.</h2><button className="primary" onClick={togglePause}>Keep playing →</button></>}
              </div>
            )}
          </div>
          <div className="tablet-stick action-stick"><strong>Turn / Height</strong>
            <button type="button" disabled={controlsDisabled} aria-label="Turn the active piece left or right, or move it up and down"
              onPointerDown={(event) => startJoystick("action", event)} onPointerMove={(event) => moveJoystick("action", event)}
              onPointerUp={(event) => stopJoystick("action", event.pointerId)} onPointerCancel={(event) => stopJoystick("action", event.pointerId)}
              onLostPointerCapture={(event) => stopJoystick("action", event.pointerId)} onKeyDown={(event) => onJoystickKeyDown("action", event)}>
              <i style={{ transform: `translate(-50%, -50%) translate(${joystickPosition.action.x * 34}px, ${joystickPosition.action.y * 34}px)` }} />
            </button><small>Push left or right</small>
          </div>
        </div>
        <nav className="view-controls" aria-label="Camera view"><span>View</span>{["3D", "Top", "Front", "Side"].map((name) => <button key={name} disabled={menu !== null} aria-pressed={fixedView === name && motionStatus !== "active"} onClick={() => chooseView(name)}>{name}</button>)}</nav>
        {game.mode === "core" && <p className="core-stats">Radius <b>{game.radius.toFixed(1)}</b> · Density <b>{Math.round(game.density * 100)}%</b></p>}
        <div className="game-controls">
          <div className="move-pad" aria-label="Move block">
            <button className="move-up" disabled={controlsDisabled} aria-label="Move up in view" onClick={() => moveFromScreenVector(0, -1)}>↑</button>
            <button className="move-left" disabled={controlsDisabled} aria-label="Move left in view" onClick={() => moveFromScreenVector(-1, 0)}>←</button>
            <span aria-hidden="true">Move</span>
            <button className="move-right" disabled={controlsDisabled} aria-label="Move right in view" onClick={() => moveFromScreenVector(1, 0)}>→</button>
            <button className="move-down" disabled={controlsDisabled} aria-label="Move down in view" onClick={() => moveFromScreenVector(0, 1)}>↓</button>
          </div>
          <div className="action-pad">
            <button disabled={controlsDisabled} onClick={() => rotatePiece("y")} aria-label="Turn block"><b>↻</b> Turn <kbd>R</kbd></button>
            <button className="drop-button" disabled={controlsDisabled} onClick={hardDrop}><b>↓</b> {game.mode === "core" ? "Pull" : "Drop"} <kbd>Space</kbd></button>
          </div>
          <div className="secondary-controls">
            {game.pace === "relaxed" && <button disabled={!game.undo || game.paused} onClick={undo}>↶ Undo <kbd>U</kbd></button>}
            <button disabled={controlsDisabled} onClick={() => rotatePiece("x")}>Tumble ↗</button>
            <span>Best here <b>{best.toLocaleString()}</b></span>
          </div>
        </div>
      </section>
      <p className="board-help" id={boardHelpId}>Drag to move · Tap to turn · Use Drop to place</p>
      <details className="advanced" onToggle={(event) => { if (event.currentTarget.open) setGame((current) => (current.gameOver ? current : { ...current, paused: true })); }}>
        <summary>Camera & motion settings</summary>
        <div className="motion-bar"><div><strong>Tilt camera</strong><p>{motionStatus === "active" ? "Move your device to look around." : "Optional. The view stays still until you enable motion."}</p></div>
          {motionStatus === "active" ? <><button onClick={() => { setMotionStatus("starting"); recenter(); }}>Turn off</button><button onClick={recenter}>Recenter</button></> : <button disabled={motionStatus === "unsupported"} onClick={enableMotion}>{motionStatus === "unsupported" ? "Unavailable" : "Enable tilt"}</button>}
        </div>
        <div className="choice-row"><button aria-pressed={viewMode === "orbit"} onClick={() => selectViewMode("orbit")}>Orbit · front / top / side</button><button aria-pressed={viewMode === "spatial"} onClick={() => selectViewMode("spatial")}>Spatial · full sphere</button></div>
        <button className="text-button" onClick={() => setSettingsOpen((open) => !open)} aria-expanded={settingsOpen}>Sensitivity</button>
        {settingsOpen && <div className="motion-settings">
          <label>Orbit multiplier <b>{multiplier.toFixed(1)}×</b><input type="range" min="0.2" max="5" step="0.1" value={multiplier} disabled={viewMode === "spatial"} onChange={(event) => setMultiplier(Number(event.target.value))} /></label>
          <label>Smoothing <b>{Math.round(smoothing * 100)}%</b><input type="range" min="0.06" max="0.42" step="0.02" value={smoothing} onChange={(event) => setSmoothing(Number(event.target.value))} /></label>
          {motionStatus === "denied" && <p>Motion access was blocked. You can still use all four view buttons.</p>}
        </div>}
      </details>
      <a className="wofi-badge" href="https://wofi.ai/ideas/sha256%3Ac472014b92b2e4c50702ad044544f964707a78157100c5e79ce161bc01eca510" target="_blank" rel="noreferrer" aria-label="View the Wofi Idea behind 3D Blocks"><Image src="/wofi-logo.svg" width={22} height={22} alt="" /><span>THIS IS A WOFI IDEA</span></a>
    </main>
  );
}

function NextPiece({ piece }: { piece: Piece }) {
  const minX = Math.min(...piece.cubes.map((cube) => cube.x));
  const minY = Math.min(...piece.cubes.map((cube) => cube.y));
  const minZ = Math.min(...piece.cubes.map((cube) => cube.z));
  const cubes = piece.cubes.map((cube) => ({ x: cube.x - minX, y: cube.y - minY, z: cube.z - minZ }));
  const project = (x: number, y: number, z: number) => [(x - z) * 12, (x + z) * 6 - y * 13];
  const faces = [ [[0,1,0],[1,1,0],[1,1,1],[0,1,1]], [[0,0,1],[0,1,1],[1,1,1],[1,0,1]], [[1,0,0],[1,0,1],[1,1,1],[1,1,0]] ];
  const polygons = cubes.sort((a, b) => (a.x + a.z) - (b.x + b.z) || a.y - b.y).flatMap((cube) => faces.map((corners, index) => ({ points: corners.map(([x,y,z]) => project(cube.x+x,cube.y+y,cube.z+z)), color: shade(piece.color, [25,-12,-30][index]) })));
  const all = polygons.flatMap((face) => face.points);
  const minPx = Math.min(...all.map(([x]) => x)) - 3;
  const minPy = Math.min(...all.map(([,y]) => y)) - 3;
  const width = Math.max(...all.map(([x]) => x)) - minPx + 3;
  const height = Math.max(...all.map(([,y]) => y)) - minPy + 3;
  return <svg role="img" aria-label={`Next piece: ${piece.cubes.length} cubes`} viewBox={`${minPx} ${minPy} ${width} ${height}`} data-shape={piece.shapeIndex}>{polygons.map((face, index) => <polygon key={index} points={face.points.map((point) => point.join(",")).join(" ")} fill={face.color} stroke="rgba(255,255,255,.5)" strokeWidth=".6" />)}</svg>;
}
