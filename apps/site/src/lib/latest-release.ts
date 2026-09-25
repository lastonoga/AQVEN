import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "astro/zod";

export type Release = {
  readonly version: string;
  readonly released: string;
  readonly releasedIso: string;
  readonly url: string;
};

const PYPI_API = "https://pypi.org/pypi/aqven";
const PYPI_PROJECT = "https://pypi.org/project/aqven";
const PYPROJECT = resolve(process.cwd(), "../../packages/aqven/pyproject.toml");
const VERSION_LINE = /^version = "([^"]+)"$/m;
const TIMEOUT_MS = 5000;

const RELEASE_DATE = new Intl.DateTimeFormat("en", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

const PypiRelease = z.object({
  info: z.object({ version: z.string() }),
  urls: z.array(z.object({ upload_time_iso_8601: z.string() })).nonempty(),
});

type PypiRelease = z.infer<typeof PypiRelease>;

const toRelease = (payload: PypiRelease): Release => ({
  version: payload.info.version,
  released: RELEASE_DATE.format(new Date(payload.urls[0].upload_time_iso_8601)),
  releasedIso: payload.urls[0].upload_time_iso_8601,
  url: `${PYPI_PROJECT}/${payload.info.version}/`,
});

const fetchRelease = async (url: string): Promise<Release | null> => {
  const response = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) }).catch(() => null);
  if (response === null || !response.ok) return null;
  const parsed = PypiRelease.safeParse(await response.json().catch(() => null));
  return parsed.success ? toRelease(parsed.data) : null;
};

const repoVersion = (): string | null => VERSION_LINE.exec(readFileSync(PYPROJECT, "utf8"))?.[1] ?? null;

const resolveLatestRelease = async (): Promise<Release | null> => {
  const version = repoVersion();
  const pinned = version === null ? null : await fetchRelease(`${PYPI_API}/${version}/json`);
  return pinned ?? fetchRelease(`${PYPI_API}/json`);
};

export const latestRelease: Promise<Release | null> = resolveLatestRelease();
