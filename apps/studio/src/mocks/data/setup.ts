import type { AgentChoice, AgentModel, AgentProbe, AgentProfile, ProjectInfo, ProviderKey, SetupOverview, WorkflowTemplate } from "@/domain"
import { projectRoot, templateId } from "@/data/ids"
import { catalogOf } from "./catalog"
import { hoursAgo } from "./clock"
import { WORKFLOW_IDS, WORKSPACE } from "./keys"

const PROJECT: ProjectInfo = {
  root: projectRoot("/Users/you/Projects/hotel-pitch"),
  name: "hotel-pitch",
  workspaceId: WORKSPACE,
  git: { branch: "main", dirty: false },
  configFile: "aqven.yaml",
  workflows: WORKFLOW_IDS.map((id) => ({ id, nodeCount: catalogOf(id).nodes.length })),
}

const CLAUDE_READY: AgentProbe = {
  kind: "claude",
  install: { status: "installed", version: "2.1.274", path: "~/.local/bin/claude", origin: "system" },
  auth: { status: "signedIn", plan: "Claude Max" },
  tools: { status: "connected", toolCount: 24 },
  checkedAt: hoursAgo(0.05),
}

const plain = (...values: readonly string[]): readonly AgentChoice[] => values.map((value) => ({ value, description: null }))

const CLAUDE_EFFORTS = plain("low", "medium", "high", "xhigh", "max")

const CLAUDE_MODELS: readonly AgentModel[] = [
  { id: "sonnet", label: "Sonnet", efforts: CLAUDE_EFFORTS, defaultEffort: "medium" },
  { id: "opus", label: "Opus", efforts: CLAUDE_EFFORTS, defaultEffort: "high" },
  { id: "haiku", label: "Haiku", efforts: [], defaultEffort: null },
]

const CLAUDE_PROFILE: AgentProfile = {
  kind: "claude",
  models: CLAUDE_MODELS,
  model: "sonnet",
  effort: "medium",
  choices: [
    { id: "reasoning", choices: plain("summarized", "omitted"), value: "summarized" },
    { id: "approvals", choices: plain("default", "acceptEdits", "plan", "dontAsk", "auto", "bypassPermissions"), value: "default" },
  ],
  limits: [
    { id: "maxTurns", value: null, min: 1, step: 1 },
    { id: "maxBudgetUsd", value: 2, min: 0.01, step: 0.01 },
  ],
}

const provider = (name: ProviderKey["provider"], envVar: string, source: ProviderKey["source"], masked: string | null): ProviderKey => ({
  provider: name,
  envVar,
  source,
  masked,
})

const PROVIDERS: readonly ProviderKey[] = [
  provider("openai", "OPENAI_API_KEY", null, null),
  provider("anthropic", "ANTHROPIC_API_KEY", "environment", "••••f3Qa"),
  provider("google", "GOOGLE_API_KEY", null, null),
  provider("openrouter", "OPENROUTER_API_KEY", "project", "••••9c2d"),
  provider("together", "TOGETHER_API_KEY", null, null),
]

export const setupOverview: SetupOverview = {
  server: {
    url: "http://127.0.0.1:5180",
    mcpUrl: "http://127.0.0.1:5180/mcp/",
    command: "aqven studio",
    startedAt: hoursAgo(0.4),
    projectData: "/Users/you/Projects/hotel-pitch/.aqven",
    studioData: "~/Library/Application Support/AQVEN",
  },
  project: PROJECT,
  agents: [{ probe: CLAUDE_READY, profile: CLAUDE_PROFILE }],
  defaultAgent: "claude",
  providers: PROVIDERS,
  release: { installed: "0.4.0", latest: "0.4.1", checkedAt: hoursAgo(3) },
}

export const firstRunOverview: SetupOverview = {
  ...setupOverview,
  server: { ...setupOverview.server, projectData: "/Users/you/Projects/lumen-support/.aqven" },
  project: {
    root: projectRoot("/Users/you/Projects/lumen-support"),
    name: "lumen-support",
    workspaceId: WORKSPACE,
    git: null,
    configFile: null,
    workflows: [],
  },
  agents: [{ probe: { ...CLAUDE_READY, auth: { status: "signedOut", loginCommand: "claude" }, tools: { status: "pending" } }, profile: CLAUDE_PROFILE }],
  providers: PROVIDERS.map((key) => ({ ...key, source: null, masked: null })),
}

export const MOCK_SCENARIO_KEY = "aqven.mock.scenario"

const SCENARIOS: Readonly<Record<string, SetupOverview>> = { "first-run": firstRunOverview }

export const scenarioOverview = (scenario: string | null): SetupOverview => SCENARIOS[scenario ?? ""] ?? setupOverview

export const workflowTemplates: readonly WorkflowTemplate[] = [
  {
    id: templateId("support_triage"),
    title: "Support triage",
    summary: "Classify an incoming ticket, collect order facts and route it to the right queue with a human check.",
    nodeCount: catalogOf("support_triage").nodes.length,
  },
  {
    id: templateId("pitch_pipeline"),
    title: "Personalised pitch",
    summary: "Score candidates, write variants with several model families and pick the best with a critic loop.",
    nodeCount: catalogOf("pitch_pipeline").nodes.length,
  },
  {
    id: templateId("review_summarizer"),
    title: "Review summarizer",
    summary: "Map over customer reviews, extract facts per review and reduce them into a cited summary.",
    nodeCount: catalogOf("review_summarizer").nodes.length,
  },
]
