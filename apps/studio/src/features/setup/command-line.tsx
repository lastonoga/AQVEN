import { Copy } from "lucide-react"
import { useTranslations } from "use-intl"
import { Surface, TextBlock, Toolbar } from "@/components/studio"
import { Button } from "@/components/ui/button"

const copyText = (text: string): void => {
  void navigator.clipboard.writeText(text)
}

export function CommandLine({ command }: { readonly command: string }) {
  const t = useTranslations("setup.command")
  const copy = (
    <Button
      variant="ghost"
      size="icon-xs"
      aria-label={t("copyAria")}
      onClick={() => {
        copyText(command)
      }}
    >
      <Copy />
    </Button>
  )
  return (
    <Surface variant="well" asChild>
      <Toolbar size="sm" end={copy} className="items-start">
        <div className="min-w-0 flex-1">
          <TextBlock variant="code" text={command} />
        </div>
      </Toolbar>
    </Surface>
  )
}
