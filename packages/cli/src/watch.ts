import { relative, resolve, sep } from "node:path"
import { watch as chokidarWatch } from "chokidar"
import type { FSWatcher } from "chokidar"

const IGNORED_DIRS = new Set(["node_modules", ".git", ".wf", "dist"])
const FILE_EVENTS = new Set(["add", "change", "unlink"])
const SOURCE_EXT = ".ts"
const DEBOUNCE_MS = 50

export type WatchOptions = {
  root: string
  onChange: (files: string[]) => void
  onError?: (error: Error) => void
  debounceMs?: number
}

export type Watcher = {
  close(): void
}

class ChangeBatch {
  private readonly pending = new Set<string>()
  private timer: NodeJS.Timeout | undefined

  constructor(
    private readonly delayMs: number,
    private readonly emit: (files: string[]) => void,
  ) {}

  add(file: string): void {
    this.pending.add(file)
    this.arm()
  }

  cancel(): void {
    if (this.timer) clearTimeout(this.timer)
    this.timer = undefined
    this.pending.clear()
  }

  private arm(): void {
    if (this.timer) clearTimeout(this.timer)
    this.timer = setTimeout(() => this.flush(), this.delayMs)
    this.timer.unref()
  }

  private flush(): void {
    this.timer = undefined
    const files = [...this.pending].sort()
    this.pending.clear()
    if (files.length === 0) return
    this.emit(files)
  }
}

function isOutsideOrIgnored(root: string, path: string): boolean {
  const rel = relative(root, path)
  if (rel === "") return false
  if (rel.startsWith("..")) return true
  return rel.split(sep).some((segment) => IGNORED_DIRS.has(segment))
}

function isSource(path: string): boolean {
  return path.endsWith(SOURCE_EXT)
}

function toError(value: unknown): Error {
  if (value instanceof Error) return value
  return new Error(String(value))
}

export function watch(opts: WatchOptions): Watcher {
  const root = resolve(opts.root)
  const reportError = opts.onError ?? ((error: Error) => console.error(error.message))
  const batch = new ChangeBatch(opts.debounceMs ?? DEBOUNCE_MS, opts.onChange)

  const watcher: FSWatcher = chokidarWatch(root, {
    ignored: (path: string) => isOutsideOrIgnored(root, path),
    ignoreInitial: true,
    persistent: true,
  })

  watcher.on("all", (event: string, path: string) => {
    if (!FILE_EVENTS.has(event)) return
    if (!isSource(path)) return
    batch.add(path)
  })
  watcher.on("error", (err: unknown) => reportError(toError(err)))

  return {
    close(): void {
      batch.cancel()
      void watcher.close()
    },
  }
}
