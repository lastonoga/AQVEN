import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const pagePath = new URL("../dist/index.html", import.meta.url);

assert.ok(existsSync(pagePath), "Build the site before checking the landing page.");

const page = readFileSync(pagePath, "utf8");

const requiredMarkers = [
  "The open-source workbench for AI workflows.",
  "Built for humans and coding agents.",
  "AI workflows get hard to follow, fast.",
  "A broken AI workflow costs real money.",
  "Your team can finally read the workflow.",
  "Your coding agent stops guessing.",
  "Not a tracing tool. Not a drag-and-drop builder.",
  "Keep your models. Keep your code.",
  "Open source. Free forever.",
  "Start with a workflow you already have.",
  "/images/studio/canvas.png",
  "/images/studio/project-flows.png",
  "/images/studio/runs.png",
  "/images/studio/node-inspector.png",
  "/images/studio/evaluations.png",
];

for (const marker of requiredMarkers) {
  assert.ok(page.includes(marker), `Expected the landing page to contain: ${marker}`);
}

const forbiddenMarkers = ["uv run aqven", "aqven check ."];

for (const marker of forbiddenMarkers) {
  assert.ok(!page.includes(marker), `The landing page must not show commands: ${marker}`);
}

assert.ok(
  page.includes('href="/start/"'),
  "The landing page must route visitors to the documentation."
);

const counts = [
  { label: "documentation tiles", needle: 'class="flex flex-col items-start', expected: 12 },
  { label: "problem quotes", needle: "<blockquote", expected: 4 },
  { label: "workflow screenshots", needle: "/images/studio/", expected: 5 },
];

for (const { label, needle, expected } of counts) {
  const found = page.split(needle).length - 1;
  assert.equal(
    found,
    expected,
    `Expected ${expected} ${label} but rendered ${found}. A block may be silently truncating its items.`
  );
}

console.log(`Landing page OK (${requiredMarkers.length} markers, ${counts.length} counts).`);
