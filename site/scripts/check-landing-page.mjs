import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const pagePath = new URL("../dist/index.html", import.meta.url);

assert.ok(existsSync(pagePath), "Build the site before checking the landing page.");

const page = readFileSync(pagePath, "utf8");
const stylesPath = new URL("../src/styles/aqven-landing.css", import.meta.url);
const styles = readFileSync(stylesPath, "utf8");
const requiredMarkers = [
  "Build AI workflows you can trust.",
  "AQVEN makes AI-powered work reviewable and improvable.",
  "When an AI result is wrong, know why.",
  "Open source. Free forever.",
  "AQVEN is an open-source engineering environment for reliable AI work.",
  "/images/studio/canvas.png",
  "/images/studio/runs.png",
  "/images/studio/evaluations.png",
];

for (const marker of requiredMarkers) {
  assert.ok(page.includes(marker), `Expected the landing page to contain: ${marker}`);
}

assert.ok(
  styles.includes('body:has(.aqven-landing) [data-slot="doc-title"]'),
  "The landing page must suppress Starlight's duplicate page title."
);

assert.ok(
  !page.includes("screenshot placeholder"),
  "The landing page must use real Studio screenshots instead of fake screenshot placeholders."
);

assert.ok(!page.includes('role="tab"'), "The Studio story must not fall back to generic feature tabs.");
assert.ok(
  !page.includes("From a single agent to the process around it."),
  "The landing page must not repeat the hero with a generic coverage section."
);
assert.ok(page.includes("aqven-site-nav"), "The landing page must render its own compact sticky navigation.");
assert.ok(page.includes("aqven-site-footer"), "The landing page must render a product footer.");
assert.ok(styles.includes("position: fixed;"), "The landing navigation must stay visible while the page scrolls.");
