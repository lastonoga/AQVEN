import type { IsoDateTime } from "@/domain"
import { isoDateTime } from "@/data/ids"

const MS_PER_HOUR = 3_600_000
const HOURS_PER_DAY = 24

export const FIXTURE_NOW = isoDateTime("2026-09-16T12:00:00Z")

export const hoursAgo = (hours: number): IsoDateTime =>
  isoDateTime(new Date(Date.parse(FIXTURE_NOW) - hours * MS_PER_HOUR).toISOString())

export const daysAgo = (days: number): IsoDateTime => hoursAgo(days * HOURS_PER_DAY)

export const hoursAhead = (hours: number): IsoDateTime => hoursAgo(-hours)
