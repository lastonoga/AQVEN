import { Plus } from "lucide-react"
import { useTranslations } from "use-intl"
import type { NodesOverview, RegistryEntry, RegistryKind } from "@/domain"
import { Heading, Surface, Tag, Text, Toolbar } from "@/components/studio"
import { Button } from "@/components/ui/button"
import { noop } from "@/lib/noop"
import { REGISTRY_KIND, REGISTRY_KINDS } from "./presets"
import { registryTrailing } from "./presenters"

type RegistryCardProps = { readonly kind: RegistryKind; readonly entries: readonly RegistryEntry[] }

function RegistryRow({ entry }: { readonly entry: RegistryEntry }) {
  const tUsage = useTranslations("domain.usage")
  return (
    <Surface variant="panel" radius="md" padding="xs" interactive asChild>
      <button type="button" onClick={noop} className="w-full">
        <Toolbar
          className="gap-2"
          end={
            <Text role="caption" tone="neutral">
              {registryTrailing(entry, tUsage(entry.usage.unit, { count: entry.usage.count }))}
            </Text>
          }
        >
          <Tag tone={REGISTRY_KIND[entry.kind].tone} size="md" wrap>
            {entry.label}
          </Tag>
        </Toolbar>
      </button>
    </Surface>
  )
}

function RegistryCard({ kind, entries }: RegistryCardProps) {
  const tKind = useTranslations("domain.registryKind")
  const tCommon = useTranslations("common")
  return (
    <Surface variant="panel" padding="md">
      <Heading
        size="label"
        title={tKind(kind)}
        description={entries.length}
        trailing={
          <Button variant="link" size="inline-xs" onClick={noop}>
            <Plus className="size-3" />
            {tCommon("new")}
          </Button>
        }
      >
        <div className="flex flex-col gap-1.25">
          {entries.map((entry) => (
            <RegistryRow key={entry.id} entry={entry} />
          ))}
        </div>
      </Heading>
    </Surface>
  )
}

export function Registry({ registry }: { readonly registry: NodesOverview["registry"] }) {
  const t = useTranslations("nodes.registry")
  return (
    <Heading size="label" title={t("title")} description={t("hint")}>
      <div className="grid grid-cols-2 gap-3">
        {REGISTRY_KINDS.map((kind) => (
          <RegistryCard key={kind} kind={kind} entries={registry[kind]} />
        ))}
      </div>
    </Heading>
  )
}
