import { Play } from "lucide-react"
import { useTranslations } from "use-intl"
import type { ExperimentDetail, SeriesSummary } from "@/domain"
import { Actions, Heading, type TagSpec } from "@/components/studio"
import { joinMeta } from "@/lib/format"
import { useQuestionCopy } from "./copy"
import { Failure } from "./layout"
import { guardrailSentences, questionSentence } from "./presenters"
import { SERIES_STATUS_TONE, VERDICT_TONE } from "./tones"
import { priceOf, type Launch } from "./use-launch"

const LIST_JOIN = "; "

function useLatestTags(latest: SeriesSummary | null): readonly TagSpec[] {
  const t = useTranslations("research.vocabulary")
  if (latest === null) return []
  if (latest.verdict === null) return [{ children: t(`status.${latest.status}`), tone: SERIES_STATUS_TONE[latest.status] }]
  return [{ children: t(`verdict.${latest.verdict.state}`), tone: VERDICT_TONE[latest.verdict.state], fill: "soft" }]
}

export function RunButton({ launch }: { readonly launch: Launch }) {
  const t = useTranslations("research.experiment.question")
  const price = priceOf(launch.estimate)
  const { request } = launch
  return (
    <Actions
      actions={[
        {
          id: "run",
          label: price === null ? t("run") : t("runPrice", { price }),
          variant: "default",
          icon: Play,
          disabled: request === null,
          pending: launch.action.pending("start"),
          ...(request === null ? {} : { onClick: () => { launch.start(request) } }),
        },
      ]}
    />
  )
}

export function ExperimentQuestion({ experiment, latest, launch }: { readonly experiment: ExperimentDetail; readonly latest: SeriesSummary | null; readonly launch: Launch }) {
  const t = useTranslations("research.experiment")
  const question = useQuestionCopy()
  const tags = useLatestTags(latest)
  const guards = guardrailSentences(experiment.question, experiment.metrics, question)
  const { state } = launch.action
  return (
    <div className="flex flex-col gap-2">
      <Heading
        size="page"
        title={questionSentence(experiment.question, experiment.metrics, question)}
        tags={tags}
        wrap
        below={[
          guards.length === 0 ? null : <span key="guards">{t("guardrails", { list: guards.join(LIST_JOIN) })}</span>,
          <span key="about">{joinMeta([experiment.id, experiment.description])}</span>,
        ].filter((line) => line !== null)}
        trailing={<RunButton launch={launch} />}
      />
      {state.kind === "failed" ? <Failure message={t("launch.failed", { reason: state.message })} /> : null}
    </div>
  )
}
