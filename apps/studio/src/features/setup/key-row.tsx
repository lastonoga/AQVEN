import { useState, type ReactNode, type SubmitEvent } from "react"
import { useTranslations } from "use-intl"
import { Text } from "@/components/studio"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import type { Translator } from "@/i18n/translator"
import { useKeyEditor, type KeyEditor } from "./key-editor"
import { keyOrigin, type KeyEntry, type KeyOrigin, type SaveFailure } from "./presenters"
import { SettingRow } from "./setting-row"

type KeysCopy = Translator<"setup.keys">

export type KeyRowProps = {
  readonly title: string
  readonly caption?: string | undefined
  readonly entry: KeyEntry
  readonly detail?: string | undefined
  readonly shadowed: boolean
  readonly onChanged: () => Promise<void>
}

const ORIGIN_STATE: Readonly<Record<KeyOrigin, (entry: KeyEntry, t: KeysCopy) => string>> = {
  dotenv: (entry, t) => t("savedInDotenv", { masked: entry.masked ?? "" }),
  environment: (entry, t) => t("fromShell", { masked: entry.masked ?? "" }),
  missing: (_entry, t) => t("notSet"),
}

const hintOf = (state: string, caption: string | undefined): string => (caption === undefined ? state : `${state} · ${caption}`)

const ORIGIN_ACTIONS: Readonly<Record<KeyOrigin, (editor: KeyEditor, t: KeysCopy) => ReactNode>> = {
  dotenv: (editor, t) => (
    <>
      <Button variant="outline" size="xs" disabled={editor.pending} onClick={editor.edit}>
        {t("replace")}
      </Button>
      <Button variant="outline-destructive" size="xs" disabled={editor.pending} aria-busy={editor.pending} onClick={editor.remove}>
        {t("remove")}
      </Button>
    </>
  ),
  environment: () => null,
  missing: (editor, t) => (
    <Button variant="outline" size="xs" disabled={editor.pending} onClick={editor.edit}>
      {t("add")}
    </Button>
  ),
}

const failureText = (failure: SaveFailure, t: KeysCopy): string =>
  failure.kind === "rejected" ? t(`rejected.${failure.code}`) : t("failed", { message: failure.message })

function ShellNote({ variable, shadowed }: { readonly variable: string; readonly shadowed: boolean }) {
  const t = useTranslations("setup.keys")
  return (
    <div className="flex flex-col gap-1 px-3 pb-2.5">
      <Text as="p" role="hint" tone="neutral">
        {t("shellNote", { variable })}
      </Text>
      {shadowed ? (
        <Text as="p" role="hint" tone="warning">
          {t("shadowNote", { variable })}
        </Text>
      ) : null}
    </div>
  )
}

function KeyForm({ editor, variable }: { readonly editor: KeyEditor; readonly variable: string }) {
  const t = useTranslations("setup.keys")
  const [draft, setDraft] = useState("")
  const secret = draft.trim()
  const submit = (event: SubmitEvent<HTMLFormElement>): void => {
    event.preventDefault()
    if (secret === "") return
    editor.save(secret)
  }
  return (
    <form className="flex flex-wrap items-center gap-2 px-3 pb-3" onSubmit={submit}>
      <Input
        type="password"
        autoComplete="off"
        spellCheck={false}
        autoFocus
        aria-label={t("inputAria", { variable })}
        aria-invalid={editor.failure !== null}
        placeholder={t("placeholder")}
        value={draft}
        disabled={editor.pending}
        className="max-w-md min-w-48 flex-1"
        onChange={(event) => {
          setDraft(event.target.value)
        }}
      />
      <Button type="submit" size="sm" disabled={secret === "" || editor.pending} aria-busy={editor.pending}>
        {editor.pending ? <Spinner aria-hidden="true" /> : null}
        {t("save")}
      </Button>
      <Button type="button" variant="ghost" size="sm" disabled={editor.pending} onClick={editor.cancel}>
        {t("cancel")}
      </Button>
    </form>
  )
}

function FailureLine({ failure }: { readonly failure: SaveFailure }) {
  const t = useTranslations("setup.keys")
  return (
    <p role="alert" className="px-3 pb-2.5 text-xs text-destructive">
      {failureText(failure, t)}
    </p>
  )
}

export function KeyRow({ title, caption, entry, detail, shadowed, onChanged }: KeyRowProps) {
  const t = useTranslations("setup.keys")
  const editor = useKeyEditor(entry.setting_key, onChanged)
  const origin = keyOrigin(entry)
  const editing = editor.mode === "edit"
  return (
    <div role="group" aria-label={title}>
      <SettingRow title={title} hint={hintOf(ORIGIN_STATE[origin](entry, t), caption)} detail={detail}>
        {editing ? null : ORIGIN_ACTIONS[origin](editor, t)}
      </SettingRow>
      {origin === "environment" ? <ShellNote variable={entry.env_var} shadowed={shadowed} /> : null}
      {editing ? <KeyForm editor={editor} variable={entry.env_var} /> : null}
      {editor.failure === null ? null : <FailureLine failure={editor.failure} />}
    </div>
  )
}
