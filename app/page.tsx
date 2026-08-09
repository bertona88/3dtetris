"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Cube = { x: number; y: number; z: number; color: string };
type Piece = { cubes: Cube[]; color: string };
type Game = {
  settled: Cube[];
  active: Piece;
  next: Piece;
  score: number;
  layers: number;
  paused: boolean;
  gameOver: boolean;
};
type MotionStatus = "starting" | "active" | "unsupported" | "denied";
type OrientationSample = { beta: number; gamma: number };
type Projected = { x: number; y: number; depth: number };
type Face = { points: Projected[]; depth: number; color: string };
type Camera = { yaw: number; pitch: number; targetYaw: number; targetPitch: number };
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
const SHAPES: Array<Array<[number, number, number]>> = [
  [[0, 0, 0], [1, 0, 0], [0, 0, 1], [1, 0, 1]],
  [[0, 0, 0], [1, 0, 0], [2, 0, 0], [1, 1, 0]],
  [[0, 0, 0], [0, 1, 0], [0, 0, 1], [1, 0, 1]],
  [[0, 0, 0], [1, 0, 0], [2, 0, 0], [2, 0, 1]],
  [[0, 0, 0], [1, 0, 0], [1, 1, 0], [1, 1, 1]],
];

const cubeKey = ({ x, y, z }: Pick<Cube, "x" | "y" | "z">) => `${x},${y},${z}`;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

function makePiece(seed = Math.floor(Math.random() * SHAPES.length)): Piece {
  const offsets = SHAPES[seed % SHAPES.length];
  const color = COLORS[seed % COLORS.length];
  const highestOffset = Math.max(...offsets.map(([, y]) => y));
  return {
    color,
    cubes: offsets.map(([x, y, z]) => ({
      x: x + 1,
      y: y + HEIGHT - 1 - highestOffset,
      z: z + 1,
      color,
    })),
  };
}

function initialGame(): Game {
  return {
    settled: [
      { x: 0, y: 0, z: 0, color: "#7b8cff" },
      { x: 1, y: 0, z: 0, color: "#7b8cff" },
      { x: 1, y: 0, z: 1, color: "#7b8cff" },
      { x: 2, y: 0, z: 1, color: "#65e6b4" },
      { x: 3, y: 0, z: 1, color: "#65e6b4" },
      { x: 3, y: 0, z: 2, color: "#65e6b4" },
    ],
    active: makePiece(0),
    next: makePiece(3),
    score: 120,
    layers: 0,
    paused: false,
    gameOver: false,
  };
}

function isValid(cubes: Cube[], settled: Cube[]) {
  const occupied = new Set(settled.map(cubeKey));
  return cubes.every((cube) =>
    cube.x >= 0 && cube.x < BOARD &&
    cube.z >= 0 && cube.z < BOARD &&
    cube.y >= 0 && cube.y < HEIGHT &&
    !occupied.has(cubeKey(cube))
  );
}

function lockAndSpawn(game: Game, piece: Piece): Game {
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
  const next = makePiece();
  return {
    ...game,
    settled: remaining,
    active: incoming,
    next,
    score: game.score + (fullLayers.length ? fullLayers.length * 500 : 20),
    layers: game.layers + fullLayers.length,
    gameOver: !isValid(incoming.cubes, remaining),
  };
}

function shade(hex: string, amount: number) {
  const value = parseInt(hex.slice(1), 16);
  const channel = (shift: number) => clamp(((value >> shift) & 255) + amount, 0, 255);
  return `rgb(${channel(16)}, ${channel(8)}, ${channel(0)})`;
}

function projectPoint(x: number, y: number, z: number, width: number, height: number, camera: Camera): Projected {
  const scale = Math.min(width / 9.2, height / 14.5);
  const centeredX = x - BOARD / 2;
  const centeredY = y - HEIGHT / 2;
  const centeredZ = z - BOARD / 2;
  const cosYaw = Math.cos(camera.yaw);
  const sinYaw = Math.sin(camera.yaw);
  const yawX = centeredX * cosYaw - centeredZ * sinYaw;
  const yawZ = centeredX * sinYaw + centeredZ * cosYaw;
  const cosPitch = Math.cos(camera.pitch);
  const sinPitch = Math.sin(camera.pitch);
  const pitchY = centeredY * cosPitch - yawZ * sinPitch;
  const pitchZ = centeredY * sinPitch + yawZ * cosPitch;
  const perspective = 12 / (12 - pitchZ * 0.25);
  return {
    x: width / 2 + yawX * scale * perspective,
    y: height * 0.53 - pitchY * scale * perspective,
    depth: pitchZ,
  };
}

