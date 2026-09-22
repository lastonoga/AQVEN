import { ArrowRight, ArrowUpRight } from "lucide-react";
import { cn } from "cn";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface Image {
  src: string;
  alt: string;
  srcDark?: string;
}
interface Button {
  text: string;
  url: string;
  icon?: React.ReactNode;
}
interface Buttons {
  primary?: Button;
  secondary?: Button;
}
interface Badge {
  text: string;
  announcement?: string;
  url?: string;
}

interface HeroBasicProps {
  badge?: Badge;
  heading: string;
  description: string;
  command?: string;
  buttons?: Buttons;
  image?: Image;
  visual?: React.ReactNode;
  className?: string;
}

interface Hero1Props extends HeroBasicProps {}
type Props = Partial<Hero1Props>;

const defaultProps: Hero1Props = {
  badge: {
    text: "Changelog v1.1",
    announcement: "Check out our latest updates",
  },
  heading: "Blocks Built With Shadcn & Tailwind",
  description:
    "Finely crafted components built with React, Tailwind and shadcn/ui. Developers can copy and paste these blocks directly into their project.",
  buttons: {
    primary: {
      text: "Browse Components",
      url: "https://shadcnblocks.com",
    },
    secondary: {
      text: "View GitHub",
      url: "https://shadcnblocks.com",
    },
  },
  image: {
    src: "https://deifkwefumgah.cloudfront.net/shadcnblocks/image-set/modern/saas-hero/saas-hero-1-16x9.png",
    srcDark: "https://deifkwefumgah.cloudfront.net/shadcnblocks/image-set/modern/saas-hero/saas-hero-1-16x9-dark.png",
    alt: "Hero Image Placeholder",
  },
};

const Hero1 = (props: Props) => {
  const { badge, heading, description, command, buttons, image, visual, className } = {
    ...defaultProps,
    ...props,
  };

  return (
    <section className={cn("py-32", className)}>
      <div className="container mx-auto px-6">
        <div className="grid items-center gap-6 lg:grid-cols-2 lg:gap-12">
          <div className="flex flex-col items-center gap-5 text-center lg:items-start lg:text-left">
            {badge && (
              <Badge variant="outline">
                {badge.text}
                <ArrowUpRight className="size-4" />
              </Badge>
            )}
            <h1 className="max-w-xl text-4xl font-semibold tracking-tight text-pretty md:text-5xl lg:max-w-3xl lg:text-6xl">
              {heading}
            </h1>
            <p className="max-w-5xl text-balance text-muted-foreground lg:text-xl">
              {description}
            </p>
            <div className="flex w-full flex-col justify-center gap-2 sm:flex-row lg:justify-start">
              {buttons?.primary && (
                <Button asChild size="lg" className="w-full sm:w-auto">
                  <a href={buttons.primary.url}>
                    {buttons.primary.text}
                    <ArrowRight className="size-4" />
                  </a>
                </Button>
              )}
              {buttons?.secondary && (
                <Button
                  asChild
                  variant="outline"
                  size="lg"
                  className="w-full sm:w-auto"
                >
                  <a href={buttons.secondary.url}>{buttons.secondary.text}</a>
                </Button>
              )}
            </div>
            {command && (
              <code className="w-full max-w-md rounded-md border border-border bg-card px-4 py-3 text-left font-mono text-sm text-card-foreground">
                {command}
              </code>
            )}
          </div>
          {visual ? (
            visual
          ) : image?.srcDark ? (
            <>
              <img
                src={image.src}
                alt={image.alt}
                className="aspect-video w-full rounded-md border border-border object-cover object-top dark:hidden"
              />
              <img
                src={image.srcDark}
                alt={image.alt}
                className="hidden aspect-video w-full rounded-md border border-border object-cover object-top dark:block"
              />
            </>
          ) : image ? (
            <img
              src={image.src}
              alt={image.alt}
              className="aspect-video w-full rounded-md border border-border object-cover object-top"
            />
          ) : null}
        </div>
      </div>
    </section>
  );
};

export { Hero1 };
