import { useTranslations } from "use-intl"
import type { Verdict } from "@/domain"
import { OUTCOME_TONE, Tag, VERDICT_OUTCOME, type TagSize } from "@/components/studio"

export type VerdictTagProps = { readonly verdict: Verdict; readonly size?: TagSize; readonly className?: string }

export function VerdictTag({ verdict, size = "sm", className }: VerdictTagProps) {
  const t = useTranslations("domain.verdict")
  return (
    <Tag tone={OUTCOME_TONE[VERDICT_OUTCOME[verdict]]} size={size} className={className}>
      {t(verdict)}
    </Tag>
  )
}

const CELL_ALIGN: Readonly<Record<"start" | "end", string>> = {
  start: "flex",
  end: "flex justify-end",
}

export function VerdictCell({ verdict, align }: { readonly verdict: Verdict; readonly align: "start" | "end" }) {
  return (
    <div className={CELL_ALIGN[align]}>
      <VerdictTag verdict={verdict} />
    </div>
  )
}
