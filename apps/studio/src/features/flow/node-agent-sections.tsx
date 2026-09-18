import { useTranslations } from "use-intl"
import type { ApiNodeDetail } from "@/domain"
import { SectionStack, type PropertyRow, type SectionSpec } from "@/components/studio"
import { plainLines } from "@/lib/text"

type Copy = ReturnType<typeof useTranslations<"flow.inspector">>
type Agent = NonNullable<ApiNodeDetail["agent_spec"]>
type Runtime = NonNullable<ApiNodeDetail["agent_runtime"]>

const row = (key: string, value: string): PropertyRow => ({ key, value })

const properties = (id: string, title: string, rows: readonly PropertyRow[]): SectionSpec => ({
  id,
  title,
  body: { kind: "properties", rows },
})

const prose = (id: string, title: string, value: string): SectionSpec => ({
  id,
  title,
  body: { kind: "text", lines: plainLines(value), variant: "plain" },
})

const configured = (value: string | number | boolean | null | undefined, fallback: string): string =>
  value === null || value === undefined ? fallback : String(value)

const modelName = (model: string): string => model.slice(model.indexOf(":") + 1)

const modelProvider = (model: string): string => model.includes(":") ? model.slice(0, model.indexOf(":")) : model

const labels = (items: readonly string[] | null | undefined, empty: string): string =>
  items === null || items === undefined || items.length === 0 ? empty : items.join(", ")

const modelSections = (agent: Agent, runtime: Runtime | null, t: Copy): readonly SectionSpec[] => {
  const models = [agent.model, ...(agent.fallback_models ?? [])]
  const primary = runtime?.models?.[0]
  const fallbacks = models.slice(1)
  const capabilities = runtime?.models?.map((model, index): SectionSpec => properties(
    `agent-capabilities-${String(index)}`,
    index === 0 ? t("agentView.primaryCapabilities") : t("agentView.fallbackCapabilities", { number: index }),
    [
      row(t("agentView.modelFamily"), model.capabilities.family),
      row(t("agentView.inputModalities"), model.capabilities.input.join(", ")),
      row(t("agentView.outputModalities"), model.capabilities.output.join(", ")),
      row(t("agentView.strictSupport"), t(model.capabilities.strict ? "agentView.yes" : "agentView.no")),
    ],
  )) ?? []
  return [
    properties("agent-models", t("agentView.models"), [
      row(t("agentView.primaryModel"), modelName(models[0] ?? agent.model)),
      row(t("agentView.provider"), primary?.provider ?? modelProvider(agent.model)),
      row(t("agentView.fallbackModels"), fallbacks.length === 0
        ? t("agentView.none")
        : fallbacks.map((model, index) => `${String(index + 1)}. ${model}`).join(" → ")),
    ]),
    ...capabilities,
  ]
}

const generationSections = (agent: Agent, t: Copy): readonly SectionSpec[] => {
  const settings = agent.settings
  const rows: PropertyRow[] = [
    row(t("agentView.temperature"), configured(settings?.temperature, t("agentView.providerDefault"))),
    row(t("agentView.topP"), configured(settings?.top_p, t("agentView.providerDefault"))),
    row(t("agentView.maxTokens"), configured(settings?.max_tokens, t("agentView.providerDefault"))),
  ]
  if (settings?.seed !== null && settings?.seed !== undefined) rows.push(row(t("agentView.seed"), String(settings.seed)))
  if (settings?.provider_options !== null && settings?.provider_options !== undefined &&
      Object.keys(settings.provider_options).length > 0) {
    rows.push(row(t("agentView.providerOptions"), JSON.stringify(settings.provider_options)))
  }
  return [properties("agent-generation", t("agentView.generation"), rows)]
}

const outputMode = (mode: string, t: Copy): string => {
  if (mode === "auto") return t("agentView.modeAuto")
  if (mode === "native") return t("agentView.modeNative")
  if (mode === "tool") return t("agentView.modeTool")
  if (mode === "prompted") return t("agentView.modePrompted")
  return mode
}

const modeSource = (source: string, t: Copy): string => {
  if (source === "declared") return t("agentView.explicitSetting")
  if (source === "profile") return t("agentView.modelProfile")
  if (source === "known_model") return t("agentView.knownModel")
  if (source === "fallback_models") return t("agentView.fallbackCompatibility")
  return source
}

const failurePolicy = (policy: string, t: Copy): string =>
  policy === "fallback" ? t("agentView.tryFallback") : t("agentView.failNode")

