import { useTranslations } from "use-intl"
import type { ProviderKey, SecretSource } from "@/domain"
import { Actions, Tag, type Tone } from "@/components/studio"
import { SettingRow, SettingRows } from "./setting-row"

const SOURCE_TONE: Readonly<Record<SecretSource | "missing", Tone>> = {
  project: "success",
  studio: "success",
  environment: "primary",
  missing: "neutral",
}

type ProvidersTranslator = ReturnType<typeof useTranslations<"setup.providers">>

const keyDetail = (entry: ProviderKey, t: ProvidersTranslator): string => {
  if (entry.masked === null) return t("notSet", { variable: entry.envVar })
  if (entry.source === "environment") return `${entry.masked} · ${t("fromEnv", { variable: entry.envVar })}`
  return entry.masked
}

function ProviderRow({ entry }: { readonly entry: ProviderKey }) {
  const t = useTranslations("setup.providers")
  const source = entry.source ?? "missing"
  const detail = keyDetail(entry, t)
  const actions =
    entry.source === null || entry.source === "environment"
      ? [{ id: "set", label: t("set") }]
      : [
          { id: "replace", label: t("replace") },
          { id: "remove", label: t("remove"), variant: "ghost" as const },
        ]
  return (
    <SettingRow title={t(`names.${entry.provider}`)} hint={detail}>
      <div className="flex items-center gap-2">
        <Tag tone={SOURCE_TONE[source]} size="xs">
          {t(`source.${source}`)}
        </Tag>
        <Actions actions={actions} />
      </div>
    </SettingRow>
  )
}

export function ProviderKeys({ providers }: { readonly providers: readonly ProviderKey[] }) {
  return (
    <SettingRows>
      {providers.map((entry) => (
        <ProviderRow key={entry.provider} entry={entry} />
      ))}
    </SettingRows>
  )
}
