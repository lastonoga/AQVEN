import { kindStyle } from "../graph/kinds.js"
import { ValueLines } from "./ValueLines.js"
import { HAIRLINE, MUTED_TEXT, TONE } from "./run-tokens.js"
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
import type { FlowGroup, FlowItem, FlowMode, FlowTree } from "./flow-view.js"
import type { Ir } from "../api/index.js"

type Props = { group: FlowGroup; ir: Ir | null; lines: number; depth?: number }

const BAND_TONES: Readonly<Record<FlowMode, string>> = {
  sequence: "border-[#232A36]",
  parallel: "border-[#2E6F6A]",
  loop: "border-[#6B4A86]",
}

const BAND_LABELS: Readonly<Record<FlowMode, string>> = {
  sequence: "",
  parallel: "параллельно",
  loop: "цикл",
}

const paramsText = (params: Readonly<Record<string, unknown>> | null): string => {
  if (params === null) return ""
  return Object.entries(params)
    .map(([key, value]) => `${key} ${String(value)}`)
    .join(" · ")
}

function Facts({ item }: { item: FlowItem }) {
  const passed = item.checks.filter((check) => check.ok !== false).length
  const failed = item.checks.length - passed
  return (
    <span className="ml-auto flex shrink-0 items-baseline gap-3 tabular-nums">
      {item.offsetMs !== null && (
        <span className={`${MUTED_TEXT} ${TONE["muted"]}`}>{formatOffset(item.offsetMs)}</span>
      )}
      <span className={`font-mono text-[12.5px] ${TONE["data"]}`}>{formatSpan(item.durationMs)}</span>
      {item.totalTokens !== null && (
        <span className={`font-mono text-[12.5px] ${TONE["number"]}`}>{formatCount(item.totalTokens)} ток</span>
      )}
      {item.costUsd !== null && (
        <span className={`font-mono text-[12.5px] ${TONE["number"]}`}>{formatMoney(item.costUsd)}</span>
      )}
      {item.checks.length > 0 && (
        <span className={`font-mono text-[12.5px] ${failed === 0 ? TONE["ok"] : TONE["error"]}`}>
          пров. {passed}/{item.checks.length}
        </span>
      )}
    </span>
  )
}

function Zones({ item, ir, lines }: { item: FlowItem; ir: Ir | null; lines: number }) {
  if (lines === 0) return null
  return (
    <div className="grid gap-x-5 gap-y-2 py-1.5 md:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,1.2fr)]">
      <Zone label="вход">
        <ValueLines value={item.input} ir={ir} lines={lines} />
      </Zone>
      <Zone label="промт" wide>
        {item.prompt === null || item.prompt === "" ? (
          <span className={`${MUTED_TEXT} ${TONE["muted"]}`}>промта нет</span>
        ) : (
          <ValueLines value={item.prompt} ir={ir} lines={lines} />
        )}
      </Zone>
      <Zone label="выход">
        {item.error === null ? (
          <ValueLines value={item.output} typeName={item.outputType ?? ""} ir={ir} lines={lines} />
        ) : (
          <span className={`whitespace-pre-wrap font-mono text-[13px] leading-[1.5] ${TONE["error"]}`}>
            {item.error}
          </span>
        )}
      </Zone>
    </div>
  )
}

function Zone({ label, wide = false, children }: { label: string; wide?: boolean; children: React.ReactNode }) {
  return (
    <div className={`flex min-w-0 flex-col gap-0.5 ${wide ? "md:col-span-2 xl:col-span-1" : ""}`}>
      <span className={`${MUTED_TEXT} ${TONE["muted"]} uppercase tracking-[0.07em]`}>{label}</span>
      <div className="min-w-0 max-w-[640px]">{children}</div>
    </div>
  )
}