export default function Home() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [game, setGame] = useState<Game>(initialGame);
  const gameRef = useRef(game);
  const [motionStatus, setMotionStatus] = useState<MotionStatus>("starting");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [xMultiplier, setXMultiplier] = useState(1);
  const [yMultiplier, setYMultiplier] = useState(0.8);
  const [smoothing, setSmoothing] = useState(0.18);
  const settingsReady = useRef(false);
  const baseline = useRef<OrientationSample | null>(null);
  const latestSample = useRef<OrientationSample | null>(null);
  const camera = useRef<Camera>({ yaw: -0.62, pitch: 0.38, targetYaw: -0.62, targetPitch: 0.38 });
  const gesture = useRef<Gesture | null>(null);

  useEffect(() => { gameRef.current = game; }, [game]);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      try {
        const saved = JSON.parse(localStorage.getItem("tilt-tetris-motion") ?? "null");
        if (typeof saved?.xMultiplier === "number") setXMultiplier(saved.xMultiplier);
        if (typeof saved?.yMultiplier === "number") setYMultiplier(saved.yMultiplier);
        if (typeof saved?.smoothing === "number") setSmoothing(saved.smoothing);
      } catch { /* Ignore damaged local settings. */ }
      settingsReady.current = true;
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (!settingsReady.current) return;
    localStorage.setItem("tilt-tetris-motion", JSON.stringify({ xMultiplier, yMultiplier, smoothing }));
  }, [smoothing, xMultiplier, yMultiplier]);

  const recenter = useCallback(() => {
    baseline.current = latestSample.current;
    camera.current.targetYaw = -0.62;
    camera.current.targetPitch = 0.38;
  }, []);

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

  useEffect(() => {
    if (motionStatus !== "active") return;
    const onOrientation = (event: DeviceOrientationEvent) => {
      if (event.beta == null || event.gamma == null) return;
      const sample = { beta: event.beta, gamma: event.gamma };
      latestSample.current = sample;
      baseline.current ??= sample;
      const origin = baseline.current;
      camera.current.targetYaw = -0.62 + clamp((sample.gamma - origin.gamma) * 0.018 * xMultiplier, -1.25, 1.25);
      camera.current.targetPitch = 0.38 + clamp((sample.beta - origin.beta) * 0.014 * yMultiplier, -0.7, 0.7);
    };
    window.addEventListener("deviceorientation", onOrientation, true);
    return () => window.removeEventListener("deviceorientation", onOrientation, true);
  }, [motionStatus, xMultiplier, yMultiplier]);

  const activateMotion = useCallback(async () => {
    if (motionStatus === "active" || motionStatus === "unsupported") return;
    if (!("DeviceOrientationEvent" in window)) {
      setMotionStatus("unsupported");
      return;
    }
    type PermissionOrientationEvent = typeof DeviceOrientationEvent & {
      requestPermission?: () => Promise<"granted" | "denied">;
    };
    try {
      const OrientationEvent = DeviceOrientationEvent as PermissionOrientationEvent;
      const permission = OrientationEvent.requestPermission
        ? await OrientationEvent.requestPermission()
        : "granted";
      if (permission !== "granted") {
        setMotionStatus("denied");
        return;
      }
      baseline.current = null;
      setMotionStatus("active");
    } catch {
      setMotionStatus("denied");
    }
  }, [motionStatus]);

  const move = useCallback((dx: number, dz: number) => {
    setGame((current) => {
      if (current.paused || current.gameOver) return current;
      const cubes = current.active.cubes.map((cube) => ({ ...cube, x: cube.x + dx, z: cube.z + dz }));
      return isValid(cubes, current.settled) ? { ...current, active: { ...current.active, cubes } } : current;
    });
  }, []);

  const rotatePiece = useCallback(() => {
    setGame((current) => {
      if (current.paused || current.gameOver) return current;
      const pivot = current.active.cubes[0];
      const cubes = current.active.cubes.map((cube) => ({
        ...cube,
        x: pivot.x - (cube.z - pivot.z),
        z: pivot.z + (cube.x - pivot.x),
      }));
      return isValid(cubes, current.settled) ? { ...current, active: { ...current.active, cubes } } : current;
    });
  }, []);

  const moveFromScreenVector = useCallback((screenX: number, screenY: number) => {
    const canvas = canvasRef.current;
    const current = gameRef.current;
    if (!canvas || current.paused || current.gameOver) return;
    const rect = canvas.getBoundingClientRect();
    const center = current.active.cubes.reduce((sum, cube) => ({
      x: sum.x + (cube.x + 0.5) / current.active.cubes.length,
      y: sum.y + (cube.y + 0.5) / current.active.cubes.length,
      z: sum.z + (cube.z + 0.5) / current.active.cubes.length,
    }), { x: 0, y: 0, z: 0 });
    const origin = projectPoint(center.x, center.y, center.z, rect.width, rect.height, camera.current);
    const length = Math.hypot(screenX, screenY) || 1;
    const candidates = [
      { dx: 1, dz: 0 },
      { dx: -1, dz: 0 },
      { dx: 0, dz: 1 },
      { dx: 0, dz: -1 },
    ].map((candidate) => {
      const target = projectPoint(center.x + candidate.dx, center.y, center.z + candidate.dz, rect.width, rect.height, camera.current);
      const axisX = target.x - origin.x;
      const axisY = target.y - origin.y;
      const axisLength = Math.hypot(axisX, axisY) || 1;
      return {
        ...candidate,
        score: (screenX * axisX + screenY * axisY) / (length * axisLength),
      };
    });
    const best = candidates.sort((a, b) => b.score - a.score)[0];
    move(best.dx, best.dz);
  }, [move]);

  const onPointerDown = useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    void activateMotion();
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
  }, [activateMotion]);

  const onPointerMove = useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
    const current = gesture.current;
    if (!current || current.pointerId !== event.pointerId) return;
    const dx = event.clientX - current.lastX;
    const dy = event.clientY - current.lastY;
    const delta = Math.hypot(dx, dy);
    current.distance = Math.max(current.distance, Math.hypot(event.clientX - current.startX, event.clientY - current.startY));
    if (delta >= 34) {
      const steps = Math.min(3, Math.floor(delta / 34));
      for (let step = 0; step < steps; step += 1) moveFromScreenVector(dx, dy);
      current.lastX = event.clientX;
      current.lastY = event.clientY;
    }
  }, [moveFromScreenVector]);

  const finishGesture = useCallback((event: React.PointerEvent<HTMLCanvasElement>, cancelled = false) => {
    const current = gesture.current;
    if (!current || current.pointerId !== event.pointerId) return;
    gesture.current = null;
    if (!cancelled && current.distance < 14 && performance.now() - current.startedAt < 420) rotatePiece();
  }, [rotatePiece]);

  const hardDrop = useCallback(() => {
    setGame((current) => {
      if (current.paused || current.gameOver) return current;
      let cubes = current.active.cubes;
      while (isValid(cubes.map((cube) => ({ ...cube, y: cube.y - 1 })), current.settled)) {
        cubes = cubes.map((cube) => ({ ...cube, y: cube.y - 1 }));
      }
      return lockAndSpawn(current, { ...current.active, cubes });
    });
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setGame((current) => {
        if (current.paused || current.gameOver) return current;
        const cubes = current.active.cubes.map((cube) => ({ ...cube, y: cube.y - 1 }));
        return isValid(cubes, current.settled)
          ? { ...current, active: { ...current.active, cubes } }
          : lockAndSpawn(current, current.active);
      });
    }, 780);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "ArrowLeft") move(-1, 0);
      if (event.key === "ArrowRight") move(1, 0);
      if (event.key === "ArrowUp") move(0, -1);
      if (event.key === "ArrowDown") move(0, 1);
      if (event.key.toLowerCase() === "r") rotatePiece();
      if (event.code === "Space") { event.preventDefault(); hardDrop(); }
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
      motion.yaw += (motion.targetYaw - motion.yaw) * smoothing;
      motion.pitch += (motion.targetPitch - motion.pitch) * smoothing;
      const project = (x: number, y: number, z: number): Projected => {
        return projectPoint(x, y, z, width, height, motion);
      };

      context.lineWidth = 1;
      context.strokeStyle = "rgba(255,255,255,.10)";
      for (let i = 0; i <= BOARD; i += 1) {
        const a = project(i, 0, 0);
        const b = project(i, 0, BOARD);
        const c = project(0, 0, i);
        const d = project(BOARD, 0, i);
        context.beginPath(); context.moveTo(a.x, a.y); context.lineTo(b.x, b.y); context.stroke();
        context.beginPath(); context.moveTo(c.x, c.y); context.lineTo(d.x, d.y); context.stroke();
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
      [...gameRef.current.settled, ...gameRef.current.active.cubes].forEach((cube) => {
        faceDefs.forEach((face) => {
          const points = face.corners.map(([x, y, z]) => project(cube.x + x, cube.y + y, cube.z + z));
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
  const restart = () => setGame(initialGame());
  const level = Math.floor(game.layers / 3) + 1;

  return (
    <main className="game-shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">T³</span>
          <div><strong>TILT TETRIS</strong><small>GESTURE EDITION</small></div>
        </div>
        <button className="icon-btn" onClick={togglePause} aria-label={game.paused ? "Resume" : "Pause"}>{game.paused ? "▶" : "Ⅱ"}</button>
      </header>

      <section className="motion-bar" aria-label="Motion camera status">
        <div className="motion-copy">
          <span className={`status-dot ${motionStatus}`} />
          <div>
            <strong>{motionStatus === "active" ? "CAMERA LIVE" : motionStatus === "starting" ? "MOTION READY" : "MOTION OFF"}</strong>
            <small>{motionStatus === "active" ? "Tilt your phone — the controls follow the view" : motionStatus === "starting" ? "Touch the playfield once to connect motion" : motionStatus === "denied" ? "Allow motion in browser settings, then tap" : "Motion sensors are unavailable"}</small>
          </div>
        </div>
        <button className="settings-toggle" onClick={() => setSettingsOpen((open) => !open)} aria-expanded={settingsOpen} aria-label="Motion settings">⚙</button>
      </section>

      {settingsOpen && (
        <section className="motion-settings" aria-label="Motion sensitivity settings">
          <label><span>Horizontal multiplier <b>{xMultiplier.toFixed(1)}×</b></span><input type="range" min="0.2" max="2.5" step="0.1" value={xMultiplier} onChange={(event) => setXMultiplier(Number(event.target.value))} /></label>
          <label><span>Vertical multiplier <b>{yMultiplier.toFixed(1)}×</b></span><input type="range" min="0.2" max="2.5" step="0.1" value={yMultiplier} onChange={(event) => setYMultiplier(Number(event.target.value))} /></label>
          <label><span>Smoothing <b>{Math.round(smoothing * 100)}%</b></span><input type="range" min="0.06" max="0.42" step="0.02" value={smoothing} onChange={(event) => setSmoothing(Number(event.target.value))} /></label>
          <button className="recenter" onClick={recenter}>RECENTER CAMERA</button>
          {(motionStatus === "unsupported" || motionStatus === "denied") && <p>{motionStatus === "unsupported" ? "Motion sensors are unavailable here. The game still works with a fixed view." : "Motion access was blocked. Allow motion access in your browser settings, then try again."}</p>}
        </section>
      )}

      <section className="game-card">
        <div className="score-row">
          <div><small>SCORE</small><strong>{game.score.toLocaleString()}</strong></div>
          <div><small>LEVEL</small><strong>{level}</strong></div>
          <div><small>LAYERS</small><strong>{game.layers}</strong></div>
        </div>

        <div className="canvas-wrap">
          <canvas
            ref={canvasRef}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={(event) => finishGesture(event)}
            onPointerCancel={(event) => finishGesture(event, true)}
            aria-label="3D Tetris board. Swipe anywhere to move the active piece. Tap to rotate it. Camera rotation follows device tilt."
            aria-describedby="gesture-help"
          />
          <div className="axis-chip">LIVE 3D</div>
          <div className="gesture-help" id="gesture-help"><span>SWIPE</span> MOVE <i /> <span>TAP</span> ROTATE</div>
          {(game.paused || game.gameOver) && (
            <div className="overlay">
              <strong>{game.gameOver ? "TOWER FULL" : "PAUSED"}</strong>
              <button onClick={game.gameOver ? restart : togglePause}>{game.gameOver ? "PLAY AGAIN" : "CONTINUE"}</button>
            </div>
          )}
        </div>

      </section>

      <footer>
        <span>NEXT</span>
        <div className="next-piece" aria-hidden="true">{game.next.cubes.map((_, index) => <i key={index} style={{ background: game.next.color }} />)}</div>
        <button onClick={restart}>NEW GAME</button>
      </footer>
    </main>
  );
}
