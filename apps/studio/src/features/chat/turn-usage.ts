const THOUSAND = 1000
const ONE_DECIMAL = 1

export const compactTokens = (count: number): string =>
  count < THOUSAND ? String(count) : `${(count / THOUSAND).toFixed(ONE_DECIMAL)}k`
