import type { NodeCheck, TextLine } from "@/domain"
import { Heading, Surface, Tag, Text, TextBlock } from "@/components/studio"
import { CHECK_KIND } from "./presets"

function CheckRow({ check }: { readonly check: NodeCheck }) {
  const kind = CHECK_KIND[check.kind]
  return (
    <Surface variant="panel" radius="md" padding="xs">
      <Heading
        size="tiny"
        leading={
          <Tag tone={kind.tone} size="micro">
            {kind.code}
          </Tag>
        }
        title={check.rule}
        trailing={
          <Text role="small" tone="neutral">
            {check.policy}
          </Text>
        }
      />
    </Surface>
  )
}

export function WritesBody({ lines, checks }: { readonly lines: readonly TextLine[]; readonly checks: readonly NodeCheck[] }) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)] items-start gap-2.5">
      <Surface variant="well" padding="sm">
        <TextBlock lines={lines} />
      </Surface>
      <div className="flex flex-col gap-1.25">
        {checks.map((check) => (
          <CheckRow key={`${check.kind}:${check.rule}`} check={check} />
        ))}
      </div>
    </div>
  )
}
