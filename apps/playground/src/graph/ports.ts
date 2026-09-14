export const IN_PORT = "in"

export const OUT_PORT = "out"

export const SLOT_PREFIX = "in:"

export const slotPort = (slot: string): string => `${SLOT_PREFIX}${slot}`

export const slotPortsOf = (slots: readonly string[]): string[] => [
  ...new Set(slots.filter((slot) => slot !== "").map(slotPort)),
]
