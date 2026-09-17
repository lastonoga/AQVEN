import { httpSources } from "./http/sources"
import type { StudioSources } from "./ports"

export const sources: StudioSources = httpSources
