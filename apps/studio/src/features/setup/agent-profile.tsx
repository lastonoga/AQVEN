import { useState } from "react"
import { useTranslations } from "use-intl"
import type { AgentChoice, AgentChoiceField, AgentLimitField, AgentProfile } from "@/domain"
import { Text, TitledPanel, type ChoiceItem } from "@/components/studio"
import { descriptionOf, effortFor, modelOf } from "./presenters"
import { ChoiceRow, ChoiceSetting, NumberSetting, SettingRow, SettingRows } from "./setting-row"

const itemsOf = (choices: readonly AgentChoice[]): readonly ChoiceItem<string>[] => choices.map(({ value }) => ({ value, label: value }))

function ModelAndEffort({ profile }: { readonly profile: AgentProfile }) {
  const t = useTranslations("setup.settings.agents")
  const name = useTranslations("setup.agent.names")
  const [modelId, setModelId] = useState(profile.model)
  const [effort, setEffort] = useState(profile.effort)
  const model = modelOf(profile.models, modelId)
  const shownEffort = effortFor(model, effort)
  const pickModel = (next: string): void => {
    setModelId(next)
    setEffort(effortFor(modelOf(profile.models, next), effort))
  }
  return (
    <>
      <ChoiceRow
        title={t("model")}
        hint={t("modelHint")}
        label={`${name(profile.kind)} ${t("model")}`}
        items={profile.models.map(({ id, label }) => ({ value: id, label }))}
        value={modelId}
        onValueChange={pickModel}
      />
      {model === undefined || shownEffort === null ? (
        <SettingRow title={t("effort")} hint={t("effortHint")}>
          <Text role="hint" tone="neutral">
            {t("effortUnsupported", { model: model?.label ?? modelId })}
          </Text>
        </SettingRow>
      ) : (
        <ChoiceRow
          title={t("effort")}
          hint={t("effortHint")}
          detail={descriptionOf(model.efforts, shownEffort)}
          label={`${name(profile.kind)} ${t("effort")}`}
          items={itemsOf(model.efforts)}
          value={shownEffort}
          onValueChange={setEffort}
        />
      )}
    </>
  )
}

function ChoiceField({ field, agent }: { readonly field: AgentChoiceField; readonly agent: string }) {
  const t = useTranslations("setup.settings.agents.choices")
  return (
    <ChoiceSetting
      title={t(`${field.id}.title`)}
      hint={t(`${field.id}.hint`)}
      label={`${agent} ${t(`${field.id}.title`)}`}
      items={itemsOf(field.choices)}
      initial={field.value}
      detailOf={(value) => descriptionOf(field.choices, value)}
    />
  )
}

function LimitField({ field, agent }: { readonly field: AgentLimitField; readonly agent: string }) {
  const t = useTranslations("setup.settings.agents")
  return (
    <NumberSetting
      title={t(`limits.${field.id}.title`)}
      hint={t(`limits.${field.id}.hint`)}
      label={`${agent} ${t(`limits.${field.id}.title`)}`}
      placeholder={t("noLimit")}
      initial={field.value}
      min={field.min}
      step={field.step}
    />
  )
}

export function AgentProfilePanel({ profile }: { readonly profile: AgentProfile }) {
  const t = useTranslations("setup.settings.agents")
  const name = useTranslations("setup.agent.names")
  const agent = name(profile.kind)
  return (
    <TitledPanel size="section" title={t("configuration", { agent })} below={[t("configurationHint")]}>
      <SettingRows>
        <ModelAndEffort profile={profile} />
        {profile.choices.map((field) => (
          <ChoiceField key={field.id} field={field} agent={agent} />
        ))}
        {profile.limits.map((field) => (
          <LimitField key={field.id} field={field} agent={agent} />
        ))}
      </SettingRows>
    </TitledPanel>
  )
}
