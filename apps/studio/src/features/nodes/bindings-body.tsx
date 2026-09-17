import { Plus } from "lucide-react"
import { useTranslations } from "use-intl"
import type { Binding } from "@/domain"
import { Matrix, Surface, Text } from "@/components/studio"
import { Button } from "@/components/ui/button"
import { noop } from "@/lib/noop"
import { bindingFields } from "./binding-fields"
import { BINDINGS_MIN_WIDTH } from "./presets"

export function BindingsBody({ bindings }: { readonly bindings: readonly Binding[] }) {
  const t = useTranslations("nodes.bindings")
  const tSource = useTranslations("domain.bindingSource")
  const fields = bindingFields({ column: (column) => t(`column.${column}`), source: (source) => tSource(source) })
  return (
    <>
      <Surface variant="panel" radius="lg" className="overflow-x-auto">
        <Matrix
          orientation="rows"
          label={t("title")}
          minWidth={BINDINGS_MIN_WIDTH}
          items={bindings}
          itemKey={(binding) => binding.input}
          fields={fields}
        />
      </Surface>
      <div className="mt-2.25 flex flex-wrap items-center gap-2">
        <Button variant="dashed" size="xs" onClick={noop}>
          <Plus />
          {t("add")}
        </Button>
        <Text role="caption" tone="neutral">
          {t("rewireHint")}
        </Text>
      </div>
    </>
  )
}
