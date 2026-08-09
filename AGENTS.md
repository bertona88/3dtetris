# 3D Blocks Agent Guide

This repository contains the source for the 3D Blocks browser-game prototype.
Treat it as one concrete implementation of the WOFI Idea "Gyroscopic 3D
Block-Stacking View," not as the Idea exhausted or as proof that every proposed
mode is implemented.

## Product boundary

- The current prototype provides a 5 x 5 x 9 falling-block grid, front/top/side
  projections, touch dragging, piece rotation, hard drop, scoring, layer
  clearing, pause/restart, and a responsive mobile interface.
- Device-orientation camera control and radial-gravity spherical packing are not
  implemented. Do not claim otherwise in UI, documentation, release notes, or
  WOFI metadata.
- Use the independent product identity **3D Blocks**. Tetris may be mentioned
  only as the historical gameplay ancestor, not as the product name, branding,
  or an affiliation claim.

## Source and hosting

- Canonical source: `https://github.com/bertona88/3dtetris`, branch `main`.
- Production URL: `https://3dblocks.wofi.ai`.
- Hosting provider: ChatGPT Sites, using the existing project identified in
  `.openai/hosting.json`.
- The custom hostname is attached directly to the Sites project. DNS points the
  `3dblocks` subdomain at the Sites custom-domain target; the game is not served
  by the WOFI Hetzner application server.
- Preserve the existing `project_id` in `.openai/hosting.json`. Do not create a
  replacement Sites project unless explicitly requested.
- The repository currently has no database or object-storage binding. Keep
  `d1` and `r2` `null` unless a feature explicitly requires persistence.

## Deployment model

A push to GitHub does **not** automatically deploy the site. GitHub and Sites
have separate source/release steps.

For a production release:

1. Start from a clean, reviewed GitHub `main` revision.
2. Install from the lockfile and run the verified build and tests on Linux.
3. Run lint separately.
4. Commit and push the exact validated source to GitHub.
5. Push that exact source tree to the existing Sites source repository.
6. Package the generated `dist/` artifact, save a new Sites version, and deploy
   that saved version.
7. Wait for the deployment to succeed, then verify the custom domain rather
   than stopping at the provider URL.

The custom-domain mapping persists across releases; it does not need to be
recreated for each deployment.

## Build and verification

The verified helpers require Linux tools such as GNU `timeout`, `flock`, and
`sha256sum`. On Andrea's Mac, use `devbox-home` for the release build instead of
installing a parallel toolchain locally.

From the Linux project copy, run:

```bash
npm ci
npm test
npm run lint
```

`npm test` runs the production build, validates the Sites Worker artifact, and
runs the rendered-HTML metadata test. A green build is not proof of deployment.
After publishing, separately verify:

- `https://3dblocks.wofi.ai/` returns HTTPS success and the `3D Blocks` title;
- Open Graph metadata resolves to `https://3dblocks.wofi.ai/og.png`;
- the public social image matches the committed `public/og.png`;
- the Sites custom domain, provider route, and TLS state are active.

Do not claim interactive browser or physical-device acceptance unless those
checks were actually performed. Build, deployment, public HTTP verification,
browser interaction, and device testing are separate evidence boundaries.

## WOFI registration

The deployed prototype is registered as an Implementation of exactly one Idea:

- Idea: `sha256:c472014b92b2e4c50702ad044544f964707a78157100c5e79ce161bc01eca510`
- Implementation: `sha256:728a9f116ccee500def3570924511aeaa728097f692dea0603ca9d598a894d95`
- Artifact: `https://3dblocks.wofi.ai`
- Maturity: `prototype`

Keep future WOFI updates honest about implemented and unimplemented facets. A
new release does not require a new Implementation record by default; register a
new one only when the intended provenance or implementation lineage warrants a
distinct graph object.

## Repository hygiene

- Preserve the existing Vinext/Next/React structure and lockfile.
- Keep generated runtime state, caches, dependencies, and `dist/` out of source
  commits unless the repository policy changes explicitly.
- Never commit credentials, Sites source tokens, DNS credentials, or local
  environment files.
- Prefer small, reviewable changes and keep GitHub, the tested commit, the Sites
  saved version, and the live custom domain traceable to one another.
