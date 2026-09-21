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
