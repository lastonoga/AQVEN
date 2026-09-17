import { Page } from "@/components/studio"
import { PrimitivesDemo } from "./primitives-demo"
import { StructuresDemo } from "./structures-demo"

export function Demo() {
  return (
    <Page width="xl">
      <div className="flex flex-col gap-6">
        <PrimitivesDemo />
        <StructuresDemo />
      </div>
    </Page>
  )
}
