import mermaid from "astro-mermaid";
import starlight from "@astrojs/starlight";
import { defineConfig } from "astro/config";

export default defineConfig({
  site: "https://aqvenstudio.com",
  integrations: [
    mermaid({
      theme: "forest",
      autoTheme: true,
    }),
    starlight({
      title: "AQVEN",
      description: "Engineer AI systems, not just prompts.",
      favicon: "/favicon.svg",
      social: [
        { icon: "github", label: "GitHub", href: "https://github.com/lastonoga/AQVEN" },
      ],
      sidebar: [
        {
          label: "Guide",
          items: [
            { slug: "getting-started" },
            { slug: "core-concepts" },
            { slug: "building-flows" },
            { slug: "writing-prompts" },
            { slug: "models-and-providers" },
            { slug: "designing-reliable-workflows" },
            { slug: "structured-output-and-types" },
            { slug: "testing-and-evaluation" },
          ],
        },
        {
          label: "Reference",
          items: [
            { slug: "reference/cli" },
            { slug: "reference/python-api" },
            { slug: "reference/http-api" },
            { slug: "reference/configuration" },
            { slug: "reference/diagnostics" },
          ],
        },
        { slug: "for-ai-agents" },
        { slug: "examples" },
      ],
    }),
  ],
});
