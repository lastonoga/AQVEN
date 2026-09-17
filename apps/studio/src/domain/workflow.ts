import type { IsoDateTime, NodeId, RegistryEntryId, RevisionId, RunId, WorkflowId, WorkspaceId } from "./core"
import type { Property, ProvenancedValue } from "./shared"
import type {
  BindingSource,
  CheckKind,
  GatewayMode,
  ModelFamily,
  NodeKind,
  RegistryKind,
  RevisionStatus,
  RunStatus,
  StageKind,
} from "./vocabulary"

export type WorkspaceRef = { readonly id: WorkspaceId; readonly initial: string }
export type RunRef = { readonly id: RunId; readonly status: RunStatus }
export type WorkflowSummary = {
  readonly id: WorkflowId
  readonly stageCount: number
  readonly lastRun: { readonly id: RunId; readonly startedAt: IsoDateTime } | null
}
export type ShellData = {
  readonly workspace: WorkspaceRef
  readonly workflows: readonly WorkflowSummary[]
  readonly currentWorkflowId: WorkflowId
  readonly latestRun: RunRef | null
}

export type Point = { readonly x: number; readonly y: number }
export type Rect = Point & { readonly width: number; readonly height: number }
export type StepMarker = "map-n" | "map-fanout" | "loop" | "image" | "audio" | "video"
export type GroupKind = StageKind | "section"
export type NodeHandle = "in" | "out" | "bottom" | "enter" | "exit"

type NodePlacement = { readonly parentId?: string; readonly position: Point }

export type StepNode = NodePlacement & {
  readonly type: "step"
  readonly id: NodeId
  readonly data: {
    readonly kind: NodeKind
    readonly name: string
    readonly family?: ModelFamily
    readonly meta: string
    readonly io: readonly [string, string]
    readonly marker?: StepMarker
    readonly inspectable: boolean
  }
}
export type GroupNode = NodePlacement & {
  readonly type: "group"
  readonly id: string
  readonly width: number
  readonly height: number
  readonly data: {
    readonly kind: GroupKind
    readonly fanOut?: number
    readonly stage?: number
    readonly title?: string
    readonly caption?: string
    readonly dashed?: boolean
    readonly flowY?: number
    readonly fit: boolean
  }
}
export type GatewayNode = NodePlacement & { readonly type: "gateway"; readonly id: string; readonly data: { readonly mode: GatewayMode } }
export type AnchorNode = NodePlacement & { readonly type: "anchor"; readonly id: string }
export type SchemaNode = StepNode | GroupNode | GatewayNode | AnchorNode

export type SchemaEdge = {
  readonly id: string
  readonly source: string
  readonly sourceHandle: NodeHandle
  readonly target: string
  readonly targetHandle: NodeHandle
  readonly variant: "flow" | "back"
  readonly label?: string
  readonly detourY?: number
}

export type CanvasStage = { readonly number: number; readonly chip: string; readonly title: string; readonly rect: Rect }
export type SchemaGraph = { readonly nodes: readonly SchemaNode[]; readonly edges: readonly SchemaEdge[]; readonly stages: readonly CanvasStage[] }

export type NodeInspection = {
  readonly id: NodeId
  readonly kind: NodeKind
  readonly name: string
  readonly overview: readonly Property[]
  readonly config: readonly Property[]
  readonly inputs: readonly ProvenancedValue[]
  readonly prompt: string
  readonly slots: readonly Property[]
  readonly outputType: string
  readonly source: string
}

export type Revision = { readonly id: RevisionId; readonly status: RevisionStatus }
export type SignatureRef = { readonly id: string; readonly version: string; readonly revision?: RevisionId }
export type ProfileRef = { readonly id: string; readonly model: string }
export type NodeSummary = {
  readonly id: NodeId
  readonly kind: NodeKind
  readonly stage: number
  readonly path: readonly string[]
  readonly signature?: SignatureRef
}
export type Binding = {
  readonly input: string
  readonly type: string
  readonly optional: boolean
  readonly source: BindingSource
  readonly resolver: string
  readonly lastRun: string
  readonly resolved: boolean
}
export type NodeCheck = { readonly kind: CheckKind; readonly rule: string; readonly policy: string }
export type NodeContract = {
  readonly id: NodeId
  readonly kind: NodeKind
  readonly stage: number
  readonly context: readonly string[]
  readonly signature: { readonly ref: SignatureRef; readonly source: string } | null
  readonly profile: { readonly ref: ProfileRef; readonly source: string } | null
  readonly bindings: readonly Binding[]
  readonly writesSource: string
  readonly checks: readonly NodeCheck[]
  readonly generatedSource: string
}
export type RegistryEntry = {
  readonly kind: RegistryKind
  readonly id: RegistryEntryId
  readonly label: string
  readonly summary: string
  readonly usage: { readonly count: number; readonly unit: "node" | "slot" }
}
export type NodesOverview = {
  readonly revision: Revision
  readonly nodes: readonly NodeSummary[]
  readonly registry: Readonly<Record<RegistryKind, readonly RegistryEntry[]>>
}
