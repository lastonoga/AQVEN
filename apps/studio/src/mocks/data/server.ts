import type { ServerHealth, ServerStatus } from "@/api/server"
import { isoDateTime, projectRoot } from "@/data/ids"
import { liveProject } from "./project"

export const liveHealth: ServerHealth = {
  status: "ready",
  pid: 48213,
  project_root: projectRoot(liveProject.root),
  version: liveProject.engine_version,
  headless: false,
  started_at: isoDateTime("2026-09-18T02:40:00Z"),
}

export const liveServerStatus: ServerStatus = {
  checked_at: "2026-09-18T03:00:00Z",
  checks: [
    { id: "database", state: "ok", counts: {}, names: [] },
    { id: "engine", state: "ok", counts: {}, names: [] },
    { id: "project", state: "ok", counts: { errors: 0, warnings: 0, quarantined: 0, pending: 0 }, names: [] },
    { id: "model_keys", state: "ok", counts: { declared: 1, missing: 0 }, names: [] },
  ],
}
