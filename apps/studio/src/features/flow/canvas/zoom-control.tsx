import { useReactFlow, useViewport, type FitViewOptions } from "@xyflow/react"
import { Minus, Plus, type LucideIcon } from "lucide-react"
import { useTranslations } from "use-intl"
import { Surface, Text } from "@/components/studio"
import { Button } from "@/components/ui/button"
import type { CanvasFlowNode } from "./to-flow"
import { ZOOM_DURATION_MS, zoomedIn, zoomedOut } from "./viewport"

export type ZoomControlProps = { readonly fitOptions: FitViewOptions<CanvasFlowNode> }

type ZoomStep = { readonly label: "outAria" | "inAria"; readonly icon: LucideIcon; readonly next: (zoom: number) => number }

const ZOOM_OUT: ZoomStep = { label: "outAria", icon: Minus, next: zoomedOut }
const ZOOM_IN: ZoomStep = { label: "inAria", icon: Plus, next: zoomedIn }

function ZoomStepButton({ step }: { readonly step: ZoomStep }) {
  const t = useTranslations("flow.zoom")
  const { zoomTo, getZoom } = useReactFlow<CanvasFlowNode>()
  const Icon = step.icon
  return (
    <Button
      variant="ghost"
      size="icon-xs"
      aria-label={t(step.label)}
      onClick={() => {
        void zoomTo(step.next(getZoom()), { duration: ZOOM_DURATION_MS })
      }}
    >
      <Icon aria-hidden />
    </Button>
  )
}

export function ZoomControl({ fitOptions }: ZoomControlProps) {
  const t = useTranslations("flow.zoom")
  const { fitView } = useReactFlow<CanvasFlowNode>()
  const { zoom } = useViewport()
  return (
    <Surface variant="panel" radius="md" className="flex items-center gap-px p-0.75">
      <ZoomStepButton step={ZOOM_OUT} />
      <Button
        variant="ghost"
        size="xs"
        aria-label={t("fitAria")}
        className="min-w-13"
        onClick={() => {
          void fitView(fitOptions)
        }}
      >
        <Text role="body" weight="medium" tone="default">
          {t("percent", { zoom })}
        </Text>
      </Button>
      <ZoomStepButton step={ZOOM_IN} />
    </Surface>
  )
}
