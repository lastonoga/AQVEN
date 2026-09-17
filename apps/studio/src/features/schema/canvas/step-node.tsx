import { use } from "react"
import type { NodeProps } from "@xyflow/react"
import { cn } from "cn"
import type { ModelFamily, StepMarker } from "@/domain"
import { Dot, NODE_KIND, Surface, Tag, Text } from "@/components/studio"
import { STEP_HANDLES } from "./handles"
import { STEP_MARKER } from "./markers"
import { NodeHandles } from "./node-handles"
import { SelectedNodeContext } from "./selection"
import type { CanvasSize, StepFlowNode } from "./to-flow"

const STEP_LAYOUT: Readonly<Record<CanvasSize, string>> = {
  md: "gap-1.5 px-3.25 py-2.75",
  sm: "gap-1 px-3 py-2.5",
}

function MarkerGlyph({ marker }: { readonly marker: StepMarker | undefined }) {
  if (marker === undefined) return null
  const spec = STEP_MARKER[marker]
  return (
    <Text role="item" weight="semibold" tone={spec.tone} className="ml-auto shrink-0">
      {spec.glyph}
    </Text>
  )
}

function FamilyDot({ family }: { readonly family: ModelFamily | undefined }) {
  if (family === undefined) return null
  return <Dot tone={family} size="md" />
}

export function StepNode({ id, data }: NodeProps<StepFlowNode>) {
  const selected = use(SelectedNodeContext) === id
  const kind = NODE_KIND[data.kind]
  const [input, output] = data.io
  return (
    <Surface
      variant="raised"
      radius="lg"
      accent="left-4"
      tone={kind.tone}
      interactive={data.inspectable}
      selected={selected}
      className={cn("flex h-full w-full flex-col", STEP_LAYOUT[data.size])}
    >
      <div className="flex min-w-0 items-center gap-1.75">
        <Tag size="sm" tone={kind.tone}>
          {kind.code}
        </Tag>
        <Text role="block" weight="semibold" truncate>
          {data.name}
        </Text>
        <MarkerGlyph marker={data.marker} />
      </div>
      <div className="flex min-w-0 items-center gap-1.5">
        <FamilyDot family={data.family} />
        <Text role="cell" weight="medium" truncate>
          {data.meta}
        </Text>
      </div>
      <div className="flex min-w-0 items-center gap-3">
        <Text role="body" tone="neutral" truncate>
          {input}
        </Text>
        <Text role="body" tone="neutral" className="ml-auto shrink-0">
          {output}
        </Text>
      </div>
      <NodeHandles specs={STEP_HANDLES} />
    </Surface>
  )
}
