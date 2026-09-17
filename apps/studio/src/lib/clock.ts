const FIXTURE_NOW = import.meta.env.VITE_FIXTURE_NOW

export const studioNow = (): Date => (FIXTURE_NOW === undefined ? new Date() : new Date(FIXTURE_NOW))
