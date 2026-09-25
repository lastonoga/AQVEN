import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const distDir = new URL("../dist/", import.meta.url);
const pagePath = new URL("index.html", distDir);

assert.ok(existsSync(pagePath), "Build the site before checking the landing page.");

const page = readFileSync(pagePath, "utf8");

const requiredMarkers = [
  "Discover what your AI workflow needs to work reliably.",
  "For engineers building multi-step AI workflows",
  ">Alpha<",
  "Find. Explain. Compare. Confirm. Build.",
  ">Find<",
  ">Explain<",
  ">Compare<",
  ">Confirm<",
  ">Build<",
  "What am I missing?",
  "Why did this fail?",
  "All use cases",
  "Your agent does the work. You direct the investigation.",
  "Confirm on held-out cases.",
  "Keep the finding.",
  "FINDINGS.md",
  "Caught by an experiment, not by a customer.",
  "MODEL_RETRIES_EXHAUSTED",
  "Built for inspection, not blind trust.",
  "aqven check: 0 errors",
  "E_REF_MISSING",
  "It checks the wiring, not whether the answers are right.",
  "billing, technical, refund, other.",
  "See where an answer went wrong.",
  "See what each step costs.",
  "Not a tracing tool. Not a drag-and-drop builder.",
  "Keep your models. Keep your code.",
  "collect_orders.node.yaml",
  "def collect_orders(queue_id: QueueId)",
  "Source available.",
  "Frequently asked questions.",
  "Is AQVEN open source?",
  "Is AQVEN ready for production?",
  "Start with one question.",
  "uv tool install aqven",
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
  {
    marker: "stays fixed",
    reason: "promises a fixed bug never returns. A regression case lowers the risk of it coming back, it doesn't rule it out",
  },
  {
    marker: "can't fake",
    reason: "claims the engine enforces discipline it leaves to the agent (see What the engine leaves to the agent in the research loop page)",
  },
  {
    marker: "can't wire",
    reason: "promises a wrong connection is impossible. aqven check reports it as an error, it doesn't prevent writing it",
  },
  {
    marker: "until the workflow holds",
    reason: "promises reliability as an outcome. A verdict holds only for the cases, checks and versions it measured",
  },
  {
    marker: "until it holds",
    reason: "promises reliability as an outcome. A verdict holds only for the cases, checks and versions it measured",
  },
  {
    marker: "until the workflow is reliable",
    reason: "promises reliability as an outcome. A verdict holds only for the cases, checks and versions it measured",
  },
  {
    marker: "Tonicc",
    reason: "tells the removed case study. The landing page hooks through the engineer's problems and the research loop, not a personal story",
  },
  {
    marker: "showcase",
    reason: "names an example project. The landing page shows the example without pointing at the template it came from",
  },
];

const pageWithPlainApostrophes = page.replaceAll("\u2019", "'").replaceAll("&#x27;", "'").replaceAll("&#39;", "'");

for (const { marker, reason } of forbiddenMarkers) {
  assert.ok(
    !pageWithPlainApostrophes.includes(marker),
    `The landing page must not say "${marker}": it ${reason}.`
  );
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

const counts = [{ label: "use case cards", needle: 'href="/use-cases/#', expected: 5 }];

for (const { label, needle, expected } of counts) {
  const found = page.split(needle).length - 1;
  assert.equal(
    found,
    expected,
    `Expected ${expected} ${label} but rendered ${found}. A block may be silently truncating its items.`
  );
}

console.log(`Landing page OK (${requiredMarkers.length} markers, ${counts.length} counts).`);
