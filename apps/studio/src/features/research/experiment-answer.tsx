import { Link } from "@tanstack/react-router"
import { ArrowUpRight, RotateCw } from "lucide-react"
import { useTranslations } from "use-intl"
import type { ExperimentDetail, SeriesDetail, VerdictState } from "@/domain"
import { Actions, Empty, Heading, Surface, Text, Toolbar, type TagSpec } from "@/components/studio"
import { Button } from "@/components/ui/button"
import { HandoffButton } from "@/features/chat-handoff"
import { ROUTE_PATH } from "@/lib/routes"
import { seriesRef } from "./presenters"
import { verdictGap } from "./series-presenters"
import { VERDICT_TONE } from "./tones"
import { freshRequest, type Launch } from "./use-launch"

type AnswerProps = { readonly experiment: ExperimentDetail; readonly latest: SeriesDetail | null; readonly launch: Launch }

const nextHypothesisPrompt = (experiment: ExperimentDetail, series: SeriesDetail) => (): string =>
  [
    `Suggest the next hypothesis after the experiment ${experiment.id} (${experiment.files.spec}).`,
    `Its latest series ${series.id} on ${series.on} cases ended ${series.verdict?.state ?? series.status}: ${series.verdict?.text ?? "no verdict"}.`,
    "Give the failure_mode it targets, the question with its metric and margin, the subject, the variants as agents from agents/, the checks and the cases by tags.",
    "Do not write files yet: I will pick one, then you write experiments/<experiment_id>/experiment.yaml and run aqven check.",
  ].join("\n")

function AnswerText({ experiment, series }: { readonly experiment: ExperimentDetail; readonly series: SeriesDetail }) {
  const t = useTranslations("research.experiment.answer")
  const text = experiment.question.kind === "look" ? t("look") : (series.verdict?.text ?? t(`gap.${verdictGap(series)}`))
  return (
    <Text as="p" role="prose" tone="default">
      {text}
    </Text>
  )
}

function answerTags(series: SeriesDetail, verdict: (state: VerdictState) => string): readonly TagSpec[] {
  if (series.verdict === null) return []
  return [{ children: verdict(series.verdict.state), tone: VERDICT_TONE[series.verdict.state], fill: "soft" }]
}

function WhatNext({ experiment, series, launch }: { readonly experiment: ExperimentDetail; readonly series: SeriesDetail; readonly launch: Launch }) {
  const t = useTranslations("research.experiment.answer")
  const fresh = freshRequest(experiment, launch.request)
  return (
    <Toolbar wrap className="gap-2.5">
      <Actions
        actions={[
          {
            id: "fresh",
            label: t("fresh"),
            icon: RotateCw,
            disabled: fresh === null,
            pending: launch.action.pending("start"),
            ...(fresh === null ? {} : { onClick: () => { launch.start(fresh) } }),
          },
        ]}
      />
      <HandoffButton label={t("next")} prompt={nextHypothesisPrompt(experiment, series)} />
      <Button variant="outline" size="sm" asChild>
        <Link to={ROUTE_PATH.series} params={{ seriesId: series.id }}>
          {t("open", { ref: seriesRef(series.id) })}
          <ArrowUpRight aria-hidden />
        </Link>
      </Button>
    </Toolbar>
  )
}

export function ExperimentAnswer({ experiment, latest, launch }: AnswerProps) {
  const t = useTranslations("research")
  if (latest === null) {
    return (
      <section aria-label={t("experiment.answer.title")} className="flex flex-col gap-3">
        <Empty title={t("experiment.answer.empty")} hint={t("experiment.answer.emptyHint")} />
      </section>
    )
  }
  return (
    <Surface
      variant="tinted"
      tone={latest.verdict === null ? "neutral" : VERDICT_TONE[latest.verdict.state]}
      padding="md"
      role="region"
      aria-label={t("experiment.answer.title")}
      className="flex flex-col gap-3"
    >
      <Heading size="block" title={t("experiment.answer.title")} tags={answerTags(latest, (state) => t(`vocabulary.verdict.${state}`))} wrap />
      <AnswerText experiment={experiment} series={latest} />
      <WhatNext experiment={experiment} series={latest} launch={launch} />
    </Surface>
  )
}
