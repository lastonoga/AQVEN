import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const pagePath = new URL("../dist/roadmap/index.html", import.meta.url);

assert.ok(existsSync(pagePath), "Build the site before checking the roadmap page.");

const page = readFileSync(pagePath, "utf8");
const SITE = "https://aqvenstudio.com";

const requiredMarkers = [
  "Reliability evidence before token spend.",
  "That is what AQVEN optimizes for",
  "One sentence per item, no dates.",
  "Stabilize packaging and release flow: changelog, release notes and GitHub Releases, just landed.",
  "Cross-platform install smoke on Windows, macOS and Linux in CI, just landed.",
  "Harden the check/simulation engine against edge cases found by early users.",
  "Collect alpha feedback: two or three real projects running aqven check and series weekly.",
  "Runtime budget enforcement during a run, not only between human-approved batches.",
  "Python 3.15 support once the ecosystem settles",
  "More provider adapters beyond the OpenAI/Anthropic/local-llama paths documented today.",
  "comparing arms side by side",
  "a stability contract for the CLI and file formats",
  "documented decision process and more reviewers",
  "no SaaS dependency",
  "A direction, not a commitment.",
  "Priorities change with feedback.",
  "GitHub Discussions",
  "source-available alpha",
  'href="/roadmap/"',
  `<link rel="canonical" href="${SITE}/roadmap/">`,
];

for (const marker of requiredMarkers) {
  assert.ok(page.includes(marker), `Expected the roadmap page to contain: ${marker}`);
}

const JSON_LD_BLOCK = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g;
const jsonLd = [...page.matchAll(JSON_LD_BLOCK)].map(([, body]) => JSON.parse(body));

assert.ok(
  jsonLd.some((node) => node["@type"] === "WebPage" && node.url === `${SITE}/roadmap/`),
  "Expected the roadmap page JSON-LD to describe the page as a WebPage."
);

assert.ok(!page.includes("—"), "The roadmap page must not contain an em-dash (—).");

const mainStart = page.indexOf("<main");
const mainEnd = page.indexOf("</main>");
assert.ok(mainStart !== -1 && mainEnd > mainStart, "Expected the roadmap page to render a main element.");
// The check reads what a visitor sees: drop inline svg (its xmlns carries "2000") and any script payload.
const mainVisible = page
  .slice(mainStart, mainEnd)
  .replaceAll(/<svg\b[\s\S]*?<\/svg>/g, "")
  .replaceAll(/<script\b[\s\S]*?<\/script>/g, "");

assert.ok(!/(?:19|20)\d{2}/.test(mainVisible), "The roadmap page must not name a year: its lists carry no dates.");
assert.ok(!mainVisible.includes("%"), "The roadmap page must not carry percentages.");

const overclaims = [
  { marker: "AQVEN is open source", reason: "AQVEN is source-available under the AQVEN License 1.0.0" },
  { marker: "AQVEN is open-source", reason: "AQVEN is source-available under the AQVEN License 1.0.0" },
  { marker: "guarantees", reason: "a roadmap states a direction, it guarantees nothing" },
  { marker: "soon", reason: "the lists carry no dates; do not promise timing in prose either" },
];

const plainPage = page.replaceAll("’", "'").replaceAll("&#x27;", "'").replaceAll("&#39;", "'");

for (const { marker, reason } of overclaims) {
  assert.ok(!plainPage.includes(marker), `The roadmap page must not say "${marker}": ${reason}.`);
}

console.log(`Roadmap page OK (${requiredMarkers.length} markers, ${overclaims.length} guards).`);
