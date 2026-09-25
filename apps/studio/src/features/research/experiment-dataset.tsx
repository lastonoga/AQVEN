import { Link } from "@tanstack/react-router"
import { Pencil } from "lucide-react"
import { useTranslations } from "use-intl"
import type { CaseTags, DatasetId, ExperimentDetail, FlowId } from "@/domain"
import { Text } from "@/components/studio"
import { Button } from "@/components/ui/button"
import { ROUTE_PATH } from "@/lib/routes"
import { casesFlowOf, casesSearch } from "./presenters"

type DatasetLineProps = {
  readonly experiment: ExperimentDetail
  readonly editing: boolean
  readonly onEdit: () => void
}

type CasesLinkProps = {
  readonly flow: FlowId | null
  readonly dataset: DatasetId
  readonly tags: CaseTags
  readonly label?: string
  readonly children: string
}

const LINK_CLASS = "rounded-xs underline decoration-dotted underline-offset-3 outline-none hover:decoration-solid focus-visible:ring-2 focus-visible:ring-ring"

const SEPARATOR = " · "

function CasesLink({ flow, dataset, tags, label, children }: CasesLinkProps) {
  if (flow === null) return <>{children}</>
  return (
    <Link to={ROUTE_PATH.cases} params={{ flowId: flow }} search={casesSearch(dataset, tags)} aria-label={label} className={LINK_CLASS}>
      {children}
    </Link>
  )
}

function TagLinks({ experiment }: { readonly experiment: ExperimentDetail }) {
  const t = useTranslations("research.experiment.dataset")
  const { cases } = experiment
  const flow = casesFlowOf(experiment)
  const entries = Object.entries(cases.tags)
  if (entries.length === 0) return <Text role="meta" tone="neutral">{`${SEPARATOR}${t("allCases")}`}</Text>
  return (
    <>
      {entries.map(([tag, value]) => (
        <Text key={tag} role="meta" tone="default">
          {SEPARATOR}
          <CasesLink flow={flow} dataset={cases.dataset} tags={{ [tag]: value }} label={t("tagAria", { tag, value })}>
            {`${tag}=${value}`}
          </CasesLink>
        </Text>
      ))}
    </>
  )
}

export function DatasetLine({ experiment, editing, onEdit }: DatasetLineProps) {
  const t = useTranslations("research.experiment.dataset")
  const { cases } = experiment
  return (
    <div aria-label={t("aria")} role="group" className="flex min-w-0 flex-wrap items-baseline gap-x-0 gap-y-1">
      <Text role="meta" tone="neutral" className="mr-1.5">
        {t("label")}
      </Text>
      <Text role="meta" tone="default" weight="semibold" className="font-mono wrap-anywhere">
        <CasesLink flow={casesFlowOf(experiment)} dataset={cases.dataset} tags={cases.tags} label={t("openAria", { dataset: cases.dataset })}>
          {cases.dataset}
        </CasesLink>
      </Text>
      <TagLinks experiment={experiment} />
      <Text role="meta" tone="default">
        {SEPARATOR}
        {t("count", { selected: cases.selected, total: cases.total })}
      </Text>
      {editing ? null : (
        <Button type="button" size="xs" variant="ghost" className="ml-2 self-center" onClick={onEdit}>
          <Pencil aria-hidden />
          {t("change")}
        </Button>
      )}
    </div>
  )
}
