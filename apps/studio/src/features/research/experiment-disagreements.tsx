import { Link } from "@tanstack/react-router"
import { ArrowUpRight } from "lucide-react"
import { useTranslations } from "use-intl"
import type { SeriesCaseRow, SeriesDetail } from "@/domain"
import { Surface, Tag, Text } from "@/components/studio"
import { ROUTE_PATH } from "@/lib/routes"
import { ResearchSection } from "./layout"
import { tallyTone } from "./series-presenters"

const SHOWN_DISAGREEMENTS = 5

function CaseLine({ row }: { readonly row: SeriesCaseRow }) {
  const t = useTranslations("research.experiment.disagree")
  return (
    <li className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
      <Text role="cell" tone="default" weight="semibold" truncate>
        {row.name}
      </Text>
      {row.variants.map((tally) => (
        <Tag key={tally.variant} size="xs" fill="tint" tone={tallyTone(tally)}>
          {t("tally", { variant: tally.variant, passed: tally.passed, total: tally.total })}
        </Tag>
      ))}
    </li>
  )
}

function AllLink({ series, count }: { readonly series: SeriesDetail; readonly count: number }) {
  const t = useTranslations("research.experiment.disagree")
  return (
    <Text role="link" tone="neutral" asChild>
      <Link to={ROUTE_PATH.series} params={{ seriesId: series.id }} search={{ divergent: true }} className="inline-flex items-center gap-1">
        {t("all", { count })}
        <ArrowUpRight aria-hidden className="size-3" />
      </Link>
    </Text>
  )
}

export function ExperimentDisagreements({ latest, cases }: { readonly latest: SeriesDetail | null; readonly cases: readonly SeriesCaseRow[] }) {
  const t = useTranslations("research.experiment.disagree")
  if (latest === null || latest.variants.length < 2) return null
  const shown = cases.slice(0, SHOWN_DISAGREEMENTS)
  return (
    <ResearchSection title={t("title")} trailing={cases.length === 0 ? null : <AllLink series={latest} count={cases.length} />}>
      {shown.length === 0 ? (
        <Text as="p" role="hint" tone="neutral">
          {t("none")}
        </Text>
      ) : (
        <Surface variant="panel">
          <ul aria-label={t("title")} className="divide-y divide-border">
            {shown.map((row) => (
              <CaseLine key={row.name} row={row} />
            ))}
          </ul>
        </Surface>
      )}
    </ResearchSection>
  )
}
