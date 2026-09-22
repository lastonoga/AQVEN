import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";

const distDir = new URL("../dist/", import.meta.url);
const pagePath = new URL("index.html", distDir);

assert.ok(existsSync(pagePath), "Build the site before checking the landing page.");

const page = readFileSync(pagePath, "utf8");

// StudioEvidence ships as a client:visible island (Tabs need JS to switch) — only the default
// tab's screenshot is in the static HTML. The other three are compiled into its JS chunk instead
// and only reach the DOM once the visitor clicks a tab, so this check scans the whole build
// output (HTML + every _astro/*.js chunk), not just index.html, to still catch a dropped tab.
const astroDir = new URL("_astro/", distDir);
const bundleText = readdirSync(astroDir)
  .filter((name) => name.endsWith(".js"))
  .map((name) => readFileSync(new URL(name, astroDir), "utf8"))
  .join("\n");
const buildOutput = page + bundleText;

const requiredMarkers = [
  "Build AI workflows you can trust to run the business.",
  "AI workflows get hard to follow, fast.",
  "It runs thousands of times before anyone notices something drifted.",
  "Your team can finally read the workflow.",
  "Your coding agent stops guessing.",
  "Not a tracing tool. Not a drag-and-drop builder.",
  "Keep your models. Keep your code.",
  "Source available.",
  "Start with a workflow you already have.",
  "uv tool install aqven",
];

for (const marker of requiredMarkers) {
  assert.ok(page.includes(marker), `Expected the landing page to contain: ${marker}`);
}

const requiredScreenshots = [
  "/images/studio/canvas.png",
  "/images/studio/project-flows.png",
  "/images/studio/runs.png",
  "/images/studio/node-inspector.png",
  "/images/studio/evaluations.png",
  "/images/studio/dataset-controls.png",
];

for (const marker of requiredScreenshots) {
  assert.ok(
    buildOutput.includes(marker),
    `Expected the build output (HTML or a JS chunk) to contain: ${marker}`
  );
}

const forbiddenMarkers = ["uv run aqven", "aqven check ."];

for (const marker of forbiddenMarkers) {
  assert.ok(!page.includes(marker), `The landing page must not show commands: ${marker}`);
}

// Zero em-dashes anywhere visible on the page - a deliberate design-taste rule (headlines, body
// copy, captions, quotes), not a typo guard. Regular hyphens or a colon/comma restructure instead.
assert.ok(!page.includes("—"), "The landing page must not contain an em-dash (—).");

// AQVEN is source-available (AQVEN License 1.0.0, a modified PolyForm Shield that additionally
// restricts commercial distribution), not open source, and never was. Calling it "open source" or
// "MIT" is a license claim, not a typo. The LICENSE file also asks not to be cited as unmodified
// PolyForm Shield, so the page should say "AQVEN License", not "PolyForm Shield".
const licenseMisclaims = ["Open source", "open-source", "open source", '"MIT"', ">MIT<"];

for (const marker of licenseMisclaims) {
  assert.ok(
    !page.includes(marker),
    `The landing page must not claim AQVEN is open source or MIT-licensed (found: ${marker}). It is source-available under the AQVEN License 1.0.0.`
  );
}

assert.ok(
  page.includes('href="/start/"'),
  "The landing page must route visitors to the documentation."
);

const counts = [
  { label: "documentation tiles", needle: "after:absolute after:inset-0", expected: 12 },
  { label: "problem quotes", needle: "<blockquote", expected: 4 },
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
