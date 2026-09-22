import {
  FaFacebook,
  FaGithub,
  FaInstagram,
  FaLinkedin,
  FaTwitter,
} from "react-icons/fa";
import { cn } from "cn";
import {
  Logo,
  LogoImageDesktop,
  LogoImageMobile,
} from "@/components/shadcnblocks/logo";

interface FooterLink {
  name: string;
  href: string;
}
interface FooterSection {
  title: string;
  links: FooterLink[];
}
interface FooterLogo {
  url: string;
  src: string;
  alt: string;
  title: string;
}

interface FooterBasicProps {
  logo?: FooterLogo;
  description?: string;
  sections?: FooterSection[];
  copyright?: string;
  legalLinks?: FooterLink[];
  className?: string;
}

interface Footer2Props extends FooterBasicProps {
  logoClassName?: string;
}
type Props = Partial<Footer2Props>;

const defaultProps: Footer2Props = {
  logo: {
    url: "https://www.shadcnblocks.com",
    src: "/images/logo/shadcnblocks-logo-word.svg",
    alt: "logo",
    title: "Shadcnblocks.com",
  },
  description: "Finely crafted blocks built with Shadcn UI.",
  sections: [
    {
      title: "Product",
      links: [
        { name: "Overview", href: "#" },
        { name: "Pricing", href: "#" },
        { name: "Marketplace", href: "#" },
        { name: "Features", href: "#" },
        { name: "Integrations", href: "#" },
      ],
    },
    {
      title: "Company",
      links: [
        { name: "About", href: "#" },
        { name: "Team", href: "#" },
        { name: "Blog", href: "#" },
        { name: "Careers", href: "#" },
        { name: "Contact", href: "#" },
      ],
    },
    {
      title: "Support",
      links: [
        { name: "Help center", href: "#" },
        { name: "Documentation", href: "#" },
        { name: "Status", href: "#" },
        { name: "Community", href: "#" },
      ],
    },
    {
      title: "Resources",
      links: [
        { name: "Guides", href: "#" },
        { name: "Templates", href: "#" },
        { name: "Sales", href: "#" },
        { name: "Advertise", href: "#" },
      ],
    },
  ],
  copyright: "© 2024 Shadcnblocks.com. All rights reserved.",
  legalLinks: [
    { name: "Terms and Conditions", href: "#" },
    { name: "Privacy Policy", href: "#" },
  ],
};

const MAX_SECTIONS = 4;

const Footer2 = (props: Props) => {
  const { logo, description, sections, copyright, legalLinks, className } = {
    ...defaultProps,
    ...props,
  };

  const visibleSections = (sections ?? []).slice(0, MAX_SECTIONS);

  return (
    <section className={cn("py-32", className)}>
      <div className="container mx-auto px-6">
        <footer>
          <div className="grid grid-cols-2 gap-8 lg:grid-cols-6">
            <div className="col-span-2 mb-8 lg:mb-0">
              <div className="flex items-center lg:justify-start">
                <a href={logo?.url}>
                  <img
                    src={logo?.src}
                    alt={logo?.alt}
                    title={logo?.title}
                    className="h-7"
                  />
                </a>
              </div>
              <p className="mt-4 text-sm font-medium text-muted-foreground">
                {description}
              </p>
            </div>
            {visibleSections.map((section, sectionIdx) => (
              <div key={sectionIdx}>
                <h3 className="mb-4 text-sm font-semibold tracking-tight">
                  {section.title}
                </h3>
                <ul className="space-y-4 text-sm text-muted-foreground">
                  {section.links.map((link, linkIdx) => (
                    <li
                      key={linkIdx}
                      className="font-medium hover:text-primary"
                    >
                      <a href={link.href}>{link.name}</a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <div className="mt-8 flex flex-col justify-between gap-4 border-t border-border pt-8 text-xs font-medium text-muted-foreground md:flex-row md:items-center">
            <p>{copyright}</p>
            <ul className="flex gap-4">
              {legalLinks?.map((link, linkIdx) => (
                <li key={linkIdx} className="underline hover:text-primary">
                  <a href={link.href}>{link.name}</a>
                </li>
              ))}
            </ul>
          </div>
        </footer>
      </div>
    </section>
  );
};

export { Footer2 };
