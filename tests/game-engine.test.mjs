import assert from 'node:assert/strict';
import test from 'node:test';
import {
  initialGame, dropGame, undoGame, advanceGame, landingPiece,
  translatePiece, isValidForGame, drawShape, fallInterval, screenMove,
  DEFAULT_CAMERA_ORIENTATION, quaternionConjugate, quaternionFromAxisAngle,
} from '../app/game-engine.ts';

test('the introduced starter puzzle rewards the first drop with a real clear', () => {
  const game = initialGame();
  assert.equal(game.score, 0);
  assert.equal(game.settled.length, 21);
  assert.equal(landingPiece(game).cubes.every(cube => cube.y === 0), true);
  const dropped = dropGame(game);
  assert.equal(dropped.layers, 1);
  assert.equal(dropped.score, 500);
  assert.equal(dropped.settled.length, 0);
  assert.equal(dropped.pieces, 1);
  assert.equal(game.settled.length, 21, 'does not mutate the old board');
});

test('relaxed play never advances on a gravity tick; challenge really speeds up', () => {
  const relaxed = initialGame();
  assert.equal(advanceGame(relaxed), relaxed);
  assert.equal(fallInterval(relaxed), null);
  const challenge = initialGame('tower', 'challenge');
  assert.equal(challenge.settled.length, 0);
  assert.equal(advanceGame(challenge).active.cubes[0].y, challenge.active.cubes[0].y - 1);
  assert.ok(fallInterval({ ...challenge, layers: 3 }) < fallInterval(challenge));
  assert.equal(fallInterval({ ...challenge, layers: 1000 }), 260);
});

test('landing preview equals the drop position and cannot pass through a stack', () => {
  const game = initialGame('tower', 'challenge');
  game.settled = [{ x: 1, y: 0, z: 1, color: '#ffffff' }];
  const landed = landingPiece(game);
  assert.equal(Math.min(...landed.cubes.map(cube => cube.y)), 1);
  const dropped = dropGame(game);
  for (const cube of landed.cubes) assert.ok(dropped.settled.some(other => other.x === cube.x && other.y === cube.y && other.z === cube.z));
  assert.equal(isValidForGame(game, translatePiece(landed, { x: 0, y: -1, z: 0 }).cubes), false);
});

test('undo restores score, layer, next piece, and board, and is limited to one placement', () => {
  const before = initialGame();
  const after = dropGame(before);
  const undone = undoGame(after);
  for (const key of ['score', 'layers', 'pieces', 'settled', 'active', 'next', 'bag']) assert.deepEqual(undone[key], before[key]);
  assert.equal(undone.undo, null);
  assert.equal(undoGame(undone), undone);
  assert.equal(undoGame({ ...after, paused: true }).paused, true);
  assert.equal(undoGame({ ...after, gameOver: true }).gameOver, false);
  const challenge = dropGame(initialGame('tower', 'challenge'));
  assert.equal(undoGame(challenge), challenge);
});

test('every easy shape appears once before a bag repeats', () => {
  let bag = [];
  const seen = [];
  for (let i = 0; i < 5; i++) {
    const result = drawShape(bag, 'tower', 'relaxed', () => .4);
    seen.push(result.index); bag = result.bag;
  }
  assert.deepEqual(seen.sort((a,b) => a-b), [0,5,6,7,8]);
  assert.deepEqual(bag, []);
});

test('all four arrows address both floor axes in 3D, top, front and side views', () => {
  const orientations = [DEFAULT_CAMERA_ORIENTATION, quaternionConjugate(quaternionFromAxisAngle('x', Math.PI/2)), { x:0,y:0,z:0,w:1 }, quaternionConjugate(quaternionFromAxisAngle('y', Math.PI/2))];
  for (const orientation of orientations) {
    const camera = { orientation, targetOrientation: orientation };
    const vectors = [[1,0],[-1,0],[0,1],[0,-1]].map(([x,y]) => screenMove(x,y,camera,'tower'));
    assert.equal(new Set(vectors.map(v => JSON.stringify(v))).size, 4);
    assert.ok(vectors.every(v => v.y === 0 && Math.abs(v.x)+Math.abs(v.z) === 1));
  }
});

test('pause and game-over reject drops and gravity', () => {
  for (const blocked of [{ paused:true }, { gameOver:true }]) {
    const game = { ...initialGame('tower', 'challenge'), ...blocked };
    assert.equal(dropGame(game), game); assert.equal(advanceGame(game), game);
  }
});

test('tower top-out remains recoverable through relaxed undo', () => {
  let game = { ...initialGame(), settled:[] };
  for (let i=0; i<100 && !game.gameOver; i++) game=dropGame(game);
  assert.equal(game.gameOver,true);
  const recovered=undoGame(game);
  assert.equal(recovered.gameOver,false);
  assert.ok(isValidForGame(recovered,recovered.active.cubes));
});

test('patch and core keep their distinct placement rules in both paces', () => {
  for (const mode of ['patch','core']) {
    for (const pace of ['relaxed','challenge']) {
      const game = initialGame(mode,pace);
      const landed = landingPiece(game);
      assert.ok(isValidForGame(game,landed.cubes));
      const dropped = dropGame(game);
      assert.equal(dropped.pieces,1);
      assert.ok(dropped.score>0);
      assert.equal(new Set(dropped.settled.map(c => `${c.x},${c.y},${c.z}`)).size,dropped.settled.length);
    }
  }
});
