import { useTranslations } from "use-intl"
import { Text } from "@/components/studio"
import { withEnd, withStart, type StageSpan } from "./range-preview"

export type StageSpanPickerProps = {
  readonly order: readonly string[]
  readonly span: StageSpan
  readonly onChange: (span: StageSpan) => void
}

type StageSelectProps = {
  readonly label: string
  readonly order: readonly string[]
  readonly index: number
  readonly onPick: (index: number) => void
}

const ARROW = "→"
const SELECT_CLASS =
  "h-7 max-w-44 min-w-0 rounded-md border border-input bg-card px-2 font-mono text-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"

function StageSelect({ label, order, index, onPick }: StageSelectProps) {
  return (
    <select
      aria-label={label}
      value={order[index] ?? ""}
      onChange={(event) => {
        const picked = order.indexOf(event.target.value)
        if (picked < 0) return
        onPick(picked)
      }}
      className={SELECT_CLASS}
    >
      {order.map((node) => (
        <option key={node} value={node}>
          {node}
        </option>
      ))}
    </select>
  )
}

export function StageSpanPicker({ order, span, onChange }: StageSpanPickerProps) {
  const t = useTranslations("cases.stages")
  return (
    <div role="group" aria-label={t("aria")} className="flex min-w-0 items-center gap-1.5">
      <Text role="hint" tone="neutral">
        {t("label")}
      </Text>
      <StageSelect
        label={t("from")}
        order={order}
        index={span[0]}
        onPick={(start) => {
          onChange(withStart(span, start))
        }}
      />
      <Text role="hint" tone="neutral" aria-hidden>
        {ARROW}
      </Text>
      <StageSelect
        label={t("to")}
        order={order}
        index={span[1]}
        onPick={(end) => {
          onChange(withEnd(span, end))
        }}
      />
    </div>
  )
}
