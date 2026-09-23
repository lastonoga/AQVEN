import { useState } from "react"
import { useRouter } from "@tanstack/react-router"
import { CircleStop } from "lucide-react"
import { useTranslations } from "use-intl"
import type { RunId, RunStatus } from "@/domain"
import { Text } from "@/components/studio"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import { messageOf } from "@/lib/errors"
import { isLiveStatus } from "./run-events"

type CancelState =
  | { readonly kind: "idle" }
  | { readonly kind: "sending" }
  | { readonly kind: "failed"; readonly message: string }

const IDLE: CancelState = { kind: "idle" }
const REASON_ID = "run-cancel-reason"

function CancelError({ state }: { readonly state: CancelState }) {
  const t = useTranslations("runs.cancel")
  if (state.kind !== "failed") return null
  return (
    <Text role="hint" tone="destructive" asChild>
      <p role="alert">{t("failed", { reason: state.message })}</p>
    </Text>
  )
}

export function CancelRun({ runId }: { readonly runId: RunId }) {
  const t = useTranslations("runs.cancel")
  const router = useRouter()
  const { api } = router.options.context
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState("")
  const [state, setState] = useState<CancelState>(IDLE)
  const sending = state.kind === "sending"

  const submit = (): void => {
    setState({ kind: "sending" })
    void api.run.cancel(runId, reason.trim()).then(
      () => {
        setState(IDLE)
        setOpen(false)
        setReason("")
        void router.invalidate()
      },
      (error: unknown) => {
        setState({ kind: "failed", message: messageOf(error) })
      },
    )
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" size="sm" aria-expanded={open}>
          <CircleStop aria-hidden />
          {t("open")}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 gap-2.5">
        <Text as="p" role="item" weight="semibold">{t("title")}</Text>
        <label htmlFor={REASON_ID} className="block">
          <Text role="label" tone="neutral">{t("reason")}</Text>
        </label>
        <Textarea id={REASON_ID} rows={3} value={reason} placeholder={t("reasonPlaceholder")} onChange={(event) => { setReason(event.target.value) }} />
        <CancelError state={state} />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" size="sm" disabled={sending} onClick={() => { setOpen(false) }}>{t("keep")}</Button>
          <Button type="button" variant="destructive" size="sm" disabled={sending} aria-busy={sending} onClick={submit}>
            {sending ? <Spinner aria-hidden="true" /> : null}
            {t("confirm")}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}

export function RunCancelSlot({ runId, status }: { readonly runId: RunId; readonly status: RunStatus }) {
  if (!isLiveStatus(status)) return null
  return <CancelRun key={runId} runId={runId} />
}
