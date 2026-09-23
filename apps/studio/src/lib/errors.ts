export const messageOf = (reason: unknown): string => (reason instanceof Error ? reason.message : String(reason))
