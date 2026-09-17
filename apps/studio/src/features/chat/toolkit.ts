import { defineToolkit } from "@assistant-ui/react"
import { TOOL_CARDS } from "./tool-cards"

export const studioToolkit = defineToolkit({
  read_run: { type: "backend", render: TOOL_CARDS.read_run },
  patch_spec: { type: "backend", render: TOOL_CARDS.patch_spec },
  run_dataset: { type: "backend", render: TOOL_CARDS.run_dataset },
})
