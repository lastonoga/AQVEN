import { Outlet } from "@tanstack/react-router"
import type { RunRef } from "@/domain"
import { Surface, Toolbar } from "@/components/studio"
import { ModeTabs } from "./mode-tabs"
import { RunBadge } from "./run-badge"

export function WorkspaceFrame({ latestRun }: { readonly latestRun: RunRef | null }) {
  return (
    <div className="h-full min-h-0 min-w-0 pt-2 pr-2 pb-2">
      <Surface variant="frame" className="grid h-full grid-rows-[48px_minmax(0,1fr)]">
        <Surface variant="bar" asChild>
          <Toolbar size="lg" end={<RunBadge run={latestRun} />}>
            <ModeTabs />
          </Toolbar>
        </Surface>
        <div className="relative grid min-h-0 grid-cols-[minmax(0,1fr)] grid-rows-[minmax(0,1fr)] overflow-hidden">
          <Outlet />
        </div>
      </Surface>
    </div>
  )
}
