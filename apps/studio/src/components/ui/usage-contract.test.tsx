import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { Button } from "@/components/ui/button"
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable"
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"

const classesOf = (element: Element): readonly string[] => element.className.split(" ")

const byTestId = (id: string): readonly string[] => classesOf(screen.getByTestId(id))

describe("ui copies honour the catalog class recipes", () => {
  it("button sizes carry their own height, radius and type size", () => {
    render(<Button data-testid="xs" size="xs" variant="dashed">x</Button>)
    const classes = byTestId("xs")
    expect(classes).toEqual(expect.arrayContaining(["h-6.5", "rounded-sm", "text-2xs", "border-dashed"]))
    expect(classes).not.toContain("rounded-lg")
    expect(classes).not.toContain("text-sm")
  })

  it("underline tabs take the panel layout recipe without leftover chrome", () => {
    render(
      <Tabs data-testid="root" value="a" className="flex h-full min-h-0 flex-col">
        <TabsList data-testid="list" aria-label="tabs" className="mt-2.5 flex flex-none gap-0.5 overflow-x-auto border-b border-border px-3">
          <TabsTrigger data-testid="trigger" value="a" className="-mb-px inline-flex h-8 flex-none items-center border-b-2 border-transparent px-2.5 text-md leading-none">
            a
          </TabsTrigger>
        </TabsList>
        <TabsContent value="a">body</TabsContent>
      </Tabs>,
    )
    expect(byTestId("root").some((name) => name.startsWith("gap-"))).toBe(false)
    expect(byTestId("list")).not.toEqual(expect.arrayContaining(["w-fit"]))
    expect(byTestId("list")).not.toContain("bg-muted")
    expect(byTestId("list")).not.toContain("justify-center")
    const trigger = byTestId("trigger")
    expect(trigger).not.toContain("rounded-md")
    expect(trigger).not.toContain("border")
    expect(trigger).not.toContain("flex-1")
    expect(trigger).not.toContain("font-medium")
  })

  it("resizable handles merge size classes against the group orientation", () => {
    render(
      <ResizablePanelGroup orientation="vertical">
        <ResizablePanel id="top">top</ResizablePanel>
        <ResizableHandle id="bar" className="h-[5px] w-full bg-border" />
        <ResizablePanel id="bottom">bottom</ResizablePanel>
      </ResizablePanelGroup>,
    )
    expect(byTestId("bar")).toContain("h-[5px]")
    expect(byTestId("bar")).not.toContain("h-px")
  })

  it("sheet content renders in place, absolute, without the built-in close button", () => {
    render(
      <Sheet open modal={false}>
        <SheetContent data-testid="sheet" className="absolute inset-y-0 right-0 z-20 flex h-full min-h-0 w-[520px] max-w-[88%] flex-col border-l border-border bg-card shadow-sheet">
          <SheetTitle>title</SheetTitle>
          <SheetDescription>description</SheetDescription>
        </SheetContent>
      </Sheet>,
    )
    const classes = byTestId("sheet")
    expect(classes).toEqual(expect.arrayContaining(["absolute", "w-[520px]", "shadow-sheet"]))
    expect(classes).not.toContain("fixed")
    expect(classes).not.toContain("gap-4")
    expect(classes).not.toContain("shadow-lg")
    expect(screen.queryByRole("button")).toBeNull()
  })

  it("toggle group items let the choice recipe own the selected state", () => {
    render(
      <ToggleGroup type="single" value="a">
        <ToggleGroupItem data-testid="item" value="a" className="selected:bg-tone-bg">
          a
        </ToggleGroupItem>
      </ToggleGroup>,
    )
    expect(byTestId("item")).toContain("selected:bg-tone-bg")
    expect(byTestId("item")).not.toContain("selected:bg-muted")
    expect(byTestId("item")).not.toEqual(expect.arrayContaining(["hover:bg-muted"]))
    expect(byTestId("item")).not.toContain("justify-center")
    expect(byTestId("item")).not.toContain("min-w-8")
    expect(byTestId("item")).not.toContain("[&_svg:not([class*='size-'])]:size-4")
  })

  it("toggle group root leaves width and radius to the choice recipe", () => {
    render(
      <ToggleGroup data-testid="group" type="single" value="a">
        <ToggleGroupItem value="a">a</ToggleGroupItem>
      </ToggleGroup>,
    )
    expect(byTestId("group")).not.toContain("w-fit")
    expect(byTestId("group")).not.toContain("rounded-lg")
  })

  it("sheet title and description carry no typography of their own", () => {
    render(
      <Sheet open modal={false}>
        <SheetContent>
          <SheetTitle data-testid="title">title</SheetTitle>
          <SheetDescription data-testid="description">description</SheetDescription>
        </SheetContent>
      </Sheet>,
    )
    expect(screen.getByTestId("title").className).toBe("")
    expect(screen.getByTestId("description").className).toBe("")
  })
})
