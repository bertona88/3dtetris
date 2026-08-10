import assert from "node:assert/strict";
import test from "node:test";

test("renders production metadata and all game modes", async () => {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  const response = await worker.fetch(
    new Request("http://localhost/", {
      headers: {
        accept: "text/html",
        "x-forwarded-host": "preview.example",
        "x-forwarded-proto": "https",
      },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );

  assert.equal(response.status, 200);
  assert.match(
    response.headers.get("content-type") ?? "",
    /^text\/html\b/i,
  );
  const html = await response.text();
  assert.match(html, /<title>3D Blocks<\/title>/i);
  assert.match(html, /<meta[^>]+property=["']og:image["'][^>]+content=["']https:\/\/preview\.example\/og\.png["']/i);
  assert.doesNotMatch(html, /codex-preview/i);
  assert.match(html, /TILT CAMERA/);
  assert.match(html, /3D BLOCKS/);
  assert.match(html, /360° GRAVITY/);
  assert.match(html, /9×9 · CLEAR 3×3/);
  assert.match(html, /THIS IS A WOFI IDEA/);
  assert.doesNotMatch(html, /GRAVITY TETRIS|TILT TETRIS/i);
});
