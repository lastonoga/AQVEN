import { ViewportPortal } from "@xyflow/react"
import type { CanvasStage } from "@/domain"
import { Surface, Tag } from "@/components/studio"
import { useStageFocus } from "./use-stage-focus"

const TAG_GAP = 20

export function StageSpotlight({ stage }: { readonly stage: CanvasStage | null }) {
  useStageFocus(stage)
  if (stage === null) return null
  const { rect } = stage
  return (
    <ViewportPortal>
      <Surface
        variant="spotlight"
        tone="llm"
        className="absolute z-10"
        style={{ left: rect.x, top: rect.y, width: rect.width, height: rect.height }}
      />
      <Tag size="canvas" fill="solid" tone="llm" className="absolute z-10" style={{ left: rect.x, top: rect.y + rect.height + TAG_GAP }}>
        {stage.title}
      </Tag>
    </ViewportPortal>
  )
}
