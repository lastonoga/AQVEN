import type { ReactNode } from "react"
import { cn } from "cn"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type { ChoiceItem } from "./choice"
import { textVariants } from "./text"

export type PanelInset = "md" | "lg"

export type PanelTabs<V extends string> = {
  readonly label: string
  readonly items: readonly ChoiceItem<V>[]
  readonly value: V
  readonly onValueChange: (value: V) => void
}

export type PanelLayoutProps<V extends string> = {
  readonly header: ReactNode
  readonly tabs?: PanelTabs<V> | undefined
  readonly inset?: PanelInset
  readonly children: ReactNode
}

type InsetSpec = { readonly header: string; readonly tabList: string; readonly trigger: string; readonly body: string }

type PanelViewProps = { readonly header: ReactNode; readonly spec: InsetSpec; readonly children: ReactNode }

const ROOT_CLASS = "flex h-full min-h-0 flex-col"

const TAB_TRIGGER_CLASS = cn(
  "mb-0 inline-flex flex-none items-center border-b-2 border-transparent px-2.5 text-muted-foreground hover:text-foreground selected:border-foreground selected:font-medium selected:text-foreground",
  textVariants({ role: "prose" }),
  "leading-none",
)

const INSET: Readonly<Record<PanelInset, InsetSpec>> = {
  md: {
    header: "flex-none px-3 pt-2.25",
    tabList: "mt-2.5 flex flex-none gap-0.5 overflow-x-auto border-b-0 px-3 shadow-[inset_0_-1px_0_var(--border)]",
    trigger: "h-8.5",
    body: "min-h-0 flex-1 overflow-auto px-3 pt-3.5 pb-10",
  },
  lg: {
    header: "flex-none px-4 pt-3.5",
    tabList: "mt-3 flex flex-none gap-0.5 overflow-x-auto border-b border-border px-4",
    trigger: "h-8",
    body: "min-h-0 flex-1 overflow-auto px-4 pt-3.5 pb-8",
  },
}

const findTab = <V extends string>(items: readonly ChoiceItem<V>[], raw: string): V | undefined =>
  items.find((item) => item.value === raw)?.value

function PlainPanel({ header, spec, children }: PanelViewProps) {
  return (
    <div className={ROOT_CLASS}>
      <div className={spec.header}>{header}</div>
      <div className={spec.body}>{children}</div>
    </div>
  )
}

function TabbedPanel<V extends string>({ header, spec, tabs, children }: PanelViewProps & { readonly tabs: PanelTabs<V> }) {
  const toTab = (raw: string): void => {
    const value = findTab(tabs.items, raw)
    if (value === undefined) return
    tabs.onValueChange(value)
  }
  return (
    <Tabs value={tabs.value} onValueChange={toTab} className={ROOT_CLASS}>
      <div className={spec.header}>{header}</div>
      <TabsList aria-label={tabs.label} className={spec.tabList}>
        {tabs.items.map((item) => (
          <TabsTrigger key={item.value} value={item.value} disabled={item.disabled ?? false} className={cn(TAB_TRIGGER_CLASS, spec.trigger)}>
            {item.label}
          </TabsTrigger>
        ))}
      </TabsList>
      <TabsContent key={tabs.value} value={tabs.value} className={spec.body}>
        {children}
      </TabsContent>
    </Tabs>
  )
}

export function PanelLayout<V extends string>({ header, tabs, inset = "md", children }: PanelLayoutProps<V>) {
  const spec = INSET[inset]
  if (tabs === undefined) {
    return (
      <PlainPanel header={header} spec={spec}>
        {children}
      </PlainPanel>
    )
  }
  return (
    <TabbedPanel header={header} spec={spec} tabs={tabs}>
      {children}
    </TabbedPanel>
  )
}
