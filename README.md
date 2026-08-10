# 3D Blocks

A mobile-first prototype of a 3D block-stacking puzzle. Tetris is referenced only as the historical gameplay ancestor; 3D Blocks has an independent product identity. The camera follows device orientation, and the game includes bounded vertical-gravity modes plus a radial-gravity packing mode.

## Features

- **Tower** mode: a 5 x 5 x 10 grid with vertical gravity and full-layer clearing
- **Patch** mode: a 9 x 9 grid where completed 3 x 3 patches clear, columns collapse, and chain clears are possible
- **Core** mode: three-dimensional attraction toward a central point with spherical accumulation
- Core scoring based on packing density and cluster radius
- device-orientation camera controls with adjustable multipliers and smoothing
- camera-relative swipes to move the active piece, tap to rotate, and long press to hard drop
- dual virtual joysticks on tablets: view-relative movement on the left, rotation and height control on the right
- keyboard controls and a responsive interface for phones and tablets
- wall-kicked piece rotation to make rotations near board boundaries more forgiving

This implementation is linked to the [WOFI Idea “Gyroscopic 3D Block-Stacking View”](https://wofi.ai/ideas/sha256%3Ac472014b92b2e4c50702ad044544f964707a78157100c5e79ce161bc01eca510).

## Local development

```bash
npm ci
npm run dev
```

Open the address printed by the development server.

## Build and test

```bash
npm test
npm run lint
```

`npm test` runs the production build, validates the Sites Worker artifact, and checks rendered metadata.

Live version: https://3dblocks.wofi.ai
