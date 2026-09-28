import { defineRouteMiddleware } from "@astrojs/starlight/route-data";
import { getEntry } from "astro:content";

const DOCS_ROOT = "src/content/docs/";
const MARKDOWN_EXTENSION = ".md";
const MARKDOWN_COPIES_PATH = "/llms/";

const markdownCopySlug = (filePath: string | undefined): string | undefined => {
  if (!filePath?.startsWith(DOCS_ROOT)) return undefined;
  if (!filePath.endsWith(MARKDOWN_EXTENSION)) return undefined;
  return filePath.slice(DOCS_ROOT.length);
};

export const onRequest = defineRouteMiddleware(async (context) => {
  const route = context.locals.starlightRoute;
  const stored = await getEntry("docs", route.entry.id);
  const slug = markdownCopySlug(stored?.filePath);
  if (!slug) return;
  route.head.push({
    tag: "link",
    attrs: {
      rel: "alternate",
      type: "text/markdown",
      href: new URL(`${MARKDOWN_COPIES_PATH}${slug}`, context.site ?? context.url).href,
    },
  });
});
