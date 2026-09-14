import { isRecord } from "./guards.js"
import { previewOf } from "./preview.js"
import type { RunDetail } from "../api/types.js"
import type { RunSnapshot, ValuePreview } from "./types.js"

export const runSnapshot = (detail: RunDetail | null | undefined): RunSnapshot | null => {
  if (detail === null || detail === undefined) return null
  return { input: detail.run.input, renders: detail.renders ?? {} }
}

export const recordedSlot = (
  run: RunSnapshot | null,
  nodeId: string,
  slot: string,
): { value: unknown; preview: ValuePreview } | null => {
  const render = run?.renders[nodeId]
  if (render === undefined) return null
  if (!isRecord(render.input)) return null
  if (!(slot in render.input)) return null
  const value = render.input[slot]
  return { value, preview: previewOf(value) }
}

export const recordedOutput = (
  run: RunSnapshot | null,
  nodeId: string,
): { value: unknown; preview: ValuePreview } | null => {
  const render = run?.renders[nodeId]
  if (render === undefined) return null
  return { value: render.output, preview: previewOf(render.output) }
}
