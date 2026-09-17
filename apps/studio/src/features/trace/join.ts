import type { JoinResult } from "@/domain"
import type { Translator } from "@/i18n/translator"

const CLAUSE_SEPARATOR = " — "

const dropClause = (drop: JoinResult["dropped"][number], t: Translator): string =>
  drop.billed ? t("trace.join.droppedBilled", { branch: drop.branch }) : t("trace.join.dropped", { branch: drop.branch })

export const droppedText = (join: JoinResult, t: Translator): string => join.dropped.map((drop) => `${CLAUSE_SEPARATOR}${dropClause(drop, t)}`).join("")
