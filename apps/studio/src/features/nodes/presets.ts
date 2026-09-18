import type { Tone } from "@/components/studio"
import type { BindingOrigin } from "./presenters"

export const NODE_LIST_WIDTH = 276

export const TABLE_MIN_WIDTH = 720

export const NODE_INDENT_STEP = 14

export const BINDING_ORIGIN_TONE: Readonly<Record<BindingOrigin, Tone>> = {
  input: "primary",
  node: "tool",
  run: "neutral",
  iter: "loop",
  branch: "loop",
  literal: "neutral",
  unbound: "destructive",
}
