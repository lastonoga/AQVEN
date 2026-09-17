import type { RichTags } from "@/i18n/format"
import type { Translator } from "@/i18n/translator"

export type SectionContext = {
  readonly t: Translator
  readonly tags: RichTags
}
