import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const distDir = new URL("../dist/", import.meta.url);
const pagePath = new URL("use-cases/index.html", distDir);

assert.ok(existsSync(pagePath), "Build the site before checking the use cases page.");

const NORMALIZATIONS = [
  { pattern: /<!--\s*-->/g, replacement: "" },
  { pattern: /&#x27;|&#39;|&rsquo;|’/g, replacement: "'" },
  { pattern: /&quot;|&#x22;|&ldquo;|&rdquo;|“|”/g, replacement: '"' },
  { pattern: /&amp;/g, replacement: "&" },
];

const normalize = (html) =>
  NORMALIZATIONS.reduce((text, { pattern, replacement }) => text.replace(pattern, replacement), html);

const raw = readFileSync(pagePath, "utf8");
const page = normalize(raw);
const lowered = page.toLowerCase();

const SITUATIONS = [
  {
    id: "find",
    verb: "Find",
    title: "Find what you'd miss by hand.",
    question: "What am I missing?",
    doc: "/mcp-cli/research-loop/",
  },
  {
    id: "explain",
    verb: "Explain",
    title: "Explain where a run went wrong.",
    question: "Why did this fail?",
    doc: "/studio/investigate-a-run/",
  },
  {
    id: "compare",
    verb: "Compare",
    title: "Compare changes on your own cases.",
    question: "What should I change?",
    doc: "/studio/research/",
  },
  {
    id: "confirm",
    verb: "Confirm",
    title: "Confirm a fix before you ship it.",
    question: "Can I trust this change?",
    doc: "/concepts/experiments-series-and-findings/",
  },
  {
    id: "build",
    verb: "Build",
    title: "Build it so it stays readable.",
    question: "How do I keep it readable as it grows?",
    doc: "/start/quickstart/",
  },
];

const STEPS_PER_SITUATION = 3;
const LINKS_PER_SITUATION = 2;

assert.ok(
  page.includes("<title>What AQVEN is for: use cases</title>"),
  "The use cases page must keep its title."
);
assert.ok(page.includes(">What AQVEN is for.</h1>"), "The use cases page must open with its hero heading.");

for (const { id, verb, title, question, doc } of SITUATIONS) {
  assert.ok(page.includes(`id="${id}"`), `Expected a section with id="${id}".`);
  assert.ok(page.includes(`href="#${id}"`), `Expected the hero index to link to #${id}.`);
  assert.ok(page.includes(`>${title}</h2>`), `Expected the heading: ${title}`);
  assert.ok(page.includes(`>${verb}</span>`), `Expected the verb label: ${verb}`);
  assert.ok(page.includes(`"${question}"`), `Expected the quoted question: ${question}`);
  assert.ok(page.includes(`href="${doc}"`), `Expected a link to ${doc} for ${id}.`);
}

const requiredMarkers = [
  "The situation",
  "What you do in AQVEN",
  "What it won't do",
  "Read more",
  "gemini-2.5-flash-lite",
  "200 characters",
  "FINDINGS.md",
  "E_REF_MISSING",
  "A trace shows where a failure appeared, not why.",
  "A green verdict is not a production guarantee",
  "A passing check means the structure holds together, not that the logic is right.",
  "Start with one question.",
  "Run a small experiment. Inspect the evidence. Decide what comes next.",
];

for (const marker of requiredMarkers) {
  assert.ok(page.includes(marker), `Expected the use cases page to contain: ${marker}`);
}

const counts = [
  { label: "situation sections", needle: ">The situation<", expected: SITUATIONS.length },
  { label: "limit notes", needle: ">What it won't do<", expected: SITUATIONS.length },
  { label: "read more blocks", needle: ">Read more<", expected: SITUATIONS.length },
  { label: "hero index links", needle: 'href="#', expected: SITUATIONS.length },
  { label: "steps", needle: "<h4", expected: SITUATIONS.length * STEPS_PER_SITUATION },
];

for (const { label, needle, expected } of counts) {
  const found = page.split(needle).length - 1;
  assert.equal(
    found,
    expected,
    `Expected ${expected} ${label} but rendered ${found}. A block may be silently dropping its items.`
  );
}

const readMoreLinks = page.split(">Read more<").slice(1).map((chunk) => chunk.split("</ul>")[0].split("<li").length - 1);

for (const found of readMoreLinks) {
  assert.equal(found, LINKS_PER_SITUATION, `Expected ${LINKS_PER_SITUATION} links under Read more but found ${found}.`);
}

assert.ok(!raw.includes("—"), "The use cases page must not contain an em-dash.");

const forbiddenMarkers = [
  { marker: "open source", reason: "AQVEN is source-available under the AQVEN License, not open source" },
  { marker: "open-source", reason: "AQVEN is source-available under the AQVEN License, not open source" },
  { marker: '"mit"', reason: "AQVEN is not MIT-licensed" },
  { marker: ">mit<", reason: "AQVEN is not MIT-licensed" },
  { marker: "stays fixed", reason: "a regression case lowers the risk of a known bug returning, it doesn't prevent it" },
  { marker: "can't wire", reason: "a structural check doesn't validate the meaning of the process" },
  { marker: "can't fake", reason: "most of the research loop is discipline, not enforcement" },
  { marker: "until the workflow holds", reason: "a verdict holds only for the cases, checks and versions it measured" },
  { marker: "until the workflow is reliable", reason: "a verdict holds only for the cases, checks and versions it measured" },
  { marker: "until it holds", reason: "a verdict holds only for the cases, checks and versions it measured" },
  { marker: "statistically sound", reason: "a verdict can be inconclusive or invalid" },
  { marker: "stale automatically", reason: "nothing marks a finding stale when the flow changes" },
  { marker: "guaranteed", reason: "the page makes no absolute guarantees" },
  { marker: "guarantees", reason: "the page makes no absolute guarantees" },
  { marker: "never breaks", reason: "the page makes no absolute guarantees" },
  { marker: "tonicc", reason: "the Tonicc story is not on the site" },
  { marker: "showcase", reason: "the page shows examples without naming the template they came from" },
  { marker: "$1.99", reason: "that report is not cited on the site" },
  { marker: "3,186", reason: "that report is not cited on the site" },
];

for (const { marker, reason } of forbiddenMarkers) {
  assert.ok(!lowered.includes(marker), `The use cases page must not say "${marker}": ${reason}.`);
}

const internalPages = [...new Set([...page.matchAll(/href="(\/[^"#?]*\/)"/g)].map(([, href]) => href))];

for (const href of internalPages) {
  const target = new URL(`.${href}index.html`, distDir);
  assert.ok(existsSync(target), `The use cases page links to ${href}, which the build did not produce.`);
}

console.log(
  `Use cases page OK (${SITUATIONS.length} situations, ${requiredMarkers.length} markers, ${counts.length} counts, ${internalPages.length} internal links).`
);
