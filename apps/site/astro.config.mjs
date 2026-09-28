import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import react from "@astrojs/react";
import sitemap from "@astrojs/sitemap";
import tailwindcss from "@tailwindcss/vite";
import mermaid from "astro-mermaid";
import { unified } from "@astrojs/markdown-remark";
import starlight from "@astrojs/starlight";
import { defineConfig } from "astro/config";
import lucode from "lucode-starlight";
import { replaceDocsTokens } from "./docs.tokens.mjs";

const SITE = "https://aqvenstudio.com";
const SITE_DESCRIPTION =
  "AQVEN is a Python framework and a local Studio for AI workflows. Your coding agent runs the experiments, you see the evidence and decide.";
const SOCIAL_CARD = Object.freeze({
  url: `${SITE}/og.png`,
  width: "1200",
  height: "630",
  alt: "AQVEN Studio showing the graph of a multi-step AI workflow",
});

const SITE_ROOT = fileURLToPath(new URL(".", import.meta.url));
const DOCS_ROOT = "src/content/docs";
const DOCS_SOURCE_SUFFIXES = Object.freeze([".md", ".mdx", "/index.md", "/index.mdx"]);
const PAGE_SOURCES = Object.freeze({
  "/": ["src/pages/index.astro", "src/components/landing", "src/components/hero206.tsx"],
  "/use-cases/": [
    "src/pages/use-cases.astro",
    "src/components/landing/use-cases.tsx",
    "src/components/landing/situations.ts",
  ],
});

const docsSources = (pathname) => {
  const slug = pathname.replace(/^\/|\/$/g, "");
  return DOCS_SOURCE_SUFFIXES.map((suffix) => `${DOCS_ROOT}/${slug}${suffix}`);
};

const sourcesOf = (pathname) =>
  (PAGE_SOURCES[pathname] ?? docsSources(pathname)).filter((path) => existsSync(`${SITE_ROOT}${path}`));

