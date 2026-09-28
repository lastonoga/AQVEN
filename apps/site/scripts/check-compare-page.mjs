import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const pagePath = new URL("../dist/compare/index.html", import.meta.url);

assert.ok(existsSync(pagePath), "Build the site before checking the comparison page.");

const page = readFileSync(pagePath, "utf8");
const SITE = "https://aqvenstudio.com";

const requiredMarkers = [
  "You have traces and evals. Why AQVEN?",
  "What each tool gives you.",
  "Langfuse",
  "LangSmith",
  "Arize Phoenix",
  "promptfoo",
  "DeepEval",
  "n8n",
  "LangGraph",
  "Tells you whether a difference is real",
  "Confirms a change on held-out cases",
  "Checked against each product",
  "Your agent does the work. You decide. AQVEN runs and records it.",
  "Use them together.",
  "When AQVEN is not the right tool",
  "checked on 28 September 2026",
  `<link rel="canonical" href="${SITE}/compare/">`,
]

const lowerPage = page.toLowerCase();

for (const marker of requiredMarkers) {
  assert.ok(lowerPage.includes(marker.toLowerCase()), `Expected the comparison page to contain: ${marker}`);
}

const JSON_LD_BLOCK = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g;
const jsonLd = [...page.matchAll(JSON_LD_BLOCK)].map(([, body]) => JSON.parse(body));

assert.ok(
  jsonLd.some((node) => node["@type"] === "WebPage" && node.url === `${SITE}/compare/`),
  "Expected the comparison page JSON-LD to describe the page as a WebPage."
);

assert.ok(!page.includes("—"), "The comparison page must not contain an em-dash (—).");

const overclaims = [
  { marker: "AQVEN is open source", reason: "AQVEN is source-available under the AQVEN License 1.0.0" },
  { marker: "AQVEN is open-source", reason: "AQVEN is source-available under the AQVEN License 1.0.0" },
  { marker: "only traces", reason: "tracing platforms also run dataset experiments; the page must not say they only trace" },
  { marker: "only scores", reason: "the page must not reduce eval libraries to a universal no" },
  { marker: "can't cheat", reason: "the engine leaves parts of the discipline to the agent" },
  { marker: "keeps it honest", reason: "the engine leaves parts of the discipline to the agent" },
  { marker: "guarantees", reason: "a verdict holds only for the cases, checks and versions it measured" },
  { marker: "Flowise", reason: "Flowise reached end of life on 31 August 2026 and is not an alternative anyone can choose" },
];

const plainPage = page.replaceAll("’", "'").replaceAll("&#x27;", "'").replaceAll("&#39;", "'");

for (const { marker, reason } of overclaims) {
  assert.ok(!plainPage.includes(marker), `The comparison page must not say "${marker}": ${reason}.`);
}

console.log(`Comparison page OK (${requiredMarkers.length} markers, ${overclaims.length} guards).`);
