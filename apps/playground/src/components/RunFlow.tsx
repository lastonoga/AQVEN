import { ValueLines } from "./ValueLines.js"
import { MUTED_TEXT, TONE } from "./run-tokens.js"
import { nodeTones } from "../run/styles.js"
import {
  branchWord,
  formatCount,
  formatMoney,
  formatOffset,
  formatSpan,
  iterationWord,
  stepWord,
} from "./flow-view.js"
import type { ReactNode } from "react"
import type { FlowGroup, FlowItem, FlowMode, FlowTree } from "./flow-view.js"
import type { Ir } from "../api/index.js"

type Props = { group: FlowGroup; ir: Ir | null; lines: number }

const CARD = "rounded-md border border-[#222C3A] bg-[#111721]"

const BAND_RULE: Readonly<Record<FlowMode, string>> = {
  sequence: "",
  parallel: "border-[#2E6F6A]",
  loop: "border-[#6B4A86]",
}

const ZONE_GRID = { gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))" }

const COLUMNS: Readonly<Record<number, string>> = {
  1: "grid-cols-1",
  2: "grid-cols-1 lg:grid-cols-2",
  3: "grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3",
  4: "grid-cols-1 lg:grid-cols-2 2xl:grid-cols-4",
}

const columnsFor = (count: number): string => COLUMNS[Math.min(count, 4)] ?? COLUMNS[4] ?? "grid-cols-1"

const paramsText = (params: Readonly<Record<string, unknown>> | null): string =>
  params === null
    ? ""
    : Object.entries(params)
        .map(([key, value]) => `${key} ${String(value)}`)
        .join(" ")

function Facts({ item }: { item: FlowItem }) {
  const failed = item.checks.filter((check) => check.ok === false).length
  return (
    <span className="flex shrink-0 items-baseline font-mono text-[11.5px] tabular-nums">
      <span className={`w-[62px] text-right ${TONE["data"]}`} title="длительность шага">
        {formatSpan(item.durationMs)}
      </span>
      <span className={`w-[70px] text-right ${TONE["muted"]}`} title="смещение от старта прогона">
        {formatOffset(item.offsetMs)}
      </span>
      <span className={`w-[74px] text-right ${TONE["number"]}`} title="токенов всего">
        {item.totalTokens === null ? "" : `${formatCount(item.totalTokens)} ток`}
      </span>
      <span className={`w-[62px] text-right ${TONE["number"]}`} title="стоимость шага">
        {item.costUsd === null || item.costUsd === 0 ? "" : formatMoney(item.costUsd)}
      </span>
      <span className={`w-[54px] text-right ${failed > 0 ? TONE["error"] : TONE["muted"]}`} title="проверки">
        {item.checks.length === 0 ? "" : `${item.checks.length - failed}/${item.checks.length}`}
      </span>
    </span>
  )
}

function Zone({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className={`${MUTED_TEXT} ${TONE["muted"]} uppercase tracking-[0.07em]`}>{label}</span>
      <div className="min-w-0">{children}</div>
    </div>
  )
}

function Zones({ item, ir, lines }: { item: FlowItem; ir: Ir | null; lines: number }) {
  if (lines === 0) return null
  const hasPrompt = item.prompt !== null && item.prompt !== ""
  return (
    <div className="grid gap-x-5 gap-y-3 border-t border-[#1B2430] px-3 py-2.5" style={ZONE_GRID}>
      <Zone label="вход">
        <ValueLines value={item.input} ir={ir} lines={lines} />
      </Zone>
      {hasPrompt && (
        <Zone label="промт">
          <ValueLines value={item.prompt} ir={ir} lines={lines} />
        </Zone>
      )}
      <Zone label="выход">
        {item.error === null ? (
          <ValueLines value={item.output} typeName={item.outputType ?? ""} ir={ir} lines={lines} />
        ) : (
          <span className={`block whitespace-pre-wrap font-mono text-[12.5px] leading-[1.45] ${TONE["error"]}`}>
            {item.error}
          </span>
        )}
      </Zone>
    </div>
  )
}

const CHIP = "shrink-0 rounded-sm bg-[#182231] px-1.5 py-px font-mono text-[10.5px] leading-[14px]"

