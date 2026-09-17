import { Fragment } from "react"
import type { TextMessagePartProps } from "@assistant-ui/react"
import type { TextLine } from "@/domain"
import { Text, TextRuns } from "@/components/studio"
import { LINE_BREAK, splitInlineCode } from "@/lib/text"

type ProseRole = "prose" | "lead"

const proseLines = (text: string): readonly TextLine[] => text.split(LINE_BREAK).map(splitInlineCode)

function ProseLines({ text, role }: { readonly text: string; readonly role: ProseRole }) {
  return (
    <Text as="p" role={role} tone="default">
      {proseLines(text).map((line, index) => (
        <Fragment key={index}>
          {index === 0 ? null : <br />}
          <TextRuns line={line} />
        </Fragment>
      ))}
    </Text>
  )
}

export function ProseText({ text }: TextMessagePartProps) {
  return <ProseLines text={text} role="prose" />
}

export function UserProseText({ text }: TextMessagePartProps) {
  return <ProseLines text={text} role="lead" />
}

export const PROSE_PARTS = { Text: ProseText } as const

export const USER_PARTS = { Text: UserProseText } as const
