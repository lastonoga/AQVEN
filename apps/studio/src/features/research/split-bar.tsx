import { useTranslations } from "use-intl"
import { SERIES_SPLITS, type SplitCounts } from "@/domain"
import { Dot, Text } from "@/components/studio"
import { splitShare } from "./presenters"
import { SPLIT_TONE } from "./tones"

export function SplitBar({ splits }: { readonly splits: SplitCounts }) {
  const t = useTranslations("research.experiment.what.facts")
  const choice = useTranslations("research.vocabulary.splitChoice")
  const total = splits.dev + splits.holdout
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <div role="img" aria-label={t("splitAria", { dev: splits.dev, holdout: splits.holdout })} className="flex h-1.5 overflow-hidden rounded-xs bg-border">
        {SERIES_SPLITS.map((split) => (
          <div key={split} data-tone={SPLIT_TONE[split]} className="h-full bg-tone" style={{ width: splitShare(splits[split], total) }} />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        {SERIES_SPLITS.map((split) => (
          <span key={split} className="inline-flex items-center gap-1.5">
            <Dot tone={SPLIT_TONE[split]} shape="square" />
            <Text role="hint" tone="default" weight="semibold">
              {splits[split]}
            </Text>
            <Text role="hint" tone="neutral">
              {choice(split)}
            </Text>
          </span>
        ))}
      </div>
    </div>
  )
}