const lastCommitDate = (paths) => {
  if (paths.length === 0) return undefined;
  try {
    const date = execFileSync("git", ["log", "-1", "--format=%cI", "--", ...paths], {
      cwd: SITE_ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    return date === "" ? undefined : date;
  } catch {
    return undefined;
  }
};

const withLastmod = (item) => {
  const lastmod = lastCommitDate(sourcesOf(new URL(item.url).pathname));
  if (lastmod === undefined) return item;
  return { ...item, lastmod };
};

export default defineConfig({
  site: SITE,
  vite: { plugins: [tailwindcss()] },
  markdown: { processor: unified({ remarkPlugins: [replaceDocsTokens] }) },
  redirects: {
    "/engineering/reference": "/reference",
  },
  integrations: [
    react(),
    sitemap({ serialize: withLastmod }),
    mermaid({
      theme: "forest",
      autoTheme: true,
    }),
    starlight({
      title: "AQVEN",
      description: SITE_DESCRIPTION,
      head: [
        { tag: "meta", attrs: { property: "og:image", content: SOCIAL_CARD.url } },
        { tag: "meta", attrs: { property: "og:image:width", content: SOCIAL_CARD.width } },
        { tag: "meta", attrs: { property: "og:image:height", content: SOCIAL_CARD.height } },
        { tag: "meta", attrs: { property: "og:image:alt", content: SOCIAL_CARD.alt } },
        { tag: "meta", attrs: { name: "twitter:image", content: SOCIAL_CARD.url } },
        { tag: "meta", attrs: { name: "twitter:image:alt", content: SOCIAL_CARD.alt } },
      ],
      routeMiddleware: "./src/route-data.ts",
      expressiveCode: { emitExternalStylesheet: false },
      customCss: ["./src/styles/aqven-landing.css"],
      plugins: [
        lucode({
          navLinks: [
            { label: "Start", link: "/start/" },
            { label: "Engine", link: "/engine/" },
            { label: "Studio", link: "/studio/" },
            { label: "MCP & CLI", link: "/mcp-cli/" },
            { label: "Integrations", link: "/integrations/" },
            { label: "Concepts", link: "/concepts/" },
            { label: "Reference", link: "/reference/" },
          ],
        }),
      ],
      favicon: "/favicon.svg",
      social: [
        { icon: "github", label: "GitHub", href: "https://github.com/lastonoga/AQVEN" },
      ],
      components: { Sidebar: "./src/components/ManualSidebar.astro" },
      sidebar: [
        {
          label: "Start",
          items: [
            { slug: "start" },
            {
              label: "Get started",
              items: [
                { slug: "start/quickstart" },
                { slug: "start/engineering-loop-walkthrough" },
                { slug: "start/a-day-with-aqven" },
                { slug: "start/where-next" },
              ],
            },
          ],
        },
        {
          label: "Engine",
          items: [
            { slug: "engine" },
            {
              label: "Node kinds",
              items: [
                { slug: "engine/llm-node" },
                { slug: "engine/code-node" },
                { slug: "engine/tool-node" },
                { slug: "engine/human-node" },
                { slug: "engine/parallel-node" },
                { slug: "engine/map-node" },
                { slug: "engine/switch-node" },
                { slug: "engine/loop-node" },
                { slug: "engine/call-node" },
                { slug: "engine/narrow-node" },
              ],
            },
            {
              label: "Prompts & data shape",
              items: [
                { slug: "engine/prompts" },
                { slug: "engine/field-constraints" },
                { slug: "engine/dynamic-shape" },
                { slug: "engine/display-templates" },
                { slug: "engine/image-preparation" },
              ],
            },
            {
              label: "Examples",
              items: [
                { slug: "engine/snippets" },
                { slug: "engine/lumen-patterns" },
              ],
            },
            {
              label: "Checks & experiments",
              items: [
                { slug: "engine/dataset-media-files" },
                { slug: "engine/experiments" },
                { slug: "engine/run-a-series" },
                { slug: "engine/read-a-series" },
                { slug: "engine/custom-evaluator" },
              ],
            },
            {
              label: "CLI tooling",
              items: [
                { slug: "engine/check" },
                { slug: "engine/generate-types" },
                { slug: "engine/inspect-project" },
                { slug: "engine/run-locally" },
                { slug: "engine/secrets" },
                { slug: "engine/check-providers" },
                { slug: "engine/check-shapes" },
              ],
            },
          ],
        },
        {
          label: "Studio",
          items: [
            { slug: "studio" },
            {
              label: "Get started",
              items: [
                { slug: "studio/first-workflow" },
                { slug: "studio/open-a-project" },
                { slug: "studio/read-the-dev-console" },
              ],
            },
            {
              label: "Read & respond",
              items: [
                { slug: "studio/understand-the-graph" },
                { slug: "studio/investigate-a-run" },
                { slug: "studio/respond-to-a-review" },
              ],
            },
            {
              label: "Cases & research",
              items: [
                { slug: "studio/cases" },
                { slug: "studio/research" },
                { slug: "studio/series" },
              ],
            },
            {
              label: "Chat & settings",
              items: [
                { slug: "studio/chat" },
                { slug: "studio/settings" },
              ],
            },
          ],
        },
        {
          label: "MCP & CLI",
          items: [
            { slug: "mcp-cli" },
            {
              label: "Connect & read a project",
              items: [
                { slug: "mcp-cli/connect-an-agent" },
                { slug: "mcp-cli/set-up-an-agent-outside-studio" },
                { slug: "mcp-cli/read-project-structure" },
              ],
            },
            {
              label: "Edit, check & run",
              items: [
                { slug: "mcp-cli/edit-a-flow" },
                { slug: "mcp-cli/preview-a-prompt" },
                { slug: "mcp-cli/check-and-test" },
                { slug: "mcp-cli/runs" },
              ],
            },
            {
              label: "Experiments",
              items: [
                { slug: "mcp-cli/research-loop" },
                { slug: "mcp-cli/experiments-and-series" },
              ],
            },
          ],
        },
        {
          label: "Integrations",
          items: [
            { slug: "integrations" },
            {
              label: "Connect",
              items: [
                { slug: "integrations/model-providers" },
                { slug: "integrations/openrouter-model-selection" },
                { slug: "integrations/external-mcp-servers" },
                { slug: "integrations/secrets-and-environment" },
              ],
            },
          ],
        },
        {
          label: "Concepts",
          items: [
            { slug: "concepts" },
            {
              label: "Foundations",
              items: [
                { slug: "concepts/what-this-is-built-on" },
                { slug: "concepts/run-survives-a-crash" },
                { slug: "concepts/files-as-source-of-truth" },
              ],
            },
            {
              label: "How a step runs",
              items: [
                { slug: "concepts/agent-inference-and-the-llm-node" },
                { slug: "concepts/ten-kinds-of-nodes" },
                { slug: "concepts/three-prompt-levels" },
                { slug: "concepts/five-dynamic-shape-cases" },
                { slug: "concepts/what-happens-when-a-model-is-called" },
                { slug: "concepts/media-has-real-limits-on-both-sides" },
                { slug: "concepts/schema-state-space" },
                { slug: "concepts/answer-refusal-and-unknown" },
              ],
            },
            {
              label: "Debugging and changing a project",
              items: [
                { slug: "concepts/engineering-loop" },
                { slug: "concepts/stage-exit-criteria" },
                { slug: "concepts/finding-the-node-that-went-wrong" },
                { slug: "concepts/two-ways-to-change-a-project" },
                { slug: "concepts/designing-reliable-workflows" },
              ],
            },
            {
              label: "Experiments",
              items: [
                { slug: "concepts/experiments-series-and-findings" },
                { slug: "concepts/how-a-series-decides" },
                { slug: "concepts/hypothesis-categories" },
                { slug: "concepts/literature-scan" },
                { slug: "concepts/case-construction" },
                { slug: "concepts/metrics-and-controls" },
                { slug: "concepts/validity-gate" },
                { slug: "concepts/research-journal" },
              ],
            },
          ],
        },
        {
          label: "Reference",
          items: [{ autogenerate: { directory: "reference" } }],
        },
      ],
    }),
  ],
});
