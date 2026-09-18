import type { ApiFlow, Severity } from "@/domain"
import { SEVERITY_TONE, type Tone } from "@/components/studio"

export type ProblemTag = { readonly severity: Severity; readonly count: number; readonly tone: Tone }

const HASH_PREFIX = "sha256-"
const HASH_LENGTH = 12

export const shortHash = (hash: string): string => hash.replace(HASH_PREFIX, "").slice(0, HASH_LENGTH)

const problemTag = (severity: Severity, count: number): ProblemTag => ({ severity, count, tone: SEVERITY_TONE[severity] })

export const flowProblems = (flow: ApiFlow): ProblemTag | null => {
  if (flow.problems.error > 0) return problemTag("error", flow.problems.error)
  if (flow.problems.warning > 0) return problemTag("warning", flow.problems.warning)
  return null
}
