export type KindShape =
  | "square"
  | "circle"
  | "diamond"
  | "triangle"
  | "hexagon"
  | "bars"
  | "stack"
  | "ring"
  | "fanout"
  | "fanin"

export type KindStyle = {
  label: string
  title: string
  shape: KindShape
  badge: string
  accent: string
  rail: string
}

const FALLBACK: KindStyle = {
  label: "node",
  title: "узел",
  shape: "square",
  badge: "bg-slate-800 text-slate-300 ring-slate-600",
  accent: "border-l-slate-500",
  rail: "bg-slate-500",
}

const styles: Record<string, KindStyle> = {
  llm: {
    label: "llm",
    title: "модель",
    shape: "circle",
    badge: "bg-violet-950 text-violet-300 ring-violet-700",
    accent: "border-l-violet-500",
    rail: "bg-violet-500",
  },
  tool: {
    label: "tool",
    title: "инструмент",
    shape: "square",
    badge: "bg-sky-950 text-sky-300 ring-sky-700",
    accent: "border-l-sky-500",
    rail: "bg-sky-500",
  },
  code: {
    label: "code",
    title: "код",
    shape: "triangle",
    badge: "bg-emerald-950 text-emerald-300 ring-emerald-700",
    accent: "border-l-emerald-500",
    rail: "bg-emerald-500",
  },
  human: {
    label: "human",
    title: "человек",
    shape: "hexagon",
    badge: "bg-amber-950 text-amber-300 ring-amber-700",
    accent: "border-l-amber-500",
    rail: "bg-amber-500",
  },
  call: {
    label: "call",
    title: "компонент",
    shape: "stack",
    badge: "bg-fuchsia-950 text-fuchsia-300 ring-fuchsia-700",
    accent: "border-l-fuchsia-500",
    rail: "bg-fuchsia-500",
  },
  map: {
    label: "map",
    title: "по каждому",
    shape: "bars",
    badge: "bg-cyan-950 text-cyan-300 ring-cyan-700",
    accent: "border-l-cyan-500",
    rail: "bg-cyan-500",
  },
  switch: {
    label: "switch",
    title: "ветвление",
    shape: "diamond",
    badge: "bg-orange-950 text-orange-300 ring-orange-700",
    accent: "border-l-orange-500",
    rail: "bg-orange-500",
  },
  loop: {
    label: "loop",
    title: "цикл",
    shape: "ring",
    badge: "bg-rose-950 text-rose-300 ring-rose-700",
    accent: "border-l-rose-500",
    rail: "bg-rose-500",
  },
  fanout: {
    label: "split",
    title: "разветвление",
    shape: "fanout",
    badge: "bg-teal-950 text-teal-300 ring-teal-700",
    accent: "border-l-teal-500",
    rail: "bg-teal-500",
  },
  fanin: {
    label: "join",
    title: "сведение",
    shape: "fanin",
    badge: "bg-teal-950 text-teal-300 ring-teal-700",
    accent: "border-l-teal-500",
    rail: "bg-teal-500",
  },
}

export const kindStyle = (kind: string): KindStyle => styles[kind] ?? { ...FALLBACK, label: kind }

export const kindTitle = (kind: string): string => kindStyle(kind).title
