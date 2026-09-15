import type { RunStatus } from "../api/index.js"
import type { NodeStatus } from "./events.js"

export type Tone = { label: string; pill: string; bar: string; dot: string; rail: string }

export const nodeTones: Record<NodeStatus, Tone> = {
  pending: {
    label: "ожидает",
    pill: "bg-slate-900 text-slate-400 ring-slate-700",
    bar: "bg-slate-700",
    dot: "bg-slate-600",
    rail: "#334155",
  },
  running: {
    label: "идёт",
    pill: "bg-sky-950 text-sky-300 ring-sky-700",
    bar: "bg-sky-500",
    dot: "bg-sky-400",
    rail: "#0EA5E9",
  },
  ok: {
    label: "ok",
    pill: "bg-emerald-950 text-emerald-300 ring-emerald-800",
    bar: "bg-emerald-500",
    dot: "bg-emerald-400",
    rail: "#10B981",
  },
  error: {
    label: "ошибка",
    pill: "bg-red-950 text-red-300 ring-red-800",
    bar: "bg-red-500",
    dot: "bg-red-400",
    rail: "#EF4444",
  },
  skipped: {
    label: "пропущен",
    pill: "bg-slate-900 text-slate-500 ring-slate-800",
    bar: "bg-slate-600",
    dot: "bg-slate-700",
    rail: "#475569",
  },
}

export const runTones: Record<RunStatus, Tone> = {
  queued: nodeTones.pending,
  running: nodeTones.running,
  ok: nodeTones.ok,
  error: nodeTones.error,
}

export const runLabels: Record<RunStatus, string> = {
  queued: "в очереди",
  running: "идёт",
  ok: "ok",
  error: "ошибка",
}

export const formatMs = (ms: number | null): string => {
  if (ms === null) return "—"
  if (ms < 1000) return `${ms} мс`
  return `${(ms / 1000).toFixed(ms < 10_000 ? 2 : 1)} с`
}

export const formatClock = (at: number | null): string => {
  if (at === null) return "—"
  return new Date(at).toLocaleTimeString("ru-RU", { hour12: false })
}

export const formatStamp = (at: number | null): string => {
  if (at === null) return "—"
  return new Date(at).toLocaleString("ru-RU", { hour12: false })
}
