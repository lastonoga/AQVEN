import { useId } from "react"
import { cn } from "cn"
import { ChevronRight, Crosshair } from "lucide-react"
import { useTranslations } from "use-intl"
import type { ApiAgentRuntime, FactorAgent, FilePath, NodeId } from "@/domain"
import { Surface, Text } from "@/components/studio"
import { ScrollBox } from "@/features/call-sheet"
import { AgentSections } from "@/features/flow"
import { Failure } from "./layout"
import { useFileText } from "./use-file-text"
import { nodesText, stepName } from "./variant-table"
import type { BlockKind, ChangeBlock, ChangeContent } from "./what-changes"

type ContentOf<K extends ChangeContent["kind"]> = Extract<ChangeContent, { readonly kind: K }>

export type WhatChangesProps = {
  readonly what: BlockKind
  readonly blocks: readonly ChangeBlock[]
  readonly open: ReadonlySet<string>
  readonly onToggle: (anchor: string) => void
  readonly onShowSlot: (node: NodeId) => void
}

type RowProps = Omit<WhatChangesProps, "blocks" | "open"> & { readonly block: ChangeBlock; readonly open: boolean }

const LINK_CLASS = "inline-flex cursor-pointer items-center gap-1 self-start rounded-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"

const runtimeOf = (agent: FactorAgent): ApiAgentRuntime => ({ models: null, output: null, instructions: agent.instructions })

function useValueText(what: BlockKind): (block: Pick<ChangeBlock, "value" | "written">) => string {
  const t = useTranslations("research.experiment.what.changes")
  return ({ value, written }) => {
    if (value === null) return t("writtenUnknown")
    return written ? t(`written.${what}`, { value }) : t(`value.${what}`, { value })
  }
}

function FileBody({ path }: { readonly path: FilePath }) {
  const t = useTranslations("research.experiment.what.changes")
  const state = useFileText(path)
  if (state.kind === "ready") return <ScrollBox text={state.text} />
  if (state.kind === "failed") return <Failure message={t("failed", { path, reason: state.message })} />
  return (
    <Text as="p" role="hint" tone="neutral" aria-live="polite">
      {t("loading", { path })}
    </Text>
  )
}

function FileView({ label, path }: { readonly label: string; readonly path: FilePath }) {
  return (
    <section aria-label={label} className="flex min-w-0 flex-col gap-1.5">
      <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <Text role="label" tone="default">
          {label}
        </Text>
        <Text role="data" tone="neutral" className="wrap-anywhere">
          {path}
        </Text>
      </div>
      <FileBody path={path} />
    </section>
  )
}

function Hint({ children }: { readonly children: string }) {
  return (
    <Text as="p" role="hint" tone="neutral">
      {children}
    </Text>
  )
}

function PromptChange({ block, content }: { readonly block: ChangeBlock; readonly content: ContentOf<"prompt"> }) {
  const t = useTranslations("research.experiment.what.changes")
  const label = block.written ? t("writtenPrompt", { nodes: nodesText(block.nodes) }) : t("prompt", { name: block.value ?? "" })
  return (
    <>
      {content.file === null ? <Hint>{t("noPrompt")}</Hint> : <FileView label={label} path={content.file} />}
      {content.written.map((item) =>
        item.file === null ? null : <FileView key={item.file} label={t("writtenPrompt", { nodes: nodesText(item.nodes) })} path={item.file} />,
      )}
    </>
  )
}

function UseChange({ content }: { readonly content: ContentOf<"use"> }) {
  const t = useTranslations("research.experiment.what.changes")
  return (
    <>
      {content.description === null ? null : (
        <Text as="p" role="note" tone="default">
          {content.description}
        </Text>
      )}
      {content.files.length === 0 ? <Hint>{t("noFiles")}</Hint> : null}
      {content.files.map((file) => (
        <FileView key={file.path} label={t(`role.${file.role}`)} path={file.path} />
      ))}
    </>
  )
}