function Chips({ item }: { item: FlowItem }) {
  const parts = [item.nodeId, item.model, paramsText(item.params)].filter(
    (part): part is string => part !== null && part !== "",
  )
  if (parts.length === 0) return null
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {parts.map((part) => (
        <span key={part} className={`${CHIP} ${TONE["muted"]}`} title={part}>
          {part}
        </span>
      ))}
    </div>
  )
}

function Head({ item }: { item: FlowItem }) {
  const tone = nodeTones[item.status]
  return (
    <div className="flex flex-col gap-1.5 px-3 pt-2.5">
      <div className="flex min-w-0 items-baseline gap-2.5">
        <span className={`${MUTED_TEXT} ${TONE["muted"]} shrink-0 tabular-nums`}>{item.order}</span>
        <span
          className={`min-w-0 flex-1 truncate text-[13.5px] font-medium ${TONE["data"]}`}
          title={item.title}
        >
          {item.title}
        </span>
        {item.status !== "ok" && (
          <span className={`shrink-0 rounded px-1.5 py-0.5 font-mono text-[11px] ring-1 ${tone.pill}`}>
            {tone.label}
          </span>
        )}
        {item.selected && item.kind !== "branch" && (
          <span className={`shrink-0 rounded px-1.5 py-0.5 font-mono text-[11px] ring-1 ring-[#2E6F6A] ${TONE["ok"]}`}>
            выбрана
          </span>
        )}
        <Facts item={item} />
      </div>
      <Chips item={item} />
      {item.note !== "" && <div className={`${MUTED_TEXT} ${TONE["muted"]} truncate`}>{item.note}</div>}
    </div>
  )
}

function Item({ item, ir, lines }: { item: FlowItem; ir: Ir | null; lines: number }) {
  const tone = nodeTones[item.status]
  return (
    <article className={`flex min-w-0 flex-col ${CARD}`}>
      <div className="flex min-w-0 flex-col pb-1" style={{ boxShadow: `inset 2px 0 0 ${tone.rail}` }}>
        <Head item={item} />
        <Zones item={item} ir={ir} lines={lines} />
      </div>
      {item.groups.map((group) => (
        <div key={group.id} className="px-3 pb-2.5">
          <RunFlow group={group} ir={ir} lines={lines} />
        </div>
      ))}
    </article>
  )
}

const bandTitle = (group: FlowGroup): string => {
  const count = group.items.length
  if (group.mode === "parallel") return `параллельно · ${count} ${branchWord(count)}`
  if (group.mode === "loop") return `цикл · ${count} ${iterationWord(count)}`
  return `${count} ${stepWord(count)}`
}

function Band({ group, children }: { group: FlowGroup; children: ReactNode }) {
  if (group.mode === "sequence") return <div className="flex flex-col gap-2.5">{children}</div>
  return (
    <div className={`my-1 border-l-2 pl-3 ${BAND_RULE[group.mode]}`}>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 pb-1.5">
        <span className={`font-mono text-[11.5px] uppercase tracking-[0.07em] ${TONE["data"]}`}>
          {bandTitle(group)}
        </span>
        <span className={`${MUTED_TEXT} ${TONE["muted"]} tabular-nums`}>{formatSpan(group.durationMs)}</span>
        {group.label !== "" && <span className={`${MUTED_TEXT} ${TONE["muted"]}`}>{group.label}</span>}
      </div>
      {children}
    </div>
  )
}

export function RunTreeView({ tree, ir, lines }: { tree: FlowTree; ir: Ir | null; lines: number }) {
  return (
    <div className="flex flex-col gap-2.5">
      {tree.groups.map((group) => (
        <RunFlow key={group.id} group={group} ir={ir} lines={lines} />
      ))}
    </div>
  )
}

export function RunFlow({ group, ir, lines }: Props) {
  if (group.items.length === 0) return null

  if (group.mode === "parallel") {
    return (
      <Band group={group}>
        <div className={`grid gap-3 ${columnsFor(group.items.length)}`}>
          {group.items.map((item) => (
            <Item key={item.id} item={item} ir={ir} lines={lines} />
          ))}
        </div>
      </Band>
    )
  }

  return (
    <Band group={group}>
      {group.items.map((item) => (
        <Item key={item.id} item={item} ir={ir} lines={lines} />
      ))}
    </Band>
  )
}
