import type { Tone } from "@/components/studio"
import type { Translator } from "@/i18n/translator"
import type { ChatToolStatus, ToolFacet, ToolSnapshot } from "./chat-events"

export type ToolCardModel = { readonly tone: Tone; readonly title: string; readonly lines: readonly string[]; readonly truncated: boolean }

type FacetKind = ToolFacet["kind"]
type FacetOf<K extends FacetKind> = Extract<ToolFacet, { readonly kind: K }>
type FacetCard = { readonly title: string; readonly lines: readonly string[] }

const FAILED: readonly ChatToolStatus[] = ["error", "denied", "interrupted"]

const nonEmpty = (lines: readonly (string | null)[]): readonly string[] => lines.filter((line): line is string => line !== null && line.length > 0)

const exitLine = (facet: FacetOf<"command">, t: Translator<"chat">): string | null =>
  facet.exitCode === null ? null : t("tool.exitCode", { code: String(facet.exitCode) })

const FACET_CARD: { readonly [K in FacetKind]: (facet: FacetOf<K>, part: ToolSnapshot, t: Translator<"chat">) => FacetCard } = {
  command: (facet, _part, t) => ({
    title: facet.command,
    lines: nonEmpty([facet.description, exitLine(facet, t), facet.preview]),
  }),
  fileEdit: (facet, _part, t) => ({
    title: facet.path,
    lines: nonEmpty([t(`tool.fileChange.${facet.change}`), facet.diff]),
  }),
  result: (facet, part, t) => ({
    title: part.mcpServer === null ? part.toolName : t("tool.mcp", { server: part.mcpServer, tool: part.toolName }),
    lines: nonEmpty([part.argsText, facet.preview]),
  }),
}

const facetCard = <K extends FacetKind>(facet: FacetOf<K>, part: ToolSnapshot, t: Translator<"chat">): FacetCard => {
  const build: (facet: FacetOf<K>, part: ToolSnapshot, t: Translator<"chat">) => FacetCard = FACET_CARD[facet.kind]
  return build(facet, part, t)
}

const pendingCard = (part: ToolSnapshot, t: Translator<"chat">): FacetCard => ({
  title: part.toolName,
  lines: nonEmpty([part.argsText, t("tool.running")]),
})

const statusTone = (status: ChatToolStatus | null): Tone => (status !== null && FAILED.includes(status) ? "destructive" : "tool")

export const presentToolCall = (part: ToolSnapshot, t: Translator<"chat">): ToolCardModel => {
  const card = part.facet === null ? pendingCard(part, t) : facetCard(part.facet, part, t)
  const truncated = part.facet?.kind === "command" || part.facet?.kind === "result" ? part.facet.truncated : false
  return { tone: statusTone(part.status), truncated, ...card }
}
