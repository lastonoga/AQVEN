import starlight from "@astrojs/starlight";
import { defineConfig } from "astro/config";

export default defineConfig({
  site: "https://aqvenstudio.com",
  integrations: [
    starlight({
      title: "AQVEN",
      description: "Engineer AI systems, not just prompts.",
      favicon: "/favicon.svg",
      social: [
        { icon: "github", label: "GitHub", href: "https://github.com/lastonoga/AQVEN" },
      ],
    }),
  ],
});
