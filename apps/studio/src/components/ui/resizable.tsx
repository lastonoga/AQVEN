import * as React from "react"
import { cva } from "class-variance-authority"
import { cn } from "cn"
import * as ResizablePrimitive from "react-resizable-panels"

const ResizableGroupOrientationContext =
  React.createContext<ResizablePrimitive.Orientation>("horizontal")

function ResizablePanelGroup({
  className,
  orientation = "horizontal",
  ...props
}: ResizablePrimitive.GroupProps) {
  return (
    <ResizableGroupOrientationContext value={orientation}>
      <ResizablePrimitive.Group
        data-slot="resizable-panel-group"
        data-orientation={orientation}
        orientation={orientation}
        className={cn("flex h-full w-full data-vertical:flex-col", className)}
        {...props}
      />
    </ResizableGroupOrientationContext>
  )
}

function ResizablePanel({ ...props }: ResizablePrimitive.PanelProps) {
  return <ResizablePrimitive.Panel data-slot="resizable-panel" {...props} />
}

const resizableHandleVariants = cva(
  "relative flex items-center justify-center bg-border ring-offset-background after:absolute focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-hidden",
  {
    variants: {
      groupOrientation: {
        horizontal:
          "w-px after:inset-y-0 after:left-1/2 after:w-1 after:-translate-x-1/2",
        vertical:
          "h-px w-full after:inset-x-0 after:top-1/2 after:h-1 after:-translate-y-1/2 [&>div]:rotate-90",
      },
    },
    defaultVariants: {
      groupOrientation: "horizontal",
    },
  }
)

function ResizableHandle({
  withHandle,
  className,
  ...props
}: ResizablePrimitive.SeparatorProps & {
  withHandle?: boolean
}) {
  const groupOrientation = React.use(ResizableGroupOrientationContext)

  return (
    <ResizablePrimitive.Separator
      data-slot="resizable-handle"
      className={cn(resizableHandleVariants({ groupOrientation }), className)}
      {...props}
    >
      {withHandle && (
        <div className="z-10 flex h-6 w-1 shrink-0 rounded-lg bg-border" />
      )}
    </ResizablePrimitive.Separator>
  )
}

export { ResizableHandle, ResizablePanel, ResizablePanelGroup }
