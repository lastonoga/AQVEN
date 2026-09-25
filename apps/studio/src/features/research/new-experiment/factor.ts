import type { AuthoringFlow, AuthoringNode, AuthoringOptions, FactorKind, FlowId } from "@/domain"

export type FactorAuthoring = "pick" | "text" | "chat"

export type ValueChoice = { readonly value: string; readonly label: string; readonly detail: string | null }

type SlotContext = { readonly slot: AuthoringNode; readonly options: AuthoringOptions; readonly subject: FlowId | null }

type FactorRule = {
  readonly authoring: FactorAuthoring
  readonly fits: (node: AuthoringNode) => boolean
  readonly choices: (context: SlotContext) => readonly ValueChoice[]
  readonly written: (slot: AuthoringNode) => string | null
}

const NO_CHOICES: readonly ValueChoice[] = []

const isLlm = (node: AuthoringNode): boolean => node.kind === "llm"

const isCall = (node: AuthoringNode): boolean => node.kind === "call"

const anyNode = (): boolean => true

const nothingWritten = (): string | null => null

const noChoices = (): readonly ValueChoice[] => NO_CHOICES

const agentChoices = ({ options }: SlotContext): readonly ValueChoice[] =>
  options.agents.map((agent) => ({ value: agent.id, label: agent.id, detail: agent.model }))

export const flowById = (options: AuthoringOptions, flow: FlowId | null): AuthoringFlow | null =>
  options.flows.find((item) => item.id === flow) ?? null

const sameContract = (left: AuthoringFlow, right: AuthoringFlow): boolean =>
  left.input !== null && left.output !== null && left.input === right.input && left.output === right.output

const contractDetail = (flow: AuthoringFlow): string => `${flow.input ?? "?"} → ${flow.output ?? "?"}`

const flowChoices = ({ slot, options, subject }: SlotContext): readonly ValueChoice[] => {
  const called = flowById(options, slot.calls)
  if (called === null) return NO_CHOICES
  return options.flows
    .filter((flow) => flow.id !== subject && sameContract(flow, called))
    .map((flow) => ({ value: flow.id, label: flow.id, detail: contractDetail(flow) }))
}

export const FACTOR_RULES: Readonly<Record<FactorKind, FactorRule>> = {
  agent: { authoring: "pick", fits: isLlm, choices: agentChoices, written: (slot) => slot.agent },
  prompt: { authoring: "text", fits: isLlm, choices: noChoices, written: nothingWritten },
  use: { authoring: "chat", fits: anyNode, choices: noChoices, written: nothingWritten },
  flow: { authoring: "pick", fits: isCall, choices: flowChoices, written: (slot) => slot.calls },
}

export const slotsOf = (flow: AuthoringFlow | null, what: FactorKind): readonly AuthoringNode[] =>
  flow === null ? [] : flow.nodes.filter(FACTOR_RULES[what].fits)

export const chosenSlots = (flow: AuthoringFlow | null, nodes: readonly string[]): readonly AuthoringNode[] =>
  flow === null ? [] : nodes.flatMap((node) => flow.nodes.find((item) => item.id === node) ?? [])

export const choicesFor = (what: FactorKind, context: SlotContext): readonly ValueChoice[] => FACTOR_RULES[what].choices(context)

export const writtenValue = (what: FactorKind, slot: AuthoringNode): string | null => FACTOR_RULES[what].written(slot)

export const authoringOf = (what: FactorKind): FactorAuthoring => FACTOR_RULES[what].authoring
