import { workflowId, workspaceId } from "@/data/ids"

export const WORKSPACE = workspaceId("hotel_pitch")

export const WORKFLOWS = {
  pitchPipeline: workflowId("pitch_pipeline"),
  seoBriefWriter: workflowId("seo_brief_writer"),
  reviewSummarizer: workflowId("review_summarizer"),
  supportTriage: workflowId("support_triage"),
} as const

export const WORKFLOW_IDS = [WORKFLOWS.pitchPipeline, WORKFLOWS.seoBriefWriter, WORKFLOWS.reviewSummarizer, WORKFLOWS.supportTriage] as const

export const resourceKey = (...parts: readonly string[]): string => parts.join("/")

export const workflowKey = (workflow: string, ...ids: readonly string[]): string => resourceKey(WORKSPACE, workflow, ...ids)

export const perWorkflow = <T>(make: (workflow: (typeof WORKFLOW_IDS)[number]) => T): Readonly<Record<string, T>> =>
  Object.fromEntries(WORKFLOW_IDS.map((workflow) => [workflowKey(workflow), make(workflow)]))

const CALL_ID_PREFIX = "call_01HT"
const CALL_ID_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"
const CALL_ID_DIGITS = 5
const FNV_OFFSET = 2_166_136_261
const FNV_PRIME = 16_777_619

const fnv1a = (seed: string): number =>
  Array.from(seed).reduce((hash, char) => Math.imul(hash ^ char.charCodeAt(0), FNV_PRIME) >>> 0, FNV_OFFSET)

const base32Digit = (hash: number, index: number): string =>
  CALL_ID_ALPHABET[Math.floor(hash / CALL_ID_ALPHABET.length ** index) % CALL_ID_ALPHABET.length] ?? CALL_ID_ALPHABET.charAt(0)

export const shortCallId = (seed: string): string => {
  const hash = fnv1a(seed)
  return `${CALL_ID_PREFIX}${Array.from({ length: CALL_ID_DIGITS }, (_, index) => base32Digit(hash, index)).join("")}`
}
