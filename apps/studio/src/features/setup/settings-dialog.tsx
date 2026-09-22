import { useState } from "react"
import { X } from "lucide-react"
import { useTranslations } from "use-intl"
import type { ApiFlow, ApiProject, SettingsSection } from "@/domain"
import { SETTINGS_SECTIONS } from "@/domain"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { SettingsContent, SettingsNav } from "./settings-screen"

export function SettingsDialog({
  project,
  flows,
  onClose,
}: {
  readonly project: ApiProject
  readonly flows: readonly ApiFlow[]
  readonly onClose: () => void
}) {
  const t = useTranslations("setup.settings")
  const [section, setSection] = useState<SettingsSection>(SETTINGS_SECTIONS[0])

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent
        showCloseButton={false}
        style={{ maxWidth: "calc(100vw - 1.5rem)" }}
        className="grid h-[min(92dvh,1000px)] w-[86vw] grid-rows-[auto_minmax(0,1fr)] gap-0 overflow-hidden p-0 lg:w-[min(70vw,1100px)]"
      >
        <div className="flex items-start gap-4 border-b border-border px-5 py-4 sm:px-6">
          <div className="min-w-0 flex-1">
            <DialogTitle className="text-lg">{t("title")}</DialogTitle>
            <DialogDescription className="mt-1 truncate">{project.package ?? project.root} · {t("lead")}</DialogDescription>
          </div>
          <Button type="button" variant="ghost" size="icon-sm" aria-label={t("closeAria")} onClick={onClose}>
            <X />
          </Button>
        </div>
        <div className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)] min-[600px]:grid-cols-[184px_minmax(0,1fr)] min-[600px]:grid-rows-1 md:grid-cols-[220px_minmax(0,1fr)]">
          <aside className="min-h-0 overflow-auto border-b border-border bg-muted/40 min-[600px]:border-r min-[600px]:border-b-0">
            <SettingsNav section={section} onSectionChange={setSection} />
          </aside>
          <div key={section} className="min-h-0 overflow-auto bg-background-subtle p-4 sm:p-5">
            <SettingsContent project={project} flows={flows} section={section} />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
