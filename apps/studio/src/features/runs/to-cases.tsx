import { useState } from "react"
import { ListPlus, X } from "lucide-react"
import { useTranslations } from "use-intl"
import type { ApiRunSnapshot } from "@/domain"
import { Surface, Text, TextBlock } from "@/components/studio"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import type { BlobText } from "@/features/call-sheet"
import { HandoffButton } from "@/features/chat-handoff"
import { caseYaml, draftCase, toCasesPrompt } from "./case-draft"
import { datasetItemOf } from "./expected"

export type ToCasesProps = { readonly snapshot: ApiRunSnapshot; readonly blobs: readonly BlobText[] }

const DIALOG_WIDTH = { maxWidth: "min(92vw, 760px)" } as const

function DraftBody({ snapshot, blobs }: ToCasesProps) {
  const t = useTranslations("runs.toCases")
  const item = datasetItemOf(snapshot.dataset_item_id)
  const yaml = caseYaml(draftCase(snapshot, blobs))
  const prompt = (): string => toCasesPrompt({ flowId: snapshot.flow_id, runId: snapshot.run_id, item }, yaml)
  return (
    <>
      <div className="flex min-h-0 flex-col gap-3 overflow-y-auto px-5 py-4">
        <Text as="p" role="hint" tone="neutral">
          {item === null ? t("targetNew", { flow: snapshot.flow_id }) : t("targetDataset", { dataset: item.datasetId })}
        </Text>
        <Surface variant="well" padding="sm" className="min-w-0">
          <TextBlock text={yaml} variant="code" />
        </Surface>
      </div>
      <div className="border-t border-border px-5 py-3">
        <HandoffButton label={t("handoff")} prompt={prompt} variant="default" />
      </div>
    </>
  )
}

export function ToCases({ snapshot, blobs }: ToCasesProps) {
  const t = useTranslations("runs.toCases")
  const [open, setOpen] = useState(false)
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          <ListPlus aria-hidden />
          {t("open")}
        </Button>
      </DialogTrigger>
      <DialogContent showCloseButton={false} style={DIALOG_WIDTH} className="grid max-h-[min(88dvh,900px)] w-[min(92vw,760px)] grid-rows-[auto_minmax(0,1fr)_auto] gap-0 p-0">
        <div className="flex items-start gap-3 border-b border-border px-5 py-4">
          <div className="min-w-0 flex-1">
            <DialogTitle className="text-lg">{t("title")}</DialogTitle>
            <DialogDescription className="mt-1">{t("description")}</DialogDescription>
          </div>
          <Button type="button" size="icon-sm" variant="ghost" aria-label={t("close")} onClick={() => { setOpen(false) }}><X aria-hidden /></Button>
        </div>
        {open ? <DraftBody snapshot={snapshot} blobs={blobs} /> : null}
      </DialogContent>
    </Dialog>
  )
}
