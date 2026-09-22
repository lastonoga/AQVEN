import type { ComponentProps, ReactNode } from "react"
import { Surface } from "./surface"
import { Text } from "./text"

type Slot = { readonly children?: ReactNode }

type BlockProps = ComponentProps<"p">
type AnchorProps = ComponentProps<"a">
type CodeProps = ComponentProps<"code">

const LIST_CLASS = "my-1 flex list-outside flex-col gap-1 pl-4"

function Paragraph({ children }: BlockProps) {
  return (
    <Text as="p" role="prose" className="my-1.5 first:mt-0 last:mb-0">
      {children}
    </Text>
  )
}

function Heading({ children }: ComponentProps<"h1">) {
  return (
    <Text as="p" role="item" weight="semibold" className="mt-3 mb-1 first:mt-0">
      {children}
    </Text>
  )
}

function Strong({ children }: Slot) {
  return <strong className="font-semibold">{children}</strong>
}

function Emphasis({ children }: Slot) {
  return <em className="italic">{children}</em>
}

function InlineCode({ children }: CodeProps) {
  return (
    <Text role="code" asChild>
      <code className="rounded bg-muted px-1 py-0.5">{children}</code>
    </Text>
  )
}

function CodeBlock({ children }: Slot) {
  return (
    <Surface variant="panel" radius="md" asChild>
      <pre className="my-2 overflow-x-auto p-2.5">
        <Text role="code" asChild>
          <code>{children}</code>
        </Text>
      </pre>
    </Surface>
  )
}

function BulletList({ children }: ComponentProps<"ul">) {
  return <ul className={`${LIST_CLASS} list-disc`}>{children}</ul>
}

function NumberedList({ children }: ComponentProps<"ol">) {
  return <ol className={`${LIST_CLASS} list-decimal`}>{children}</ol>
}

function ListItem({ children }: ComponentProps<"li">) {
  return (
    <Text as="p" role="prose" asChild>
      <li className="pl-0.5">{children}</li>
    </Text>
  )
}

function Link({ children, href }: AnchorProps) {
  return (
    <Text role="link" asChild>
      <a href={href} target="_blank" rel="noreferrer">
        {children}
      </a>
    </Text>
  )
}

function Quote({ children }: ComponentProps<"blockquote">) {
  return (
    <Text as="p" role="prose" tone="neutral" asChild>
      <blockquote className="my-1.5 border-border border-l-2 pl-2.5">{children}</blockquote>
    </Text>
  )
}

function Divider() {
  return <hr className="my-2.5 border-border" />
}

function DataTable({ children }: ComponentProps<"table">) {
  return (
    <div className="my-2 overflow-x-auto">
      <table className="w-full border-collapse text-left">{children}</table>
    </div>
  )
}

function HeadCell({ children }: ComponentProps<"th">) {
  return (
    <Text role="column" asChild>
      <th className="border-border border-b px-2 py-1.5">{children}</th>
    </Text>
  )
}

function BodyCell({ children }: ComponentProps<"td">) {
  return (
    <Text role="cell" asChild>
      <td className="border-border/60 border-b px-2 py-1.5 align-top">{children}</td>
    </Text>
  )
}

export const MARKDOWN_COMPONENTS = {
  p: Paragraph,
  h1: Heading,
  h2: Heading,
  h3: Heading,
  h4: Heading,
  h5: Heading,
  h6: Heading,
  strong: Strong,
  em: Emphasis,
  code: InlineCode,
  pre: CodeBlock,
  ul: BulletList,
  ol: NumberedList,
  li: ListItem,
  a: Link,
  blockquote: Quote,
  hr: Divider,
  table: DataTable,
  th: HeadCell,
  td: BodyCell,
} as const
