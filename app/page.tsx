"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type View = "FRONTE" | "ALTO" | "LATO";
type Cube = { x: number; y: number; z: number; color: string };
type Shape = { cubes: Cube[]; color: string };

const SIZE = 5;
const HEIGHT = 9;
const CELL = 42;
const COLORS = ["#ff5b79", "#ffc24b", "#65e6b4", "#7b8cff", "#e982ff"];

const SHAPES: Array<Array<[number, number, number]>> = [
  [[0, 0, 0], [1, 0, 0], [0, 0, 1], [1, 0, 1]],
  [[0, 0, 0], [1, 0, 0], [2, 0, 0], [1, 1, 0]],
  [[0, 0, 0], [0, 1, 0], [0, 0, 1], [1, 0, 1]],
  [[0, 0, 0], [1, 0, 0], [2, 0, 0], [2, 0, 1]],
  [[0, 0, 0], [1, 0, 0], [1, 1, 0], [1, 1, 1]],
];

const key = (c: Pick<Cube, "x" | "y" | "z">) => `${c.x},${c.y},${c.z}`;

function makeShape(seed = Math.floor(Math.random() * SHAPES.length)): Shape {
  const color = COLORS[seed % COLORS.length];
  return {
    color,
    cubes: SHAPES[seed].map(([x, y, z]) => ({ x: x + 1, y: y + HEIGHT, z: z + 1, color })),
  };
}

function shade(hex: string, amount: number) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.max(0, Math.min(255, (n >> 16) + amount));
  const g = Math.max(0, Math.min(255, ((n >> 8) & 255) + amount));
  const b = Math.max(0, Math.min(255, (n & 255) + amount));
  return `rgb(${r},${g},${b})`;
}

