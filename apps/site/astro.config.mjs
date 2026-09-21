import mermaid from "astro-mermaid";
import { unified } from "@astrojs/markdown-remark";
import starlight from "@astrojs/starlight";
import { defineConfig } from "astro/config";
import lucode from "lucode-starlight";
import { replaceDocsTokens } from "./docs.tokens.mjs";

export default defineConfig({
  site: "https://aqvenstudio.com",
  markdown: { processor: unified({ remarkPlugins: [replaceDocsTokens] }) },
  redirects: {
    "/": "/start/",
    "/getting-started": "/engineering/quickstart",
    "/core-concepts": "/engineering/architecture",
    "/building-flows": "/engineering/flows",
    "/writing-prompts": "/engineering/prompts",
    "/models-and-providers": "/engineering/agents-and-models",
    "/structured-output-and-types": "/engineering/types",
    "/designing-reliable-workflows": "/engineering/designing-workflows",
    "/testing-and-evaluation": "/engineering/testing-and-evaluation",
    "/for-ai-agents": "/engineering/ai-coding-agents",
    "/examples": "/engineering/example-workflow",
    "/reference/cli": "/engineering/cli-reference",
    "/reference/python-api": "/engineering/reference/python-api",
    "/reference/http-api": "/engineering/runs-and-integration",
    "/reference/configuration": "/engineering/project-layout",
    "/reference/diagnostics": "/engineering/testing-and-evaluation",
    "/engineering/reference": "/reference",
  },
  integrations: [
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
          items: [],
        },
        {
          label: "Studio",
          items: [],
        },
        {
          label: "MCP & CLI",
          items: [],
        },
        {
          label: "Integrations",
          items: [],
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
