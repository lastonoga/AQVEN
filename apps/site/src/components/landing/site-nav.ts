import { USE_CASES_PATH } from "@/components/landing/situations";
import { COMPARE_PATH } from "@/components/landing/compare-path";

export const REPO = "https://github.com/lastonoga/AQVEN";
export const DOCS = "/start/";
export const QUICKSTART = "/start/quickstart/";

export const LOGO = { url: "/", title: "aqven" };

export const MENU = [
  { title: "Use cases", url: USE_CASES_PATH },
  { title: "Compare", url: COMPARE_PATH },
  { title: "Documentation", url: DOCS },
  { title: "Engine", url: "/engine/" },
  { title: "Studio", url: "/studio/" },
];

export const AUTH = {
  login: { title: "GitHub", url: REPO },
  signup: { title: "Get started", url: QUICKSTART },
};

export const FOOTER_LOGO = { url: "/", src: "/favicon.svg", alt: "AQVEN", title: "AQVEN" };

export const FOOTER_DESCRIPTION = "Python framework and local Studio for reliable LLM workflows. Source-available.";

export const FOOTER_SECTIONS = [
  {
    title: "Documentation",
    links: [
      { name: "Overview", href: DOCS },
      { name: "Use cases", href: USE_CASES_PATH },
      { name: "Compare", href: COMPARE_PATH },
      { name: "Engine", href: "/engine/" },
      { name: "Studio", href: "/studio/" },
      { name: "Concepts", href: "/concepts/" },
    ],
  },
  {
    title: "Build",
    links: [
      { name: "Workflows", href: "/concepts/files-as-source-of-truth/" },
      { name: "Nodes", href: "/concepts/ten-kinds-of-nodes/" },
      { name: "Prompts", href: "/engine/prompts/" },
      { name: "Tools", href: "/engine/tool-node/" },
    ],
  },
  {
    title: "Improve",
    links: [
      { name: "Runs", href: "/studio/investigate-a-run/" },
      { name: "Cases", href: "/studio/cases/" },
      { name: "Experiments", href: "/studio/research/" },
      { name: "Debugging", href: "/concepts/finding-the-node-that-went-wrong/" },
    ],
  },
];

export const FOOTER_COPYRIGHT = "AQVEN. Source available.";

export const FOOTER_LEGAL = [{ name: "GitHub", href: REPO }];