function Head({ item }: { item: FlowItem }) {
  const tone = nodeTones[item.status]
  const style = kindStyle(item.nodeKind)
  const meta = [item.nodeId, style.label, item.model, paramsText(item.params)]
    .filter((part) => part !== null && part !== "")
    .join(" · ")
  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex min-w-0 items-baseline gap-2">
        <span className={`${MUTED_TEXT} ${TONE["muted"]} w-6 shrink-0 tabular-nums`}>{item.order}</span>
        <span className={`min-w-0 flex-1 text-[14px] font-medium leading-snug ${TONE["data"]}`}>{item.title}</span>
        {item.status !== "ok" && (
          <span className={`shrink-0 rounded px-1.5 py-0.5 font-mono text-[11px] ring-1 ${tone.pill}`}>
            {tone.label}
          </span>
        )}
        <Facts item={item} />
      </div>
      <div className={`${MUTED_TEXT} ${TONE["muted"]} truncate pl-8`}>{meta}</div>
      {item.note !== "" && <div className={`${MUTED_TEXT} ${TONE["muted"]} truncate pl-8`}>{item.note}</div>}
    </div>
  )
}

function Item({ item, ir, lines, depth }: { item: FlowItem; ir: Ir | null; lines: number; depth: number }) {
  const tone = nodeTones[item.status]
  const mark = item.selected ? `${TONE["ok"]} ring-1 ring-[#2E6F6A]` : ""
  return (
    <section className={`flex min-w-0 gap-2.5 ${mark}`}>
      <span className={`mt-1 w-[3px] shrink-0 rounded-sm ${tone.bar}`} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Head item={item} />
        <div className="pl-8">
          <Zones item={item} ir={ir} lines={lines} />
          {item.groups.map((group) => (
            <RunFlow key={group.id} group={group} ir={ir} lines={lines} depth={depth + 1} />
          ))}
        </div>
      </div>
    </section>
  )
}

const bandTitle = (group: FlowGroup): string => {
  const count = group.items.length
  if (group.mode === "parallel") return `${BAND_LABELS.parallel} · ${count} ${branchWord(count)}`
  if (group.mode === "loop") return `${BAND_LABELS.loop} · ${count} ${iterationWord(count)}`
  return `${count} ${stepWord(count)}`
}

function Band({ group, children }: { group: FlowGroup; children: React.ReactNode }) {
  if (group.mode === "sequence") return <div className="flex flex-col gap-4">{children}</div>
  return (
    <div className={`my-2 rounded border-l-2 ${BAND_TONES[group.mode]} pl-3`}>
      <div className="flex items-baseline gap-2 pb-1.5">
        <span className={`font-mono text-[12px] uppercase tracking-[0.07em] ${TONE["data"]}`}>
          {bandTitle(group)}
        </span>
        {group.label !== "" && <span className={`${MUTED_TEXT} ${TONE["muted"]}`}>{group.label}</span>}
        <span className={`${MUTED_TEXT} ${TONE["muted"]} tabular-nums`}>{formatSpan(group.durationMs)}</span>
        {group.mode === "parallel" && group.lanes > 1 && (
          <span className={`${MUTED_TEXT} ${TONE["muted"]}`}>одновременно до {group.lanes}</span>
        )}
      </div>
      {children}
    </div>
  )
}

const columnsFor = (count: number): string => {
  if (count <= 1) return "grid-cols-1"
  if (count === 2) return "grid-cols-1 xl:grid-cols-2"
  if (count === 3) return "grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3"
  return "grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3"
}

export function RunTreeView({
  tree,
  ir,
  lines,
}: {
  tree: FlowTree
  ir: Ir | null
  lines: number
  onSelectNode?: (nodeId: string) => void
}) {
  return (
    <div className="flex flex-col gap-4">
      {tree.groups.map((group) => (
        <RunFlow key={group.id} group={group} ir={ir} lines={lines} />
      ))}
    </div>
  )
}

export function RunFlow({ group, ir, lines, depth = 0 }: Props) {
  if (group.items.length === 0) return null

  if (group.mode === "parallel") {
    return (
      <Band group={group}>
        <div className={`grid gap-x-5 gap-y-4 ${columnsFor(group.items.length)}`}>
          {group.items.map((item) => (
            <div key={item.id} className={`min-w-0 border-t ${HAIRLINE} pt-2`}>
              <Item item={item} ir={ir} lines={lines} depth={depth} />
            </div>
          ))}
        </div>
      </Band>
    )
  }

  return (
    <Band group={group}>
      {group.items.map((item) => (
        <Item key={item.id} item={item} ir={ir} lines={lines} depth={depth} />
      ))}
    </Band>
  )
}
