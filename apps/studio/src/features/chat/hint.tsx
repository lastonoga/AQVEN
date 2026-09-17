import type { ReactElement } from "react"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

export type HintProps = { readonly label: string; readonly children: ReactElement }

export function Hint({ label, children }: HintProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent className="dark">{label}</TooltipContent>
    </Tooltip>
  )
}
