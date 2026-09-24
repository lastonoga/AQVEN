import type { ReactNode } from "react"
import { Link } from "@tanstack/react-router"
import { useFormatter, useTranslations } from "use-intl"
import type { StatusCheck } from "@/api/server"
import { Dot, Text } from "@/components/studio"
import { ROUTE_PATH } from "@/lib/routes"
import { rowsOf, type CheckLine } from "./presenters"

export type CheckListProps = { readonly checks: readonly StatusCheck[]; readonly onNavigate: () => void }

type CheckSentenceProps = { readonly line: CheckLine; readonly onNavigate: () => void }

function CheckSentence({ line, onNavigate }: CheckSentenceProps) {
  const t = useTranslations("health")
  const format = useFormatter()
  const link = (chunks: ReactNode) => (
    <Link to={ROUTE_PATH.settings} onClick={onNavigate} className="underline underline-offset-3">
      {chunks}
    </Link>
  )
  if (line.kind === "state") return t.rich(`checks.${line.check}.${line.state}`, { link })
  return t.rich(`reasons.${line.reason}`, { count: line.count, names: format.list(line.names), link })
}

export function CheckList({ checks, onNavigate }: CheckListProps) {
  const t = useTranslations("health.details")
  return (
    <ul aria-label={t("checksAria")} className="flex flex-col gap-2">
      {rowsOf(checks).map((row) => (
        <li key={row.id} data-check={row.id} className="flex items-start gap-2">
          <span className="flex h-[1lh] items-center text-xs">
            <Dot tone={row.tone} size="xs" />
          </span>
          <div className="flex min-w-0 flex-col gap-1">
            {row.lines.map((line, index) => (
              <Text key={index} as="p" role="hint" tone="default">
                <CheckSentence line={line} onNavigate={onNavigate} />
              </Text>
            ))}
          </div>
        </li>
      ))}
    </ul>
  )
}