export default function Home() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [view, setView] = useState<View>("FRONTE");
  const [settled, setSettled] = useState<Cube[]>([
    { x: 0, y: 0, z: 0, color: "#7b8cff" }, { x: 1, y: 0, z: 0, color: "#7b8cff" },
    { x: 1, y: 0, z: 1, color: "#7b8cff" }, { x: 2, y: 0, z: 1, color: "#65e6b4" },
    { x: 3, y: 0, z: 1, color: "#65e6b4" }, { x: 3, y: 0, z: 2, color: "#65e6b4" },
  ]);
  const [active, setActive] = useState<Shape>(() => makeShape(0));
  const [next, setNext] = useState<Shape>(() => makeShape(3));
  const [score, setScore] = useState(120);
  const [layers, setLayers] = useState(0);
  const [paused, setPaused] = useState(false);
  const [gameOver, setGameOver] = useState(false);
  const gesture = useRef<{ x: number; y: number; lastX: number; lastY: number; drag: boolean } | null>(null);

  const occupied = useMemo(() => new Set(settled.map(key)), [settled]);

  const valid = useCallback((cubes: Cube[]) => cubes.every(c =>
    c.x >= 0 && c.x < SIZE && c.z >= 0 && c.z < SIZE && c.y >= 0 && !occupied.has(key(c))
  ), [occupied]);

  const spawn = useCallback(() => {
    const incoming = next.cubes.map(c => ({ ...c, y: c.y - 1 }));
    setActive({ ...next, cubes: incoming });
    setNext(makeShape());
    if (!valid(incoming)) setGameOver(true);
  }, [next, valid]);

  const lock = useCallback((shape: Shape) => {
    const merged = [...settled, ...shape.cubes];
    const full: number[] = [];
    for (let y = 0; y < HEIGHT; y++) {
      if (merged.filter(c => c.y === y).length >= SIZE * SIZE) full.push(y);
    }
    const cleared = merged
      .filter(c => !full.includes(c.y))
      .map(c => ({ ...c, y: c.y - full.filter(v => v < c.y).length }));
    setSettled(cleared);
    if (full.length) {
      setLayers(v => v + full.length);
      setScore(v => v + full.length * 500);
    } else setScore(v => v + 20);
    spawn();
  }, [settled, spawn]);

  const dropOne = useCallback(() => {
    if (paused || gameOver) return;
    const moved = active.cubes.map(c => ({ ...c, y: c.y - 1 }));
    if (valid(moved)) setActive({ ...active, cubes: moved });
    else lock(active);
  }, [active, gameOver, lock, paused, valid]);

  useEffect(() => {
    const timer = window.setInterval(dropOne, 780);
    return () => window.clearInterval(timer);
  }, [dropOne]);

  const move = useCallback((dx: number, dz: number) => {
    setActive(shape => {
      const cubes = shape.cubes.map(c => ({ ...c, x: c.x + dx, z: c.z + dz }));
      return valid(cubes) ? { ...shape, cubes } : shape;
    });
  }, [valid]);

  const rotate = useCallback(() => {
    setActive(shape => {
      const pivot = shape.cubes[0];
      const cubes = shape.cubes.map(c => ({ ...c, x: pivot.x - (c.z - pivot.z), z: pivot.z + (c.x - pivot.x) }));
      return valid(cubes) ? { ...shape, cubes } : shape;
    });
  }, [valid]);

  const hardDrop = useCallback(() => {
    if (paused || gameOver) return;
    let cubes = active.cubes;
    while (valid(cubes.map(c => ({ ...c, y: c.y - 1 })))) cubes = cubes.map(c => ({ ...c, y: c.y - 1 }));
    lock({ ...active, cubes });
  }, [active, gameOver, lock, paused, valid]);

  const restart = () => {
    setSettled([]); setScore(0); setLayers(0); setGameOver(false); setPaused(false);
    setActive(makeShape(1)); setNext(makeShape(2));
  };

  const project = useCallback((c: Cube, width: number, height: number) => {
    if (view === "FRONTE") return { x: width / 2 + (c.x - 2) * CELL + c.z * 2.3, y: height - 44 - c.y * CELL - c.z * 2.3 };
    if (view === "LATO") return { x: width / 2 + (c.z - 2) * CELL + c.x * 2.3, y: height - 44 - c.y * CELL - c.x * 2.3 };
    return { x: width / 2 + (c.x - 2) * CELL + c.y * 2.3, y: height / 2 + (c.z - 2) * CELL - c.y * 2.3 };
  }, [view]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr; canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    const w = rect.width, h = rect.height;
    ctx.clearRect(0, 0, w, h);

    ctx.strokeStyle = "rgba(255,255,255,.09)";
    ctx.lineWidth = 1;
    const gridH = view === "ALTO" ? SIZE : HEIGHT;
    const gridW = SIZE;
    const ox = w / 2 - gridW * CELL / 2;
    const oy = view === "ALTO" ? h / 2 - SIZE * CELL / 2 : h - 44 - gridH * CELL;
    for (let i = 0; i <= gridW; i++) { ctx.beginPath(); ctx.moveTo(ox + i * CELL, oy); ctx.lineTo(ox + i * CELL, oy + gridH * CELL); ctx.stroke(); }
    for (let i = 0; i <= gridH; i++) { ctx.beginPath(); ctx.moveTo(ox, oy + i * CELL); ctx.lineTo(ox + gridW * CELL, oy + i * CELL); ctx.stroke(); }

    const cubes = [...settled, ...active.cubes].sort((a, b) => a.y - b.y || a.z - b.z || a.x - b.x);
    const depth = 9;
    cubes.forEach(c => {
      const p = project(c, w, h); const s = CELL - 4;
      ctx.fillStyle = shade(c.color, -32);
      ctx.beginPath(); ctx.moveTo(p.x + s / 2, p.y - s / 2); ctx.lineTo(p.x + s / 2 + depth, p.y - s / 2 - depth); ctx.lineTo(p.x + s / 2 + depth, p.y + s / 2 - depth); ctx.lineTo(p.x + s / 2, p.y + s / 2); ctx.closePath(); ctx.fill();
      ctx.fillStyle = shade(c.color, 28);
      ctx.beginPath(); ctx.moveTo(p.x - s / 2, p.y - s / 2); ctx.lineTo(p.x - s / 2 + depth, p.y - s / 2 - depth); ctx.lineTo(p.x + s / 2 + depth, p.y - s / 2 - depth); ctx.lineTo(p.x + s / 2, p.y - s / 2); ctx.closePath(); ctx.fill();
      ctx.fillStyle = c.color;
      ctx.fillRect(p.x - s / 2, p.y - s / 2, s, s);
      ctx.strokeStyle = "rgba(255,255,255,.42)"; ctx.strokeRect(p.x - s / 2 + .5, p.y - s / 2 + .5, s - 1, s - 1);
    });
  }, [active, project, settled, view]);

  const cycleView = (direction: number) => {
    const views: View[] = ["FRONTE", "ALTO", "LATO"];
    setView(v => views[(views.indexOf(v) + direction + views.length) % views.length]);
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    const rect = e.currentTarget.getBoundingClientRect();
    const centroid = active.cubes.reduce((a, c) => ({ x: a.x + c.x / active.cubes.length, y: a.y + c.y / active.cubes.length, z: a.z + c.z / active.cubes.length }), { x: 0, y: 0, z: 0 });
    const p = project({ ...centroid, color: active.color }, rect.width, rect.height);
    const drag = Math.hypot(e.clientX - rect.left - p.x, e.clientY - rect.top - p.y) < 86;
    gesture.current = { x: e.clientX, y: e.clientY, lastX: e.clientX, lastY: e.clientY, drag };
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const g = gesture.current; if (!g || !g.drag) return;
    const dx = e.clientX - g.lastX, dy = e.clientY - g.lastY;
    if (Math.abs(dx) > 28 || Math.abs(dy) > 28) {
      if (view === "ALTO") move(Math.abs(dx) > Math.abs(dy) ? Math.sign(dx) : 0, Math.abs(dy) >= Math.abs(dx) ? Math.sign(dy) : 0);
      else if (view === "FRONTE") move(Math.sign(dx), 0);
      else move(0, Math.sign(dx));
      g.lastX = e.clientX; g.lastY = e.clientY;
    }
  };

  const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const g = gesture.current; gesture.current = null; if (!g || g.drag) return;
    const dx = e.clientX - g.x, dy = e.clientY - g.y;
    if (Math.hypot(dx, dy) > 42) cycleView(dx + dy > 0 ? 1 : -1);
  };

  return (
    <main className="game-shell">
      <header className="topbar">
        <div className="brand"><span className="brand-mark">T³</span><div><strong>TETRIS³</strong><small>SWIPE EDITION</small></div></div>
        <button className="icon-btn" onClick={() => setPaused(v => !v)} aria-label={paused ? "Riprendi" : "Pausa"}>{paused ? "▶" : "Ⅱ"}</button>
      </header>

      <section className="game-card">
        <div className="score-row">
          <div><small>PUNTEGGIO</small><strong>{score.toLocaleString("it-IT")}</strong></div>
          <div><small>LIVELLO</small><strong>{Math.floor(layers / 3) + 1}</strong></div>
          <div><small>STRATI</small><strong>{layers}</strong></div>
        </div>

        <div className="view-tabs" role="tablist" aria-label="Proiezione">
          {(["FRONTE", "ALTO", "LATO"] as View[]).map(v => <button key={v} className={view === v ? "active" : ""} onClick={() => setView(v)}>{v}</button>)}
        </div>

        <div className="canvas-wrap">
          <canvas ref={canvasRef} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} aria-label={`Campo di gioco, vista ${view.toLowerCase()}`} />
          <div className="axis-chip">{view === "FRONTE" ? "X / Y" : view === "ALTO" ? "X / Z" : "Z / Y"}</div>
          {(paused || gameOver) && <div className="overlay"><strong>{gameOver ? "TORRE PIENA" : "IN PAUSA"}</strong><button onClick={gameOver ? restart : () => setPaused(false)}>{gameOver ? "RIPARTI" : "CONTINUA"}</button></div>}
        </div>

        <div className="hint"><span>↔</span><p><strong>Swipe sullo sfondo</strong><small>cambia proiezione</small></p><span className="divider" /><span>✥</span><p><strong>Trascina il pezzo</strong><small>spostalo nella griglia</small></p></div>

        <div className="controls">
          <button onClick={() => cycleView(-1)} aria-label="Vista precedente">←<small>VISTA</small></button>
          <button onClick={rotate} className="rotate" aria-label="Ruota blocco">↻<small>RUOTA</small></button>
          <button onClick={hardDrop} className="drop" aria-label="Lascia cadere">↓<small>LASCIA</small></button>
          <button onClick={() => cycleView(1)} aria-label="Vista successiva">→<small>VISTA</small></button>
        </div>
      </section>

      <footer><span>PROSSIMO</span><div className="next-piece">{next.cubes.map((_, i) => <i key={i} style={{ background: next.color }} />)}</div><button onClick={restart}>NUOVA PARTITA</button></footer>
    </main>
  );
}
