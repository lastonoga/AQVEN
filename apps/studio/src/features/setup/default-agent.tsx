import { useState } from "react"
import { useTranslations } from "use-intl"
import type { AgentKind, AgentSetup } from "@/domain"
import { ChoiceGroup, Text } from "@/components/studio"
import { agentReady } from "@/lib/setup"
import { chosenAgent } from "./presenters"
import { SettingRow } from "./setting-row"

type DefaultAgentProps = { readonly agents: readonly AgentSetup[]; readonly preferred: AgentKind | null }

function DefaultAgentChoice({ agents, initial }: { readonly agents: readonly AgentSetup[]; readonly initial: AgentKind }) {
  const t = useTranslations("setup.agent")
  const name = useTranslations("setup.agent.names")
  const [value, setValue] = useState<AgentKind>(initial)
  const items = agents.map(({ probe }) => ({ value: probe.kind, label: name(probe.kind), disabled: !agentReady(probe) }))
  return <ChoiceGroup appearance="segmented" label={t("default")} items={items} value={value} onValueChange={setValue} />
}

export function DefaultAgent({ agents, preferred }: DefaultAgentProps) {
  const t = useTranslations("setup.agent")
  const initial = chosenAgent(preferred, agents)
  if (agents.length < 2) return null
  return (
    <SettingRow title={t("default")} hint={t("defaultHint")}>
      {initial === null ? (
        <Text role="hint" tone="warning">
          {t("noneReady")}
        </Text>
      ) : (
        <DefaultAgentChoice agents={agents} initial={initial} />
      )}
    </SettingRow>
  )
}
