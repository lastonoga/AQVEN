import { Fragment } from "react"
import type { TextMessagePartProps } from "@assistant-ui/react"
import { MarkdownTextPrimitive } from "@assistant-ui/react-markdown"
import remarkGfm from "remark-gfm"
import { MARKDOWN_COMPONENTS, Text, TextRuns, type TextLine } from "@/components/studio"
import { LINE_BREAK, splitInlineCode } from "@/lib/text"

type ProseRole = "prose" | "lead" | "hint"

const proseLines = (text: string): readonly TextLine[] => text.split(LINE_BREAK).map(splitInlineCode)

function ProseLines({ text, role }: { readonly text: string; readonly role: ProseRole }) {
  return (
    <Text as="p" role={role} tone={role === "hint" ? "neutral" : "default"}>
      {proseLines(text).map((line, index) => (
        <Fragment key={index}>
          {index === 0 ? null : <br />}
          <TextRuns line={line} />
        </Fragment>
      ))}
    </Text>
  )
}

const REMARK_PLUGINS = [remarkGfm]

export function ProseText() {
  return <MarkdownTextPrimitive remarkPlugins={REMARK_PLUGINS} components={MARKDOWN_COMPONENTS} smooth={false} />
}

export function UserProseText({ text }: TextMessagePartProps) {
  return <ProseLines text={text} role="lead" />
}

export const USER_PARTS = { Text: UserProseText } as const
