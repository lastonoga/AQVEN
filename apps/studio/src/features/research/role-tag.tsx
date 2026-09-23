import { useTranslations } from "use-intl"
import type { QuestionKind, VariantRole } from "@/domain"
import { Tag } from "@/components/studio"
import { shownRole } from "./presenters"
import { ROLE_TONE } from "./tones"

export type RoleTagProps = { readonly role: VariantRole; readonly question: QuestionKind }

export function RoleTag({ role, question }: RoleTagProps) {
  const t = useTranslations("research.vocabulary.role")
  const shown = shownRole(role, question)
  if (shown === null) return null
  return (
    <Tag size="micro" fill="tint" tone={ROLE_TONE[shown]}>
      {t(shown)}
    </Tag>
  )
}
