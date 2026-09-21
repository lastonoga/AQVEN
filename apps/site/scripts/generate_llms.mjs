import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { docsTokens } from "../docs.tokens.mjs";

const siteRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const docsRoot = join(siteRoot, "src/content/docs");
const publicRoot = join(siteRoot, "public");
const markdownRoot = join(publicRoot, "llms");
const baseUrl = "https://aqvenstudio.com";
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
  const title = field("title");
  const description = field("description");
  const body = renderTokens(source.slice(frontmatter[0].length).trim());
  return {
    slug,
    title,
    description,
    markdown: `# ${title}\n\n> ${description}\n\n[Read in the browser](${baseUrl}${browserPath})\n\n${body}\n`,
  };
}

const pages = markdownFiles(docsRoot).map(parsePage).sort((a, b) => a.slug.localeCompare(b.slug));
const expected = new Map(pages.map((page) => [join(markdownRoot, page.slug), page.markdown]));
const startOrder = ["start/index.md", "start/quickstart.md", "start/engineering-loop-walkthrough.md", "start/where-next.md"];
const link = (page) => `- [${page.title}](${baseUrl}/llms/${page.slug}): ${page.description}`;
const section = (name, selected) => (selected.length ? `## ${name}\n\n${selected.map(link).join("\n")}\n` : "");
const AREAS = [
  ["Start", (page) => startOrder.includes(page.slug), startOrder],
  ["Engine", (page) => page.slug.startsWith("engine/")],
  ["Studio", (page) => page.slug.startsWith("studio/")],
  ["MCP & CLI", (page) => page.slug.startsWith("mcp-cli/")],
  ["Integrations", (page) => page.slug.startsWith("integrations/")],
  ["Reference", (page) => page.slug.startsWith("reference/")],
  ["Concepts", (page) => page.slug.startsWith("concepts/")],
];
const index = [
  "# AQVEN Documentation",
  "",
  "> Developer guides for typed AI workflows and Studio. AQVEN uses Pydantic AI for model-facing agents and DBOS for durable execution. Read the linked Markdown pages for details.",
  "",
  ...AREAS.map(([name, matches, order]) => {
    const selected = order
      ? order.map((slug) => pages.find((page) => page.slug === slug)).filter(Boolean)
      : pages.filter(matches);
    return section(name, selected);
  }).filter(Boolean),
].join("\n");
expected.set(join(publicRoot, "llms.txt"), index);

if (check) {
  const actual = existsSync(markdownRoot) ? markdownFiles(markdownRoot) : [];
  const stale = [...expected].filter(([path, content]) => !existsSync(path) || readFileSync(path, "utf8") !== content);
  const extra = actual.filter((path) => !expected.has(path));
  if (stale.length || extra.length) {
    throw new Error(`AI documentation is stale: ${stale.length} missing/changed, ${extra.length} extra. Run pnpm --dir site llms.`);
  }
  process.stdout.write(`AI documentation current: ${pages.length} Markdown pages and llms.txt\n`);
} else {
  rmSync(markdownRoot, { recursive: true, force: true });
  for (const [path, content] of expected) {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content);
  }
  process.stdout.write(`Generated ${pages.length} AI Markdown pages and llms.txt\n`);
}
