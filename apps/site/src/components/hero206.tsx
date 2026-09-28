import { ArrowRight, ChevronLeft, ChevronRight, Copy, Plus, RotateCw, Share } from "lucide-react";
import { cn } from "cn";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface HeroImageSource {
  readonly type: `image/${string}`;
  readonly srcSet: string;
}

interface HeroImage {
  readonly sources: readonly HeroImageSource[];
  readonly src: string;
  readonly srcSet: string;
  readonly sizes: string;
  readonly alt: string;
  readonly width: number;
  readonly height: number;
}

interface HeroLink {
  text: string;
  url: string;
}

interface HeroLinks {
  primary?: HeroLink;
  secondary?: HeroLink;
}

interface Hero206Props {
  className?: string;
  badge?: string;
  heading: string;
  description: string;
  command?: string;
  buttons?: HeroLinks;
  image: HeroImage;
  mockupUrl: string;
}

const BrowserMockup = ({ className, url, image }: { className?: string; url: string; image: HeroImage }) => (
  <div className={cn("relative w-full overflow-hidden rounded-xl border md:rounded-2xl lg:rounded-3xl", className)}>
    <div className="flex items-center justify-between gap-6 bg-muted px-4 py-3 md:gap-10 md:px-8 md:py-4 lg:gap-25">
      <div className="flex items-center gap-2">
        <div className="size-2.5 rounded-full bg-red-500 md:size-3" />
        <div className="size-2.5 rounded-full bg-yellow-500 md:size-3" />
        <div className="size-2.5 rounded-full bg-green-500 md:size-3" />
        <div className="ml-6 hidden items-center gap-2 opacity-40 lg:flex">
          <ChevronLeft className="size-5" />
          <ChevronRight className="size-5" />
        </div>
      </div>
      <div className="flex w-full items-center justify-center">
        <p className="relative hidden w-full rounded-full bg-background px-4 py-1 text-center font-mono text-sm tracking-tight text-muted-foreground md:block">
          {url}
          <RotateCw className="absolute top-2 right-3 size-3.5" />
        </p>
      </div>
      <div className="flex items-center gap-4 opacity-40">
        <Share className="size-4" />
        <Plus className="size-4" />
        <Copy className="size-4" />
      </div>
    </div>
    <div className="relative w-full before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:z-10 before:h-16 before:bg-linear-to-b before:from-black/6 before:to-transparent md:before:h-20">
      <picture className="block">
        {image.sources.map((source) => (
          <source key={source.type} type={source.type} srcSet={source.srcSet} sizes={image.sizes} />
        ))}
        <img
          src={image.src}
          srcSet={image.srcSet}
          sizes={image.sizes}
          alt={image.alt}
          width={image.width}
          height={image.height}
          loading="eager"
          fetchPriority="high"
          decoding="async"
          className="block h-auto w-full"
        />
      </picture>
    </div>
  </div>
);

const Hero206 = ({ className, badge, heading, description, command, buttons, image, mockupUrl }: Hero206Props) => (
  <section className={cn("relative overflow-hidden bg-background", className)}>
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-0 bg-[linear-gradient(to_right,var(--color-border)_1px,transparent_1px),linear-gradient(to_bottom,var(--color-border)_1px,transparent_1px)] mask-[linear-gradient(to_bottom,transparent_0%,transparent_16%,black_30%,black_68%,transparent_100%)] bg-size-[4.5rem_4.5rem] opacity-50"
    />
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-x-0 top-0 z-0 h-48 bg-linear-to-b from-background from-35% to-transparent md:h-56"
    />
    <div className="relative z-10 container mx-auto px-6 pt-20 pb-16 lg:pt-28">
      <header className="mx-auto flex max-w-4xl flex-col items-center gap-5 text-center">
        {badge && <Badge variant="outline">{badge}</Badge>}
        <h1 className="text-4xl font-semibold tracking-tight text-balance text-foreground md:text-5xl lg:text-6xl">
          {heading}
        </h1>
        <p className="mx-auto max-w-3xl text-balance text-muted-foreground lg:text-xl">{description}</p>
        <div className="flex w-full flex-col justify-center gap-2 sm:flex-row">
          {buttons?.primary && (
            <Button asChild size="lg" className="w-full sm:w-auto">
              <a href={buttons.primary.url}>
                {buttons.primary.text}
                <ArrowRight className="size-4" />
              </a>
            </Button>
          )}
          {buttons?.secondary && (
            <Button asChild variant="outline" size="lg" className="w-full sm:w-auto">
              <a href={buttons.secondary.url}>{buttons.secondary.text}</a>
            </Button>
          )}
        </div>
        {command && (
          <code className="w-full max-w-md rounded-md border border-border bg-card px-4 py-3 text-left font-mono text-sm text-card-foreground">
            {command}
          </code>
        )}
      </header>
      <div className="relative mt-14 lg:mt-16">
        <BrowserMockup className="shadow-[0_-20px_48px_-16px_rgba(0,0,0,0.1)]" url={mockupUrl} image={image} />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 bottom-0 h-1/4 bg-linear-to-t from-background to-transparent"
        />
      </div>
    </div>
  </section>
);

export { Hero206 };
export type { HeroImage, HeroImageSource };
