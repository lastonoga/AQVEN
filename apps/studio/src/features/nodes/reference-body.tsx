import { Surface, Tag, TextBlock } from "@/components/studio"
import { noop } from "@/lib/noop"
import type { Reference } from "./presenters"

export function ReferenceBody({ reference }: { readonly reference: Reference }) {
  return (
    <div className="flex flex-col items-start gap-2.25">
      <Tag tone={reference.tone} size="md" wrap interactive asChild detail={reference.detail}>
        <button type="button" onClick={noop}>
          {reference.text}
        </button>
      </Tag>
      <Surface variant="well" padding="sm" className="self-stretch">
        <TextBlock lines={reference.lines} />
      </Surface>
    </div>
  )
}
