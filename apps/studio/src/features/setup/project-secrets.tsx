import { useTranslations } from "use-intl"
import type { ApiSecret } from "@/domain"
import { Empty, Tag } from "@/components/studio"
import { keySource, PROVIDER_SOURCE_TONE } from "./presenters"
import { SettingRow, SettingRows } from "./setting-row"

const rowKey = (secret: ApiSecret): string => `${secret.declared_in}:${secret.name}`

function SecretRow({ secret }: { readonly secret: ApiSecret }) {
  const t = useTranslations("setup.secrets")
  const sourceLabel = useTranslations("setup.providers.source")
  const source = keySource(secret)
  return (
    <SettingRow
      title={secret.env_var}
      hint={t("declaredBy", { name: secret.name, scope: t(`scope.${secret.scope}`), by: secret.declared_by })}
      detail={secret.declared_in}
    >
      <Tag tone={PROVIDER_SOURCE_TONE[source]} size="xs">
        {sourceLabel(source)}
      </Tag>
    </SettingRow>
  )
}

export function ProjectSecrets({ secrets }: { readonly secrets: readonly ApiSecret[] }) {
  const t = useTranslations("setup.secrets")
  if (secrets.length === 0) return <Empty title={t("empty")} />
  return (
    <SettingRows>
      {secrets.map((secret) => (
        <SecretRow key={rowKey(secret)} secret={secret} />
      ))}
    </SettingRows>
  )
}
