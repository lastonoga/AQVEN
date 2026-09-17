import type { ReactNode } from "react"
import { ToolCard, type ToolPartProps } from "./tool-card"
import { PATCH_SPEC_VIEW, READ_RUN_VIEW, RUN_DATASET_VIEW, type ToolView } from "./tool-views"

type ToolCardRender = (part: ToolPartProps) => ReactNode

const toolCard =
  <A, R, P>(view: ToolView<A, R, P>): ToolCardRender =>
  (part) => <ToolCard part={part} view={view} />

export const TOOL_CARDS = {
  read_run: toolCard(READ_RUN_VIEW),
  patch_spec: toolCard(PATCH_SPEC_VIEW),
  run_dataset: toolCard(RUN_DATASET_VIEW),
} as const satisfies Readonly<Record<string, ToolCardRender>>
