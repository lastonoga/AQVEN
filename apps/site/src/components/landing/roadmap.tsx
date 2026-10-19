import type { ReactNode } from "react";
import { CircleAlert } from "lucide-react";
import { cn } from "cn";
import { Badge } from "@/components/ui/badge";
import { REPO } from "@/components/landing/site-nav";

const DISCUSSIONS_URL = `${REPO}/discussions`;

type Horizon = {
  readonly id: string;
  readonly label: string;
  readonly note: string;
  readonly items: readonly string[];
};

const HORIZONS: readonly Horizon[] = [
  {
    id: "now",
    label: "Now",
    note: "Work in motion.",
    items: [
      "Stabilize packaging and release flow: changelog, release notes and GitHub Releases, just landed.",
      "Cross-platform install smoke on Windows, macOS and Linux in CI, just landed.",
      "Harden the check/simulation engine against edge cases found by early users.",
      "Collect alpha feedback: two or three real projects running aqven check and series weekly.",
    ],
  },
  {
    id: "next",
    label: "Next",
    note: "Queued behind Now, without dates.",
    items: [
      "Runtime budget enforcement during a run, not only between human-approved batches.",
      "Python 3.15 support once the ecosystem settles (current pin is >=3.14,<3.15).",
      "More provider adapters beyond the OpenAI/Anthropic/local-llama paths documented today.",
      "Deeper Studio ergonomics for the series view: comparing arms side by side.",
    ],
  },
  {
    id: "later",
    label: "Later",
    note: "Direction, not commitment.",
    items: [
      "Leaving alpha: a stability contract for the CLI and file formats.",
      "Governance beyond a single maintainer: documented decision process and more reviewers.",
      "Team workflows built around git-native sharing of flow files (self-hosted, no SaaS dependency).",
    ],
  },
];

const Section = ({ id, className, children }: { id?: string; className?: string; children: ReactNode }) => (
  <section id={id} className={cn("scroll-mt-20 py-16 lg:py-24", className)}>
    <div className="container mx-auto px-6">{children}</div>
  </section>
);

const Heading = ({ badge, title, lead }: { badge: string; title: string; lead: string }) => (
  <div className="mx-auto flex max-w-3xl flex-col items-center gap-4 text-center">
    <Badge variant="secondary">{badge}</Badge>
    <h2 className="text-3xl font-semibold tracking-tight text-balance md:text-4xl">{title}</h2>
    <p className="text-muted-foreground lg:text-lg">{lead}</p>
  </div>
);

const HorizonPreview = () => (
  <div className="w-full overflow-hidden rounded-xl border border-border bg-card">
    <ol className="divide-y divide-border">
      {HORIZONS.map((horizon) => (
        <li key={horizon.id} className="flex items-center justify-between gap-6 px-6 py-5">
          <span className="font-mono text-sm font-semibold text-foreground">{horizon.label}</span>
          <span className="text-right text-muted-foreground lg:text-lg">{horizon.note}</span>
        </li>
      ))}
    </ol>
  </div>
);

export const roadmapHeroVisual = <HorizonPreview />;

export const RoadmapHorizons = () => (
  <Section id="horizons">
    <Heading
      badge="Three lists"
      title="Now, next and later."
      lead="One sentence per item, no dates."
    />
    <div className="mx-auto mt-12 grid max-w-6xl gap-4 lg:grid-cols-3">
      {HORIZONS.map((horizon) => (
        <div key={horizon.id} id={horizon.id} className="flex scroll-mt-20 flex-col gap-4 rounded-xl border border-border bg-card p-6">
          <div className="flex flex-col gap-1">
            <h3 className="font-mono text-sm font-semibold uppercase tracking-wide">{horizon.label}</h3>
            <p className="text-sm text-muted-foreground">{horizon.note}</p>
          </div>
          <ul className="flex flex-col gap-3 text-sm">
            {horizon.items.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  </Section>
);

export const RoadmapFeedback = () => (
  <Section id="feedback" className="bg-background-subtle">
    <div className="mx-auto flex max-w-3xl items-start gap-3 rounded-lg border border-border bg-card px-5 py-5">
      <CircleAlert className="mt-1 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <div className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold tracking-tight">A direction, not a commitment.</h2>
        <p className="text-sm text-muted-foreground">
          Priorities change with feedback. Discuss what matters to you on{" "}
          <a href={DISCUSSIONS_URL} className="underline underline-offset-4" rel="noopener">
            GitHub Discussions
          </a>
          .
        </p>
      </div>
    </div>
  </Section>
);
