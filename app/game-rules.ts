export type Axis = "x" | "y" | "z";
export type Coordinate = { x: number; y: number; z: number };

const coordinateKey = ({ x, y, z }: Coordinate) => `${x},${y},${z}`;

export function findWallKickedRotation<T extends Coordinate>(
  rotated: T[],
  axis: Axis,
  isValid: (cubes: T[]) => boolean,
) {
  const kicks: Record<Axis, Coordinate[]> = {
    x: [{ x: 0, y: -1, z: 0 }, { x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: -1 }, { x: 0, y: 0, z: 1 }],
    y: [{ x: -1, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 0, y: 0, z: -1 }, { x: 0, y: 0, z: 1 }],
    z: [{ x: -1, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 0, y: -1, z: 0 }, { x: 0, y: 1, z: 0 }],
  };
  const candidates = [rotated, ...kicks[axis].map((kick) => rotated.map((cube) => ({
    ...cube,
    x: cube.x + kick.x,
    y: cube.y + kick.y,
    z: cube.z + kick.z,
  })))];
  return candidates.find(isValid) ?? null;
}

function collapseColumns<T extends Coordinate>(cubes: T[]) {
  const columns = new Map<string, T[]>();
  cubes.forEach((cube) => {
    const key = `${cube.x},${cube.z}`;
    const column = columns.get(key) ?? [];
    column.push(cube);
    columns.set(key, column);
  });
  return Array.from(columns.values()).flatMap((column) =>
    column
      .sort((a, b) => a.y - b.y)
      .map((cube, y) => ({ ...cube, y })),
  );
}

function findPatchCubes<T extends Coordinate>(cubes: T[], boardSize: number, patchSize: number, height: number) {
  const occupied = new Set(cubes.map(coordinateKey));
  const cleared = new Set<string>();
  let patches = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x <= boardSize - patchSize; x += 1) {
      for (let z = 0; z <= boardSize - patchSize; z += 1) {
        const patch: string[] = [];
        for (let dx = 0; dx < patchSize; dx += 1) {
          for (let dz = 0; dz < patchSize; dz += 1) patch.push(`${x + dx},${y},${z + dz}`);
        }
        if (patch.every((key) => occupied.has(key))) {
          patches += 1;
          patch.forEach((key) => cleared.add(key));
        }
      }
    }
  }
  return { cleared, patches };
}

export function clearPatches<T extends Coordinate>(cubes: T[], boardSize: number, patchSize: number, height: number) {
  let remaining = cubes;
  let patches = 0;
  for (;;) {
    const found = findPatchCubes(remaining, boardSize, patchSize, height);
    if (!found.cleared.size) return { remaining, patches };
    patches += found.patches;
    remaining = collapseColumns(remaining.filter((cube) => !found.cleared.has(coordinateKey(cube))));
  }
}