function AgentChange({ block, content }: { readonly block: ChangeBlock; readonly content: ContentOf<"agent"> }) {
  const t = useTranslations("research.experiment.what.changes")
  const { agent } = content
  if (agent === null) return <Hint>{t("noAgent", { agent: block.value ?? "" })}</Hint>
  return (
    <>
      <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <Text role="label" tone="default">
          {t("agentFile")}
        </Text>
        <Text role="data" tone="neutral" className="wrap-anywhere">
          {agent.file}
        </Text>
      </div>
      <AgentSections agent={agent.spec} runtime={runtimeOf(agent)} raw={false} />
    </>
  )
}

function ChangeBody({ block }: { readonly block: ChangeBlock }) {
  const { content } = block
  if (content.kind === "prompt") return <PromptChange block={block} content={content} />
  if (content.kind === "use") return <UseChange content={content} />
  return <AgentChange block={block} content={content} />
}

function SlotLinks({ nodes, onShowSlot }: { readonly nodes: readonly NodeId[]; readonly onShowSlot: (node: NodeId) => void }) {
  const t = useTranslations("research.experiment.what.changes")
  return (
    <div className="flex min-w-0 flex-wrap gap-x-4 gap-y-1">
      {nodes.map((node) => (
        <Text key={node} role="link" tone="neutral" asChild>
          <button
            type="button"
            className={LINK_CLASS}
            onClick={() => {
              onShowSlot(node)
            }}
          >
            <Crosshair aria-hidden className="size-3" />
            {t("showOnGraph", { node: stepName(node) })}
          </button>
        </Text>
      ))}
    </div>
  )
}

function ChangeRow({ block, what, open, onToggle, onShowSlot }: RowProps) {
  const t = useTranslations("research.experiment.what.changes")
  const valueText = useValueText(what)
  const regionId = useId()
  const nodes = nodesText(block.nodes)
  const value = valueText(block)
  return (
    <li id={block.anchor} className="min-w-0 scroll-mt-4">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={regionId}
        onClick={() => {
          onToggle(block.anchor)
        }}
        className="flex w-full min-w-0 cursor-pointer items-center gap-2 px-3 py-2 text-left outline-none hover:bg-muted/60 focus-visible:inset-ring-2 focus-visible:inset-ring-ring"
      >
        <ChevronRight aria-hidden className={cn("size-3.5 shrink-0 text-muted-foreground transition-transform", open && "rotate-90")} />
        <Text role="cell" tone="default" weight="semibold" className="shrink-0">
          {block.variant}
        </Text>
        <Text role="cell" tone="neutral" className="min-w-0 wrap-anywhere">
          {t("row", { nodes, value })}
        </Text>
      </button>
      {open ? (
        <div id={regionId} role="region" aria-label={t("block", { variant: block.variant, nodes, value })} className="flex min-w-0 flex-col gap-4 border-t border-border px-3 py-3">
          <SlotLinks nodes={block.nodes} onShowSlot={onShowSlot} />
          <ChangeBody block={block} />
        </div>
      ) : null}
    </li>
  )
}

export function WhatChanges({ what, blocks, open, onToggle, onShowSlot }: WhatChangesProps) {
  const t = useTranslations("research.experiment.what.changes")
  if (blocks.length === 0) return null
  return (
    <section aria-label={t("aria")} className="flex min-w-0 flex-col gap-1.5">
      <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <Text as="h3" role="block" tone="default" weight="semibold">
          {t("title")}
        </Text>
        <Text role="hint" tone="neutral">
          {t("hint")}
        </Text>
      </div>
      <Surface variant="panel" className="overflow-hidden">
        <ul className="divide-y divide-border">
          {blocks.map((block) => (
            <ChangeRow key={block.anchor} block={block} what={what} open={open.has(block.anchor)} onToggle={onToggle} onShowSlot={onShowSlot} />
          ))}
        </ul>
      </Surface>
    </section>
  )
}
