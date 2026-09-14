/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_WF_SOURCE?: string
  readonly VITE_WF_API_BASE?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
