import { cn } from "cn";

export type Actor = "You" | "Agent" | "AQVEN";

export type TimelineEntry = { readonly actors: readonly Actor[]; readonly title: string; readonly body: string };

type HeadingLevel = 3 | 4;

const ACTOR_STYLE: Readonly<Record<Actor, string>> = {
  You: "border-border bg-accent text-foreground",
  Agent: "border-llm-border bg-llm-bg text-llm",
  AQVEN: "border-border bg-background text-muted-foreground",
};

const HEADING_TAG: Readonly<Record<HeadingLevel, "h3" | "h4">> = { 3: "h3", 4: "h4" };

export const ActorTag = ({ actor }: { actor: Actor }) => (
  <span className={cn("rounded-full border px-2 py-0.5 font-mono text-[10px] font-medium", ACTOR_STYLE[actor])}>
    {actor}
  </span>
);

export const TimelineStep = ({
  index,
  entry,
  last,
  headingLevel,
}: {
  index: number;
  entry: TimelineEntry;
  last: boolean;
  headingLevel: HeadingLevel;
}) => {
  const Heading = HEADING_TAG[headingLevel];
  return (
    <li className="flex gap-4">
      <span className="flex flex-col items-center">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full border border-border bg-card font-mono text-xs font-medium text-foreground">
          {index + 1}
        </span>
        {!last && <span aria-hidden="true" className="my-1 w-px flex-1 bg-border" />}
      </span>
      <div className={cn("flex min-w-0 flex-col gap-1", last ? "pb-0" : "pb-7")}>
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <Heading className="font-medium tracking-tight">{entry.title}</Heading>
          {entry.actors.map((actor) => (
            <ActorTag key={actor} actor={actor} />
          ))}
        </div>
        <p className="text-sm text-muted-foreground">{entry.body}</p>
      </div>
    </li>
  );
};
