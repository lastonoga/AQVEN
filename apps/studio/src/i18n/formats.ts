import type { Formats } from "use-intl"

export const formats = {
  number: {
    percent: { style: "percent", maximumFractionDigits: 0 },
  },
  dateTime: {
    short: { day: "numeric", month: "short", year: "numeric" },
  },
} satisfies Formats
