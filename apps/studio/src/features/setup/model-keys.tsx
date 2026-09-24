import type { ReactNode } from "react"
import { useTranslations } from "use-intl"
import { Text, TitledPanel } from "@/components/studio"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import type { Translator } from "@/i18n/translator"
import { KeyRow } from "./key-row"
import { dotenvKeys, hasProviderKey, isShadowed, otherSecrets, type ProjectSecret } from "./presenters"
import type { ProjectKeys, ProjectKeysState } from "./project-keys"
import { SettingRows } from "./setting-row"

type KeysPanelProps = {
  readonly keys: ProjectKeys
  readonly onChanged: () => Promise<void>
}

const usedBy = (secret: ProjectSecret, t: Translator<"setup.secrets">): string =>
  t("usedBy", { users: secret.users.map((user) => t(`scope.${user.scope}`, { name: user.name })).join(", ") })

export function KeysBoundary({ state, children }: { readonly state: ProjectKeysState; readonly children: (keys: ProjectKeys) => ReactNode }) {
  const t = useTranslations("setup.keys")
  const { load, retry } = state
  if (load.kind === "ready") return children(load.keys)
  if (load.kind === "failed") {
    return (
      <Alert variant="destructive">
        <AlertTitle>{t("loadError")}</AlertTitle>
        <AlertDescription>{load.message}</AlertDescription>
        <Button variant="outline" size="sm" className="mt-3" onClick={retry}>
          {t("retry")}
        </Button>
      </Alert>
    )
  }
  return (
    <div role="status" aria-label={t("loading")} className="flex flex-col gap-3">
      <Skeleton aria-hidden className="h-5 w-1/3" />
      <Skeleton aria-hidden className="h-20" />
    </div>
  )
}

export function ModelKeysPanel({ keys, onChanged }: KeysPanelProps) {
  const t = useTranslations("setup.keys")
  const dotenv = dotenvKeys(keys.stored)
  return (
    <div className="flex flex-col gap-2">
      <TitledPanel size="section" title={t("title")} below={[t("description")]}>
        <SettingRows>
          {keys.providers.map((entry) => (
            <KeyRow
              key={entry.setting_key}
              title={entry.provider}
              caption={entry.env_var}
              entry={entry}
              detail={entry.declared ? t("declared") : undefined}
              shadowed={isShadowed(entry, dotenv)}
              onChanged={onChanged}
            />
          ))}
        </SettingRows>
      </TitledPanel>
      {hasProviderKey(keys.providers) ? null : (
        <Text role="hint" tone="warning">
          {t("missingNote")}
        </Text>
      )}
    </div>
  )
}

export function OtherSecretsPanel({ keys, onChanged }: KeysPanelProps) {
  const t = useTranslations("setup.secrets")
  const secrets = otherSecrets(keys.secrets, keys.providers)
  const dotenv = dotenvKeys(keys.stored)
  if (secrets.length === 0) return null
  return (
    <TitledPanel size="section" title={t("title")} below={[t("description")]}>
      <SettingRows>
        {secrets.map((secret) => (
          <KeyRow
            key={secret.setting_key}
            title={secret.env_var}
            entry={secret}
            detail={usedBy(secret, t)}
            shadowed={isShadowed(secret, dotenv)}
            onChanged={onChanged}
          />
        ))}
      </SettingRows>
    </TitledPanel>
  )
}
