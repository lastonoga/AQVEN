import { useTranslations } from "use-intl"
import type { ExperimentDetail, SeriesSummary } from "@/domain"
import { Heading, type TagSpec } from "@/components/studio"
import { useQuestionCopy, useSpendText } from "./copy"
import { Failure } from "./layout"
import { questionSentence } from "./presenters"
import { RunButton } from "./run-button"
import { SERIES_STATUS_TONE, VERDICT_TONE } from "./tones"
import type { Launch } from "./use-launch"
import { shownEstimate } from "./use-launch-estimate"

function useLatestTags(latest: SeriesSummary | null): readonly TagSpec[] {
  const t = useTranslations("research.vocabulary")
  if (latest === null) return []
  if (latest.verdict === null) return [{ children: t(`status.${latest.status}`), tone: SERIES_STATUS_TONE[latest.status] }]
  return [{ children: t(`verdict.${latest.verdict.state}`), tone: VERDICT_TONE[latest.verdict.state], fill: "soft" }]
}

function HeaderRun({ launch }: { readonly launch: Launch }) {
  const t = useTranslations("research.experiment.question")
  const spendText = useSpendText()
  const estimate = shownEstimate(launch.estimate)
  return <RunButton launch={launch} label={estimate === null ? t("run") : t("runEstimate", { estimate: spendText(estimate) })} />
}

export function ExperimentQuestion({ experiment, latest, launch }: { readonly experiment: ExperimentDetail; readonly latest: SeriesSummary | null; readonly launch: Launch }) {
  const t = useTranslations("research.experiment")
  const question = useQuestionCopy()
  const tags = useLatestTags(latest)
  const { state } = launch.action
  return (
    <div className="flex flex-col gap-2">
      <Heading
        size="page"
        title={questionSentence(experiment.question, experiment.metrics, question)}
        tags={tags}
        wrap
        below={[<span key="about">{experiment.id}</span>]}
        trailing={<HeaderRun launch={launch} />}
      />
      {state.kind === "failed" ? <Failure message={t("launch.failed", { reason: state.message })} /> : null}
    </div>
  )
}
