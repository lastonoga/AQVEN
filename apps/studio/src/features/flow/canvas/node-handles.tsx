import { Handle } from "@xyflow/react"
import type { HandleSpec } from "./handles"

export function NodeHandles({ specs }: { readonly specs: readonly HandleSpec[] }) {
  return (
    <>
      {specs.map((spec) => (
        <Handle key={spec.id} id={spec.id} type={spec.type} position={spec.position} style={spec.style} isConnectable={false} />
      ))}
    </>
  )
}
