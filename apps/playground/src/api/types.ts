export type FlowStatus = "ok" | "fail"

export type FlowSummary = {
  id: string
  version: number
  file: string
  nodes: number
  status: FlowStatus
  irHash?: string
}

export type Diagnostic = {
  code: string
  message: string
  nodeId?: string
  slot?: string
}

export type IrNode = Record<string, unknown> & { kind: string }

export type IrComponent = {
  name: string
  out: { type: string; from: string }
  nodes: Record<string, IrNode>
}

export type Ir = {
  flow: string
  version: number
  input: string
  output: { type: string; from: string }
  context?: string[]
  budget?: object
  policies?: object
  defaults?: object
  components: Record<string, IrComponent>
  nodes: Record<string, IrNode>
}

export type FlowDetail = { ir: Ir; synthMs: number }

export type ServerEvent =
  | { t: "synth"; flows: string[]; ms: number }
  | { t: "diagnostics"; flow: string; diagnostics: Diagnostic[] }
  | { t: "synth_error"; flow: string; file: string; message: string }
  | { t: "run"; runId: string; event: RunEvent }

export type RunStatus = "queued" | "running" | "ok" | "error"

export type RunEvent = {
  seq: number
  at: number
  type: string
  nodeId?: string
  payload?: unknown
  simplifications?: string[]
}

export type Run = {
  id: string
  flow: string
  input: unknown
  status: RunStatus
  irHash?: string
  startedAt: number
  endedAt?: number
}

export type Render = {
  runId: string
  nodeId: string
  input: unknown
  output: unknown
  prompt: string | null
}

export type RunDetail = { run: Run; events: RunEvent[]; renders?: Record<string, Render> }

export type JsonSchema = {
  type?: string
  title?: string
  description?: string
  properties?: Record<string, JsonSchema>
  required?: string[]
  items?: JsonSchema
  enum?: (string | number | boolean)[]
  default?: unknown
  examples?: unknown[]
  format?: string
}

export type InputFieldUse = { node: string; slot: string }

export type InputField = { path: string; usedBy: InputFieldUse[] }

export type InputSchema = {
  flow: string
  type: string
  root: string
  freeform: boolean
  fields: InputField[]
  context: string[]
  example?: unknown
  note?: string
  schema?: JsonSchema
}
