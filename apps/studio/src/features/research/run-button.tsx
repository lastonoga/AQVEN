import { Play } from "lucide-react"
import { Actions } from "@/components/studio"
import type { Launch } from "./use-launch"

export function RunButton({ launch, label }: { readonly launch: Launch; readonly label: string }) {
  const { request } = launch
  return (
    <Actions
      actions={[
        {
          id: "run",
          label,
          variant: "default",
          icon: Play,
          disabled: request === null,
          pending: launch.action.pending("start"),
          ...(request === null ? {} : { onClick: () => { launch.start(request) } }),
        },
      ]}
    />
  )
}
