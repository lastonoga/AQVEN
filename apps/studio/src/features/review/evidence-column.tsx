import { Heading, PropertyList, Surface, Text } from "@/components/studio"
import type { ReviewEvidence } from "./review-sections"

export function EvidenceColumn({ section }: { readonly section: ReviewEvidence }) {
  return (
    <Heading size="label" title={section.title}>
      <div className="flex flex-col gap-2.25">
        <Surface variant={section.note.variant} tone={section.note.tone} padding="sm">
          {section.note.lines.map((line) => (
            <Text key={line.id} as="p" role="note" tone={line.tone}>
              {line.content}
            </Text>
          ))}
        </Surface>
        <Surface variant="panel" radius="lg" className="overflow-hidden">
          <PropertyList variant="grid" rows={section.rows} />
        </Surface>
      </div>
    </Heading>
  )
}
