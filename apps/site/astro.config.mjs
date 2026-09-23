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
    "/engineering/reference": "/reference",
  },
  integrations: [
    react(),
    mermaid({
      theme: "forest",
      autoTheme: true,
    }),
    starlight({
      title: "aqven",
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
              ],
            },
            {
              label: "Datasets & evals",
              items: [{ slug: "engine/custom-evaluator" }],
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
              label: "Test",
              items: [
                { slug: "studio/datasets" },
                { slug: "studio/evals" },
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
              label: "Edit, check & test",
              items: [
                { slug: "mcp-cli/edit-a-flow" },
                { slug: "mcp-cli/preview-a-prompt" },
                { slug: "mcp-cli/check-and-test" },
                { slug: "mcp-cli/runs" },
                { slug: "mcp-cli/datasets-and-evals" },
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
              ],
            },
            {
              label: "Debugging and changing a project",
              items: [
                { slug: "concepts/engineering-loop" },
                { slug: "concepts/finding-the-node-that-went-wrong" },
                { slug: "concepts/two-ways-to-change-a-project" },
                { slug: "concepts/designing-reliable-workflows" },
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
