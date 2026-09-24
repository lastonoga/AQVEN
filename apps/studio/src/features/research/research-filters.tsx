import { Link, useNavigate } from "@tanstack/react-router"
import { useTranslations } from "use-intl"
import { QUESTION_KINDS, type ExperimentFilter } from "@/domain"
import { Text, Toolbar } from "@/components/studio"
import { parseEnum } from "@/lib/search"
import { ROUTE_PATH } from "@/lib/routes"
import { hasNarrowing, withFilter } from "./presenters"

type FilterOption = { readonly value: string; readonly label: string }

type FilterSelectProps = {
  readonly label: string
  readonly value: string | undefined
  readonly options: readonly FilterOption[]
  readonly onChange: (value: string | null) => void
}

export type ResearchFiltersProps = {
  readonly filter: ExperimentFilter
  readonly failureModes: readonly string[]
  readonly count: number
}

const ANY = ""
const SELECT_CLASS = "h-8 min-w-36 rounded-lg border border-input bg-card px-2.5 font-mono text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
const parseQuestion = parseEnum(QUESTION_KINDS)

const flowOnly = (filter: ExperimentFilter): ExperimentFilter => (filter.flow === undefined ? {} : { flow: filter.flow })

function FilterSelect({ label, value, options, onChange }: FilterSelectProps) {
  const t = useTranslations("research.list")
  return (
    <label className="flex items-center gap-2">
      <Text role="hint" tone="neutral">
        {label}
      </Text>
      <select
        aria-label={label}
        value={value ?? ANY}
        onChange={(event) => {
          onChange(event.target.value === ANY ? null : event.target.value)
        }}
        className={SELECT_CLASS}
      >
        <option value={ANY}>{t("any")}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  )
}

export function ResearchFilters({ filter, failureModes, count }: ResearchFiltersProps) {
  const t = useTranslations("research")
  const navigate = useNavigate()
  const apply = (next: ExperimentFilter): void => {
    void navigate({ to: ROUTE_PATH.research, search: next })
  }
  return (
    <Toolbar wrap aria-label={t("list.filtersAria")} role="group" className="gap-x-4 gap-y-2" end={<Text role="hint" tone="neutral">{t("list.count", { count })}</Text>}>
      <FilterSelect
        label={t("list.question")}
        value={filter.question}
        options={QUESTION_KINDS.map((kind) => ({ value: kind, label: t(`vocabulary.question.${kind}`) }))}
        onChange={(value) => {
          apply(withFilter(filter, { question: parseQuestion(value) ?? null }))
        }}
      />
      <FilterSelect
        label={t("list.failureMode")}
        value={filter.failureMode}
        options={failureModes.map((mode) => ({ value: mode, label: mode }))}
        onChange={(value) => {
          apply(withFilter(filter, { failureMode: value }))
        }}
      />
      {hasNarrowing(filter) ? (
        <Text role="link" tone="neutral" asChild>
          <Link to={ROUTE_PATH.research} search={flowOnly(filter)}>
            {t("list.clear")}
          </Link>
        </Text>
      ) : null}
    </Toolbar>
  )
}
