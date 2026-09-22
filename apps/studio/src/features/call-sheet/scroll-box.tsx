import { TextBlock } from "@/components/studio"
import { plainLines } from "@/lib/text"

export type ScrollBoxProps = { readonly text: string }

const SCROLL_CLASS = "max-h-96 min-w-0 overflow-auto rounded-md bg-background-subtle p-2.5 select-text"

export function ScrollBox({ text }: ScrollBoxProps) {
  return (
    <div className={SCROLL_CLASS}>
      <TextBlock lines={plainLines(text)} variant="code" />
    </div>
  )
}
