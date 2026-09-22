import { Outlet } from "@tanstack/react-router"
import type { ApiFlow, ApiFlowDetail, ApiProject } from "@/domain"
import { Surface, Toolbar } from "@/components/studio"
import { FlowPicker } from "./flow-picker"
import { FlowTabs } from "./flow-tabs"
import { RunBadge } from "./run-badge"

export type FlowFrameProps = {
  readonly project: ApiProject
  readonly flows: readonly ApiFlow[]
  readonly flow: ApiFlowDetail
  readonly onOpenSettings: () => void
}

export function FlowFrame({ project, flows, flow, onOpenSettings }: FlowFrameProps) {
  return (
    <div className="h-full min-h-0 min-w-0 pt-2 pr-2 pb-2">
      <Surface variant="frame" className="grid h-full grid-rows-[48px_minmax(0,1fr)]">
        <Surface variant="bar" asChild>
          <Toolbar
            size="lg"
            end={<RunBadge run={flow.last_run} />}
          >
            <FlowPicker project={project} flows={flows} flow={flow} onOpenSettings={onOpenSettings} />
            <FlowTabs />
          </Toolbar>
        </Surface>
        <div className="relative grid min-h-0 grid-cols-[minmax(0,1fr)] grid-rows-[minmax(0,1fr)] overflow-hidden">
          <Outlet />
        </div>
      </Surface>
    </div>
  )
}
