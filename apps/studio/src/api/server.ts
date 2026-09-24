import type { IsoDateTime, ProjectRoot } from "@/domain"
import { isoDateTime, projectRoot } from "@/data/ids"
import { SERVER_PHASES, type ServerPhase } from "./ready"
import type { components } from "./schema"

type S = components["schemas"]

export type ServerStatus = S["ServerStatus"]
export type StatusCheck = S["StatusCheck"]
export type StatusCheckId = S["StatusCheckId"]
export type CheckState = S["StatusState"]

export type ServerHealth = {
  readonly status: ServerPhase
  readonly pid: number
  readonly project_root: ProjectRoot
  readonly version: string
  readonly headless: boolean
  readonly started_at: IsoDateTime
}

export type ServerSource = {
  readonly health: () => Promise<ServerHealth>
  readonly status: () => Promise<ServerStatus>
}

type Fields = Readonly<Record<string, unknown>>

const isFields = (value: unknown): value is Fields => typeof value === "object" && value !== null && !Array.isArray(value)

const isPid = (value: unknown): value is number => typeof value === "number" && Number.isInteger(value) && value > 0

const phaseOf = (value: unknown): ServerPhase | null => SERVER_PHASES.find((phase) => phase === value) ?? null

const textAt = (fields: Fields, key: string): string | null => {
  const value = fields[key]
  return typeof value === "string" ? value : null
}

export const healthOf = (body: unknown): ServerHealth | null => {
  if (!isFields(body)) return null
  const status = phaseOf(body["status"])
  const pid = body["pid"]
  const root = textAt(body, "project_root")
  const version = textAt(body, "version")
  const headless = body["headless"]
  const startedAt = textAt(body, "started_at")
  if (status === null || !isPid(pid) || root === null || version === null) return null
  if (typeof headless !== "boolean" || startedAt === null) return null
  return { status, pid, project_root: projectRoot(root), version, headless, started_at: isoDateTime(startedAt) }
}
