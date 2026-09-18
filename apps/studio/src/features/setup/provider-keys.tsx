import { useTranslations } from "use-intl"
import type { ApiProviderKey } from "@/domain"
import { Tag } from "@/components/studio"
import type { Translator } from "@/i18n/translator"
import { keySource, PROVIDER_SOURCE_TONE } from "./presenters"
import { SettingRow, SettingRows } from "./setting-row"

const keyDetail = (entry: ApiProviderKey, t: Translator<"setup.providers">): string => {
  if (entry.masked === null) return t("notSet", { variable: entry.env_var })
  return `${entry.masked} · ${entry.env_var}`
}

function ProviderRow({ entry }: { readonly entry: ApiProviderKey }) {
  const t = useTranslations("setup.providers")
  const source = keySource(entry)
  return (
    <SettingRow title={entry.provider} hint={keyDetail(entry, t)} detail={entry.declared ? t("declared") : undefined}>
      <Tag tone={PROVIDER_SOURCE_TONE[source]} size="xs">
        {t(`source.${source}`)}
      </Tag>
    </SettingRow>
  )
}

export function ProviderKeys({ providers }: { readonly providers: readonly ApiProviderKey[] }) {
  return (
    <SettingRows>
      {providers.map((entry) => (
        <ProviderRow key={entry.provider} entry={entry} />
      ))}
    </SettingRows>
  )
}
