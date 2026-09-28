import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { docsTokens } from "../docs.tokens.mjs";
import { SITUATIONS, USE_CASES_PATH, situationHref } from "../src/components/landing/situations.ts";
import { COMPARE_PATH } from "../src/components/landing/compare-path.ts";

const siteRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const docsRoot = join(siteRoot, "src/content/docs");
const publicRoot = join(siteRoot, "public");
const markdownRoot = join(publicRoot, "llms");
const indexPath = join(publicRoot, "llms.txt");
const fullPath = join(publicRoot, "llms-full.txt");
const baseUrl = "https://aqvenstudio.com";
const siteDescription =
  "AQVEN is a Python framework and a local Studio for building reliable LLM workflows. Claude Code or Codex runs the experiments; you see the evidence and decide.";
const builtOnNote = "AQVEN uses Pydantic AI for model-facing agents and DBOS for durable execution.";
const linksNote = "The documentation links below point to Markdown copies of each page.";
const check = process.argv.includes("--check");

function markdownFiles(folder) {
  return readdirSync(folder, { withFileTypes: true }).flatMap((entry) => {
    const path = join(folder, entry.name);
    if (entry.isDirectory()) return markdownFiles(path);
    return entry.isFile() && entry.name.endsWith(".md") ? [path] : [];
  });
}

function renderTokens(value) {
  return value.replace(/\{\{([A-Z_]+)\}\}/g, (match, key) => docsTokens[key] ?? match);
}

function parsePage(path) {
  const source = readFileSync(path, "utf8");
  const frontmatter = source.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  if (!frontmatter) throw new Error(`Missing frontmatter: ${path}`);
  const field = (name) => {
    const match = frontmatter[1].match(new RegExp(`^${name}:\\s*(.*)$`, "m"));
    if (!match) throw new Error(`Missing ${name}: ${path}`);
    return renderTokens(match[1].trim().replace(/^(["'])(.*)\1$/, "$2"));
  };
  const slug = relative(docsRoot, path).split(sep).join("/");
  const browserPath = `/${slug.replace(/(?:\/index)?\.md$/, "/")}`.replace(/\/\//g, "/");
  const url = `${baseUrl}${browserPath}`;
  const title = field("title");
  const description = field("description");
  const body = renderTokens(source.slice(frontmatter[0].length).trim());
  return {
    slug,
    title,
    description,
    markdown: `# ${title}\n\n> ${description}\n\n[Read in the browser](${url})\n\n${body}\n`,
    fullEntry: `# ${title}\n\nURL: ${url}\n\n> ${description}\n\n${body}\n`,
  };
}

const pages = markdownFiles(docsRoot).map(parsePage).sort((a, b) => a.slug.localeCompare(b.slug));
const pageBySlug = new Map(pages.map((page) => [page.slug, page]));
const startOrder = [
  "start/index.md",
  "start/quickstart.md",
  "start/engineering-loop-walkthrough.md",
  "start/a-day-with-aqven.md",
  "start/where-next.md",
];
const AREAS = [
  ["Start", (page) => startOrder.includes(page.slug), startOrder],
  ["Engine", (page) => page.slug.startsWith("engine/")],
  ["Studio", (page) => page.slug.startsWith("studio/")],
  ["MCP & CLI", (page) => page.slug.startsWith("mcp-cli/")],
  ["Integrations", (page) => page.slug.startsWith("integrations/")],
  ["Concepts", (page) => page.slug.startsWith("concepts/")],
  ["Reference", (page) => page.slug.startsWith("reference/")],
];
const selectPages = (matches, order) =>
  order ? order.map((slug) => pageBySlug.get(slug)).filter(Boolean) : pages.filter(matches);
const docSections = AREAS.map(([name, matches, order]) => ({ name, pages: selectPages(matches, order) })).filter(
  (docSection) => docSection.pages.length,
);
const orderedPages = docSections.flatMap((docSection) => docSection.pages);

const listItem = (label, url, text) => `- [${label}](${url}): ${text}`;
const section = (name, items) => `## ${name}\n\n${items.join("\n")}\n`;
const pageItem = (page) => listItem(page.title, `${baseUrl}/llms/${page.slug}`, page.description);
const situationItem = (situation) =>
  listItem(situation.verb, `${baseUrl}${situationHref(situation.id)}`, `${situation.question} ${situation.summary}`);

const purposeItems = [
  ...SITUATIONS.map(situationItem),
  listItem("Home", `${baseUrl}/`, "What AQVEN is, what it is for, and how to get started."),
  listItem(
    "Use cases",
    `${baseUrl}${USE_CASES_PATH}`,
    "Find, explain, compare, confirm and build in detail, each with links to the docs.",
  ),
  listItem(
    "Compare",
    `${baseUrl}${COMPARE_PATH}`,
    "Why AQVEN when you already have traces and evals: the questions a score doesn't answer, who does which part, and when another tool fits better.",
  ),
];
const optionalItems = [
  listItem("Full documentation", `${baseUrl}/llms-full.txt`, "Every documentation page above in one Markdown file."),
];

const index = [
  "# AQVEN",
  "",
  `> ${siteDescription}`,
  "",
  `${builtOnNote} ${linksNote}`,
  "",
  section("What AQVEN is for", purposeItems),
  ...docSections.map((docSection) => section(docSection.name, docSection.pages.map(pageItem))),
  section("Optional", optionalItems),
].join("\n");

const full = [
  `# AQVEN\n\n> ${siteDescription}\n\n${builtOnNote}\n`,
  ...orderedPages.map((page) => page.fullEntry),
].join("\n---\n\n");

const expected = new Map(pages.map((page) => [join(markdownRoot, page.slug), page.markdown]));
expected.set(indexPath, index);
expected.set(fullPath, full);

if (check) {
  const actual = existsSync(markdownRoot) ? markdownFiles(markdownRoot) : [];
  const stale = [...expected].filter(([path, content]) => !existsSync(path) || readFileSync(path, "utf8") !== content);
  const extra = actual.filter((path) => !expected.has(path));
  if (stale.length || extra.length) {
    throw new Error(`AI documentation is stale: ${stale.length} missing/changed, ${extra.length} extra. Run pnpm --filter @aqven/site llms.`);
  }
  process.stdout.write(`AI documentation current: ${pages.length} Markdown pages, llms.txt and llms-full.txt\n`);
} else {
  rmSync(markdownRoot, { recursive: true, force: true });
  for (const [path, content] of expected) {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content);
  }
  process.stdout.write(`Generated ${pages.length} AI Markdown pages, llms.txt and llms-full.txt\n`);
}
