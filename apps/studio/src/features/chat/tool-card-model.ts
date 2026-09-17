import type { Inline, Tone } from "@/components/studio"
import type { ToolContext } from "./tool-context"
import type { ToolAction, ToolView } from "./tool-views"

type ToolCardFields = {
  readonly hidden: object
  readonly progress: { readonly label: Inline }
  readonly card: {
    readonly tone: Tone
    readonly title: Inline
    readonly lines: readonly Inline[]
    readonly actions: readonly ToolAction[]
  }
}

export type ToolCardKind = keyof ToolCardFields

export type ToolCardModel<K extends ToolCardKind = ToolCardKind> = {
  [P in K]: { readonly kind: P } & Readonly<ToolCardFields[P]>
}[K]

export type ToolCallSnapshot = {
  readonly toolName: string
  readonly args: unknown
  readonly result: unknown
  readonly artifact: unknown
  readonly isError: boolean
  readonly statusType: string
}

const HIDDEN: ToolCardModel<"hidden"> = { kind: "hidden" }

const errorCard = (part: ToolCallSnapshot, { t }: ToolContext): ToolCardModel<"card"> => ({
  kind: "card",
  tone: "destructive",
  title: part.toolName,
  lines: [t("tool.error")],
  actions: [],
})

const isFailed = (part: ToolCallSnapshot): boolean => part.isError || part.statusType === "incomplete"

const pendingModel = <A, R, P>(args: A, artifact: unknown, view: ToolView<A, R, P>, ctx: ToolContext): ToolCardModel => {
  if (!view.guards.progress(artifact)) return HIDDEN
  return { kind: "progress", label: view.progress(args, artifact, ctx) }
}

export const presentToolCall = <A, R, P>(part: ToolCallSnapshot, view: ToolView<A, R, P>, ctx: ToolContext): ToolCardModel => {
  const { args, result, artifact } = part
  if (!view.guards.args(args) || isFailed(part)) return errorCard(part, ctx)
  if (result === undefined) return pendingModel(args, artifact, view, ctx)
  if (!view.guards.result(result)) return errorCard(part, ctx)
  return {
    kind: "card",
    tone: "llm",
    title: view.title(args, result, ctx),
    lines: view.lines(result, ctx),
    actions: view.actions(args, result, ctx),
  }
}
