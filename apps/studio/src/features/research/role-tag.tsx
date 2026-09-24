import { useTranslations } from "use-intl"
import type { ExperimentQuestion, VariantId, VariantRole } from "@/domain"
import { Tag } from "@/components/studio"
import { ROW_ROLE_TONE } from "./tones"
import { rowRole, type RowRole } from "./variant-table"

type RoleSize = "micro" | "xs"

export type RowRoleTagProps = { readonly role: RowRole; readonly size?: RoleSize }

export type RoleTagProps = {
  readonly variant: VariantId
  readonly role: VariantRole
  readonly question: ExperimentQuestion
  readonly size?: RoleSize
}

export function RowRoleTag({ role, size = "micro" }: RowRoleTagProps) {
  const t = useTranslations("research.vocabulary.role")
  return (
    <Tag size={size} fill="tint" tone={ROW_ROLE_TONE[role]}>
      {t(role)}
    </Tag>
  )
}

export function RoleTag({ variant, role, question, size }: RoleTagProps) {
  return <RowRoleTag role={rowRole(question, { id: variant, role })} {...(size === undefined ? {} : { size })} />
}
