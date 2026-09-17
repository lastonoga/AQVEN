import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"
import { Tabs as TabsPrimitive } from "radix-ui"

function Tabs({
  className,
  orientation = "horizontal",
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Root>) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      data-orientation={orientation}
      orientation={orientation}
      className={cn("group/tabs flex data-horizontal:flex-col", className)}
      {...props}
    />
  )
}

const tabsListVariants = cva(
  "group/tabs-list inline-flex items-center text-muted-foreground group-data-vertical/tabs:h-fit group-data-vertical/tabs:flex-col",
  {
    variants: {
      variant: {
        default:
          "w-fit justify-center rounded-lg bg-muted p-[3px] group-data-horizontal/tabs:h-8",
        line: "gap-0.5 border-b border-border bg-transparent",
      },
    },
    defaultVariants: {
      variant: "line",
    },
  }
)

type TabsListVariant = NonNullable<
  VariantProps<typeof tabsListVariants>["variant"]
>

const tabsTriggerVariants = cva(
  "relative inline-flex items-center justify-center gap-1.5 text-sm whitespace-nowrap transition-all outline-none group-data-vertical/tabs:w-full group-data-vertical/tabs:justify-start hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 has-data-[icon=inline-end]:pr-1 has-data-[icon=inline-start]:pl-1 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          "h-[calc(100%-1px)] flex-1 rounded-md border border-transparent px-1.5 py-0.5 font-medium text-foreground/60 focus-visible:border-ring focus-visible:outline-1 focus-visible:outline-ring selected:bg-background selected:text-foreground selected:shadow-sm",
        line: "-mb-px h-8 flex-none border-b-2 border-transparent px-2.5 text-muted-foreground selected:border-foreground selected:font-medium selected:text-foreground",
      },
    },
    defaultVariants: {
      variant: "line",
    },
  }
)

const TabsListVariantContext = React.createContext<TabsListVariant>("line")

function TabsList({
  className,
  variant,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.List> &
  VariantProps<typeof tabsListVariants>) {
  const listVariant = variant ?? "line"

  return (
    <TabsListVariantContext value={listVariant}>
      <TabsPrimitive.List
        data-slot="tabs-list"
        data-variant={listVariant}
        className={cn(tabsListVariants({ variant: listVariant }), className)}
        {...props}
      />
    </TabsListVariantContext>
  )
}

function TabsTrigger({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  const variant = React.use(TabsListVariantContext)

  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      className={cn(tabsTriggerVariants({ variant }), className)}
      {...props}
    />
  )
}

function TabsContent({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      data-slot="tabs-content"
      className={cn("flex-1 text-sm outline-none", className)}
      {...props}
    />
  )
}

export {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
  tabsListVariants,
  tabsTriggerVariants,
}
