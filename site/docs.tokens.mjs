// Edit these values when the packages are published or renamed.
// The names below are visible placeholders until release.
export const docsTokens = Object.freeze({
  PYTHON_PACKAGE: "AQVEN_PYTHON_PACKAGE",
  STUDIO_PACKAGE: "AQVEN_STUDIO_PACKAGE",
  CLI_COMMAND: "aqven",
  PYTHON_MODULE: "aqven",
  LLM_PYTHON_MODULE: "aqven_llm",
});

const tokenPattern = /\{\{([A-Z_]+)\}\}/g;
const codeTitles = Object.freeze({
  bash: "Terminal",
  console: "Terminal",
  json: "JSON",
  python: "Python",
  sh: "Terminal",
  text: "Text",
  toml: "TOML",
  yaml: "YAML",
  yml: "YAML",
});

export function replaceDocsTokens() {
  return (tree) => {
    const visit = (node) => {
      if (typeof node.value === "string") {
        node.value = node.value.replace(tokenPattern, (full, key) => docsTokens[key] ?? full);
      }
      if (node.type === "code" && !node.meta && node.lang) {
        const title = codeTitles[node.lang] ?? node.lang.toUpperCase();
        node.meta = `title=\"${title}\"`;
      }
      if (Array.isArray(node.children)) node.children.forEach(visit);
    };
    visit(tree);
  };
}
