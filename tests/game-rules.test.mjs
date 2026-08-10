import assert from "node:assert/strict";
import test from "node:test";

import { clearPatches, findWallKickedRotation } from "../app/game-rules.ts";

test("wall kicks move a blocked rotation by one perpendicular cell", () => {
  const rotated = [{ x: -1, y: 4, z: 2, color: "pink" }];
  const result = findWallKickedRotation(
    rotated,
    "y",
    (cubes) => cubes.every((cube) => cube.x >= 0),
  );

  assert.deepEqual(result, [{ x: 0, y: 4, z: 2, color: "pink" }]);
});

test("patch clears collapse columns and repeat for chain clears", () => {
  const cubes = [];
  for (let x = 0; x < 3; x += 1) {
    for (let z = 0; z < 3; z += 1) cubes.push({ x, y: 0, z });
  }
  for (let x = 4; x < 7; x += 1) {
    for (let z = 4; z < 7; z += 1) {
      if (x !== 4 || z !== 4) cubes.push({ x, y: 0, z });
    }
  }
  cubes.push({ x: 4, y: 1, z: 4 });

  const result = clearPatches(cubes, 9, 3, 10);

  assert.equal(result.patches, 2);
  assert.deepEqual(result.remaining, []);
});