const outputSections = (agent: Agent, runtime: Runtime | null, t: Copy): readonly SectionSpec[] => {
  const declared = agent.output
  const effective = runtime?.output
  const rows: PropertyRow[] = [
    row(t("agentView.outputMode"), effective === null || effective === undefined
      ? outputMode(declared?.mode ?? "auto", t)
      : outputMode(effective.mode, t)),
  ]
  if (effective !== null && effective !== undefined && effective.declared_mode !== effective.mode) {
    rows.push(row(t("agentView.modeSelection"), outputMode(effective.declared_mode, t)))
    rows.push(row(t("agentView.modeSource"), modeSource(effective.mode_source, t)))
  }
  rows.push(
    row(t("agentView.strictSchema"), t((effective?.strict ?? declared?.strict ?? true) ? "agentView.yes" : "agentView.no")),
    row(t("agentView.retries"), String(effective?.retries ?? declared?.retries ?? 1)),
    row(t("agentView.onRefusal"), failurePolicy(effective?.on_refusal ?? declared?.on_refusal ?? "fail", t)),
    row(t("agentView.onTruncated"), failurePolicy(effective?.on_truncated ?? declared?.on_truncated ?? "fail", t)),
  )
  return [properties("agent-output", t("agentView.output"), rows)]
}

const accessSections = (agent: Agent, t: Copy): readonly SectionSpec[] => {
  const tools = agent.tools ?? []
  const servers = agent.mcp_servers ?? []
  const subagents = agent.subagents ?? []
  const rows: PropertyRow[] = [
    row(t("agentView.tools"), labels(tools, t("agentView.none"))),
    row(t("agentView.mcpServers"), labels(servers, t("agentView.none"))),
    row(t("agentView.subagents"), subagents.length === 0 ? t("agentView.none")
      : subagents.map((item) => `${item.name} — ${item.description} (${item.agent} · ${item.inference})`).join("; ")),
  ]
  const approval = agent.approval
  const approvalRows: PropertyRow[] = approval === null || approval === undefined ? [] : [
    row(t("agentView.approvalTools"), approval.tools.join(", ")),
    row(t("agentView.assignee"), approval.assignee),
    row(t("agentView.approvalTimeout"), String(approval.timeout_seconds)),
    row(t("agentView.onTimeout"), approval.on_timeout.policy),
  ]
  return [
    properties("agent-access", t("agentView.access"), rows),
    ...(approvalRows.length === 0 ? [] : [properties("agent-approval", t("agentView.approval"), approvalRows)]),
  ]
}

const limitSections = (agent: Agent, t: Copy): readonly SectionSpec[] => {
  const limits = agent.limits
  if (limits === null || limits === undefined) return []
  const entries: readonly [string, number | null | undefined][] = [
    [t("agentView.requests"), limits.requests],
    [t("agentView.toolCalls"), limits.tool_calls],
    [t("agentView.tokens"), limits.tokens],
    [t("agentView.seconds"), limits.seconds],
  ]
  const rows = entries.flatMap(([key, value]) => value === null || value === undefined ? [] : [row(key, String(value))])
  if (limits.usd_micros !== null && limits.usd_micros !== undefined) {
    rows.push(row(t("agentView.budget"), `$${(limits.usd_micros / 1_000_000).toFixed(2)}`))
  }
  return rows.length === 0 ? [] : [properties("agent-limits", t("agentView.limits"), rows)]
}

const rawAgent = (agent: Agent, runtime: Runtime | null): unknown => ({
  description: agent.description,
  models: [agent.model, ...(agent.fallback_models ?? [])],
  settings: agent.settings ?? null,
  output: agent.output ?? null,
  resolved_models: runtime?.models ?? null,
  resolved_output: runtime?.output ?? null,
  instructions: runtime?.instructions ?? null,
  tools: agent.tools ?? [],
  mcp_servers: agent.mcp_servers ?? [],
  subagents: agent.subagents ?? [],
  approval: agent.approval ?? null,
  limits: agent.limits ?? null,
  capabilities_override: agent.capabilities ?? null,
})

export function AgentSections({ detail, raw }: { readonly detail: ApiNodeDetail; readonly raw: boolean }) {
  const t = useTranslations("flow.inspector")
  const agent = detail.agent_spec
  if (agent === null || agent === undefined) return null
  const runtime = detail.agent_runtime ?? null
  if (raw) return <SectionStack gap="lg" sections={[{
    id: "agent-raw",
    title: t("agentView.agent"),
    body: { kind: "value", value: rawAgent(agent, runtime) },
  }]} />
  const instructions = runtime?.instructions
  const sections: readonly SectionSpec[] = [
    prose("agent-description", t("agentView.role"), agent.description),
    ...modelSections(agent, runtime, t),
    ...generationSections(agent, t),
    ...outputSections(agent, runtime, t),
    prose("agent-instructions", t("agentView.instructions"),
      instructions === null || instructions === undefined || instructions === ""
        ? t("agentView.noInstructions") : instructions),
    ...accessSections(agent, t),
    ...limitSections(agent, t),
  ]
  return <SectionStack gap="lg" sections={sections} />
}
