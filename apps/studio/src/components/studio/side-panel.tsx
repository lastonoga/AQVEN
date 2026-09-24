import { useRef, type ReactNode } from "react"
import { cn } from "cn"
import { X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet"
import { Heading } from "./heading"
import { PanelLayout, type PanelTabs } from "./panel-layout"
import { hasContent } from "./rich"
import { surfaceVariants } from "./surface"

export type SidePanelProps<V extends string> = {
  readonly open: boolean
  readonly onOpenChange: (open: boolean) => void
  readonly title: ReactNode
  readonly description?: ReactNode
  readonly leading?: ReactNode
  readonly below?: readonly ReactNode[]
  readonly aside?: ReactNode
  readonly closeLabel: string
  readonly tabs?: PanelTabs<V>
  readonly children: ReactNode
}

export const SIDE_PANEL_WIDTH = 520

const CONTENT_CLASS = cn(
  surfaceVariants({ variant: "sheet" }),
  "absolute inset-y-0 right-0 z-20 flex h-full min-h-0 max-w-[88%] flex-col outline-none max-[1179px]:fixed",
)

const CONTENT_STYLE = { width: SIDE_PANEL_WIDTH }

const MISSING_DESCRIPTION = { "aria-describedby": undefined }

const preventOutsideClose = (event: Event): void => {
  event.preventDefault()
}

function Backdrop({ open, onOpenChange }: Pick<SidePanelProps<string>, "open" | "onOpenChange">) {
  if (!open) return null
  return (
    <div
      aria-hidden
      className="absolute inset-0 z-20 bg-overlay max-[1179px]:fixed"
      onClick={() => {
        onOpenChange(false)
      }}
    />
  )
}

const describe = (description: ReactNode): ReactNode => {
  if (!hasContent(description)) return null
  return (
    <SheetDescription asChild>
      <span>{description}</span>
    </SheetDescription>
  )
}

export function SidePanel<V extends string>({
  open,
  onOpenChange,
  title,
  description,
  leading,
  below = [],
  aside,
  closeLabel,
  tabs,
  children,
}: SidePanelProps<V>) {
  const contentRef = useRef<HTMLDivElement>(null)
  const describedBy = hasContent(description) ? {} : MISSING_DESCRIPTION
  const header = (
    <Heading
      size="entity"
      leading={leading}
      title={
        <SheetTitle asChild>
          <span>{title}</span>
        </SheetTitle>
      }
      description={describe(description)}
      below={below}
      trailing={
        <>
          {aside}
          <SheetClose asChild>
            <Button variant="outline" size="icon-sm" aria-label={closeLabel}>
              <X aria-hidden />
            </Button>
          </SheetClose>
        </>
      }
    />
  )
  return (
    <Sheet open={open} onOpenChange={onOpenChange} modal={false}>
      <Backdrop open={open} onOpenChange={onOpenChange} />
      <SheetContent
        ref={contentRef}
        className={CONTENT_CLASS}
        style={CONTENT_STYLE}
        onInteractOutside={preventOutsideClose}
        onOpenAutoFocus={(event) => {
          event.preventDefault()
          contentRef.current?.focus()
        }}
        onEscapeKeyDown={(event) => {
          if (contentRef.current?.contains(document.activeElement) ?? false) return
          event.preventDefault()
        }}
        {...describedBy}
      >
        <PanelLayout header={header} inset="lg" tabs={tabs}>
          {children}
        </PanelLayout>
      </SheetContent>
    </Sheet>
  )
}
