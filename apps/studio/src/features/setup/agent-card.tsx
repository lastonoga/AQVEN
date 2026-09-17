import type { ReactNode } from "react"
import { useRouter } from "@tanstack/react-router"
import { RefreshCw } from "lucide-react"
import { useTranslations } from "use-intl"
import type { AgentProbe, AgentToolsCheck } from "@/domain"
import { Heading, PropertyList, Surface, Text, type PropertyRow } from "@/components/studio"
import { Button } from "@/components/ui/button"
import { useRelativeTime } from "@/i18n/format"
import { agentState } from "@/lib/setup"
import { CommandLine } from "./command-line"
import { AGENT_STATE_TONE, agentFix } from "./presenters"

type AgentTranslator = ReturnType<typeof useTranslations<"setup.agent">>

const toolsRow = (tools: AgentToolsCheck, t: AgentTranslator): PropertyRow => {
  if (tools.status === "connected") return { key: t("tools"), value: t("toolsConnected", { count: tools.toolCount }), tone: "success" }
  if (tools.status === "failed") return { key: t("tools"), value: t("toolsFailed", { reason: tools.reason }), tone: "destructive" }
  return { key: t("tools"), value: t("toolsPending"), tone: "neutral" }
}

const cliRow = (probe: AgentProbe, t: AgentTranslator): PropertyRow => {
  if (probe.install.status === "missing") return { key: t("cli"), value: t("notInstalled"), tone: "destructive" }
  return { key: t("cli"), value: `${probe.install.version} · ${t(`origin.${probe.install.origin}`)} · ${probe.install.path}` }
}

const signInRow = (probe: AgentProbe, t: AgentTranslator): PropertyRow => {
  if (probe.auth.status === "signedOut") return { key: t("signIn"), value: t("signedOut"), tone: "warning" }
  return { key: t("signIn"), value: probe.auth.plan, tone: "success" }
}

function AgentFixHint({ probe }: { readonly probe: AgentProbe }) {
  const t = useTranslations("setup.agent.fix")
  const fix = agentFix(probe)
  if (fix === null) return null
  return (
    <div className="flex flex-col gap-1.5 px-2.75 pb-2.75">
      <Text role="hint" tone="neutral">
        {fix.kind === "install" ? t("install") : t(`signIn.${probe.kind}`)}
      </Text>
      <CommandLine command={fix.command} />
    </div>
  )
}

export type AgentCardProps = { readonly probe: AgentProbe; readonly selected?: boolean; readonly children?: ReactNode }

export function AgentCard({ probe, selected = false, children }: AgentCardProps) {
  const t = useTranslations("setup.agent")
  const name = useTranslations("setup.agent.names")
  const ago = useRelativeTime("long")
  const router = useRouter()
  const state = agentState(probe)
  const recheck = (
    <Button
      variant="outline"
      size="xs"
      onClick={() => {
        void router.invalidate()
      }}
    >
      <RefreshCw />
      {t("checkAgain")}
    </Button>
  )
  return (
    <Surface variant="panel" selected={selected} className="flex flex-col overflow-hidden">
      <div className="px-2.75 pt-2.75 pb-1">
        <Heading
          size="block"
          title={name(probe.kind)}
          tags={[{ children: t(`state.${state}`), tone: AGENT_STATE_TONE[state], size: "xs" }]}
          trailing={recheck}
        />
      </div>
      <PropertyList
        rows={[cliRow(probe, t), signInRow(probe, t), toolsRow(probe.tools, t), { key: t("checked"), value: ago(probe.checkedAt) }]}
      />
      <AgentFixHint probe={probe} />
      {children}
    </Surface>
  )
}
