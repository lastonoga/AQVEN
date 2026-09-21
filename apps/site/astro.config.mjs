import react from "@astrojs/react";
import tailwindcss from "@tailwindcss/vite";
import mermaid from "astro-mermaid";
import { unified } from "@astrojs/markdown-remark";
import starlight from "@astrojs/starlight";
import { defineConfig } from "astro/config";
import lucode from "lucode-starlight";
import { replaceDocsTokens } from "./docs.tokens.mjs";

export default defineConfig({
  site: "https://aqvenstudio.com",
  vite: { plugins: [tailwindcss()] },
  markdown: { processor: unified({ remarkPlugins: [replaceDocsTokens] }) },
  redirects: {
    "/": "/start/",
    "/engineering/reference": "/reference",
  },
  integrations: [
    react(),
    mermaid({
      theme: "forest",
      autoTheme: true,
    }),
    starlight({
      title: "AQVEN",
      description: "Engineer AI systems, not just prompts.",
      expressiveCode: { emitExternalStylesheet: false },
      customCss: ["./src/styles/aqven-landing.css"],
      plugins: [
        lucode({
          navLinks: [
            { label: "Start", link: "/start/" },
            { label: "Engine", link: "/engine/" },
            { label: "Studio", link: "/studio/" },
            { label: "MCP & CLI", link: "/mcp-cli/" },
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
            { slug: "start/quickstart" },
            { slug: "start/engineering-loop-walkthrough" },
            { slug: "start/where-next" },
          ],
        },
        {
          label: "Engine",
          items: [
            { slug: "engine" },
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
            { slug: "engine/prompts" },
            { slug: "engine/dynamic-shape" },
            { slug: "engine/check" },
            { slug: "engine/generate-types" },
            { slug: "engine/inspect-project" },
            { slug: "engine/run-locally" },
            { slug: "engine/secrets" },
            { slug: "engine/check-providers" },
          ],
        },
        {
          label: "Studio",
          items: [
            { slug: "studio" },
            { slug: "studio/first-workflow" },
            { slug: "studio/understand-the-graph" },
            { slug: "studio/investigate-a-run" },
            { slug: "studio/respond-to-a-review" },
            { slug: "studio/datasets" },
            { slug: "studio/evals" },
            { slug: "studio/chat" },
            { slug: "studio/settings" },
            { slug: "studio/open-a-project" },
          ],
        },
        {
          label: "MCP & CLI",
          items: [
            { slug: "mcp-cli" },
            { slug: "mcp-cli/connect-an-agent" },
            { slug: "mcp-cli/check-and-test" },
            { slug: "mcp-cli/edit-a-flow" },
            { slug: "mcp-cli/read-project-structure" },
            { slug: "mcp-cli/runs" },
            { slug: "mcp-cli/datasets-and-evals" },
            { slug: "mcp-cli/preview-a-prompt" },
          ],
        },
        {
          label: "Integrations",
          items: [
            { slug: "integrations" },
            { slug: "integrations/model-providers" },
            { slug: "integrations/external-mcp-servers" },
            { slug: "integrations/secrets-and-environment" },
          ],
        },
        {
          label: "Reference",
          items: [{ autogenerate: { directory: "reference" } }],
        },
        {
          label: "Concepts",
          items: [
            { slug: "concepts/what-this-is-built-on" },
            { slug: "concepts/engineering-loop" },
          ],
        },
      ],
    }),
  ],
});
