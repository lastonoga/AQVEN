import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const distDir = new URL("../dist/", import.meta.url);
const pagePath = new URL("index.html", distDir);

assert.ok(existsSync(pagePath), "Build the site before checking the landing page.");

const page = readFileSync(pagePath, "utf8");

const requiredMarkers = [
  "Build AI workflows you can trust to run the business.",
  "AI workflows get hard to follow, fast.",
  "It runs thousands of times before anyone notices something drifted.",
  "Your team can finally read the workflow.",
  "Your coding agent stops guessing.",
  "Not a tracing tool. Not a drag-and-drop builder.",
  "Keep your models. Keep your code.",
  "Source available.",
  "Know what your workflow does before it runs.",
  "uv tool install aqven",
  "aqven check: 0 errors",
  "E_REF_MISSING",
  "billing, technical, refund, other.",
  "classify.prompt.md",
  "No more guessing why an answer went wrong.",
  "Know an edit helped, before you ship it.",
  "Fix a bug once. It stays fixed.",
  "No surprise on the bill.",
  "holdout: confirmed",
  "angry_refund_request",
  "collect_orders.node.yaml",
  "def collect_orders(queue_id: QueueId)",
  "Frequently asked questions.",
  "Is AQVEN open source?",
  "llms.txt",
  "I spent a week tuning it by hand. The next round took a day and $30.",
  "The loop around it is.",
  "Kir Burkhanov",
];

for (const marker of requiredMarkers) {
  assert.ok(page.includes(marker), `Expected the landing page to contain: ${marker}`);
}

const forbiddenMarkers = [
  { marker: "uv run aqven", reason: "is a command that only works inside an existing project" },
  { marker: "aqven check .", reason: "is a command that only works inside an existing project" },
  {
    marker: "Nothing to rewrite",
    reason:
      "claims AQVEN adopts a workflow you already run. The only way to create a project is `aqven new`, and every flow, node and prompt is authored as a file",
  },
  {
    marker: "Point AQVEN at your project",
    reason:
      "claims AQVEN adopts a workflow you already run. The only way to create a project is `aqven new`, and every flow, node and prompt is authored as a file",
  },
];

for (const { marker, reason } of forbiddenMarkers) {
  assert.ok(!page.includes(marker), `The landing page must not say "${marker}": it ${reason}.`);
}

// Zero em-dashes anywhere visible on the page - a deliberate design-taste rule (headlines, body
// copy, captions, quotes), not a typo guard. Regular hyphens or a colon/comma restructure instead.
assert.ok(!page.includes("—"), "The landing page must not contain an em-dash (—).");

// AQVEN is source-available (AQVEN License 1.0.0, a modified PolyForm Shield that additionally
// restricts commercial distribution), not open source, and never was. Claiming it IS open source or
// MIT is a license misclaim, not a typo. The FAQ legitimately asks "Is AQVEN open source?" and
// answers "No" - these patterns catch the affirmative claim, not the phrase itself. The LICENSE
// file also asks not to be cited as unmodified PolyForm Shield, so the page should say "AQVEN
// License", not "PolyForm Shield".
const licenseMisclaims = [
  "AQVEN is open source",
  "AQVEN is open-source",
  "is an open source",
  "is an open-source",
  '"MIT"',
  ">MIT<",
];

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
