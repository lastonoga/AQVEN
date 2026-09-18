import { Heading, PropertyList, StructuredValue, Surface, Text, ValueDisplayProvider, ValueModeSwitch } from "@/components/studio"
import type { ReviewEvidence } from "./review-sections"

export function EvidenceColumn({ section }: { readonly section: ReviewEvidence }) {
  return (
    <ValueDisplayProvider>
      <Heading size="label" title={section.title} trailing={section.value === undefined ? null : <ValueModeSwitch />}>
        <div className="flex flex-col gap-2.25">
          {section.lines.length === 0 ? null : (
            <Surface variant="well" padding="sm">
              {section.lines.map((line) => (
                <Text key={line} as="p" role="note" tone="neutral">
                  {line}
                </Text>
              ))}
            </Surface>
          )}
          {section.value === undefined ? null : (
            <Surface variant="well" padding="sm">
              <StructuredValue value={section.value} />
            </Surface>
          )}
          {section.value !== undefined || section.rows.length === 0 ? null : (
            <Surface variant="panel" radius="lg" className="overflow-hidden">
              <PropertyList variant="grid" rows={section.rows} />
            </Surface>
          )}
        </div>
      </Heading>
    </ValueDisplayProvider>
  )
}
