# AQVEN landing page design

## Scope

Replace the documentation site's current splash page with a concise AQVEN product landing page. The page introduces the outcome for an unfamiliar engineer before offering documentation and product exploration. It is not a rewrite of the documentation manuals and does not change Studio or the AQVEN framework.

## Audience and job

The primary visitor is an engineer responsible for an AI-powered workflow that performs meaningful work: an agent, a multi-step workflow, or an automation embedded in a business process.

They arrive when the workflow is difficult to reason about or a result is wrong, inconsistent, unsafe, slow, or unexpectedly expensive. They want to understand the system, reproduce the issue, identify the cause, test a change, and improve the behavior with evidence.

AQVEN's promise is not that it merely builds agents. It makes AI-powered work reviewable and improvable: agents, workflows, and business-process automations can be understood, tested, and evolved as engineering systems.

## Message hierarchy

1. **Hero:** `Build AI workflows you can trust to run the business.`
   `AQVEN helps engineers build, inspect, test, and improve AI agents, automations, and business processes—before unreliable behavior reaches customers.`
2. **Recognition:** A workflow can complete while producing a wrong output, using incorrect context, taking an unsafe route, or silently regressing after a change.
3. **Outcome:** AQVEN makes the workflow explicit so a team can understand it, reproduce a problem, find the divergence, test the change, and ship with confidence.
4. **Studio proof:** Studio is the visible path from an unexpected result to evidence: Canvas exposes structure, Runs exposes execution, and Datasets/Evals expose representative-case results.
5. **Broader scope:** AQVEN applies to agents, AI workflows, and business-process automations. It works alongside existing application code, models, and infrastructure.
6. **Open foundation:** `Open source. Free forever.` This claim must be paired with an explicit repository license before public release.
7. **Action:** Primary CTA: `Explore AQVEN`. Secondary CTA: `See Studio`.

The page must not claim customer results, show invented logos, fabricate metrics, or imply that AQVEN replaces an entire existing stack.

## Page composition

The page contains five substantive sections plus a compact header and footer. It deliberately avoids a long feature inventory.

| Page area | Shadcnblocks source | AQVEN content | Visual evidence |
| --- | --- | --- | --- |
| Header | `navbar1` | AQVEN mark; Docs, Studio, Examples, GitHub; primary Explore CTA | No product visual. |
| Hero | `hero104`, simplified | Main promise and two CTAs | Real Studio Canvas screenshot as the principal image, with one small real run-detail crop. Remove the block's stock charts, avatar rows, video, and invented metrics. |
| Studio evidence | `feature175` | Tabs: Understand the workflow, Investigate a result, Test a change | Each tab changes to an authentic Studio screenshot: Canvas, Runs, then Datasets/Evals. The text names what the screenshot lets the visitor answer. |
| What AQVEN supports | `feature50` | Three linked destinations: AI agents, AI workflows, business-process automation | Use tightly cropped real Studio screenshots or code/project artifacts for each tile; no decorative illustration in the initial release. |
| Customer outcomes | `feature364` | Clarity; confidence to change; faster recovery; measurable improvement | Four small Lucide symbols only. This section is intentionally light. |
| Closing CTA | `cta1`, simplified | `Make AI-powered work reliable enough to depend on.` | A single real Studio detail crop, not another dashboard. |

The evidence/case-study section is deferred until AQVEN has real, publishable examples, results, or user reviews. At that point, use `feature36` for one featured case study and its supporting stories.

## Screenshot plan

Product screenshots, not generic AI imagery, are the visual language of the first release. Capture them from a real local Studio project after the shared development stack is confirmed healthy.

1. **Canvas overview** — a readable workflow graph with selected node details; used in the hero at desktop width.
2. **Unexpected run investigation** — a selected run and trace showing actual inputs, response, output or failure evidence; used in the Runs Studio tab.
3. **Evaluation evidence** — a dataset/evaluation screen with an aggregate result and identifiable per-case results; used in the Datasets/Evals Studio tab.
4. **Detail crop** — a close crop from one of the three images above; used only in the final CTA.

All screenshots must come from AQVEN Studio. They should use a deterministic demo project, omit credentials and personal data, remain legible at the rendered size, and receive descriptive alt text. The implementation must not hand-draw fake product screens.

## Visual and interaction rules

- Use the existing Lucode/Starlight visual language as the base; do not import a complete generic landing-page template.
- Preserve a single, high-contrast primary CTA and one consistent CTA label throughout the page.
- Keep hero copy within the initial viewport: one headline, one short paragraph, and two actions.
- The Studio tabs may be interactive, but all content must remain understandable in the first/default tab and must work with keyboard navigation.
- On mobile, screenshots stack below their related copy and retain their own aspect ratios; tabs become a horizontal scroll strip or a vertically stacked control.
- Do not create a logo wall, testimonial carousel, pricing section, or invented stat band in this release.

## Technical integration

The documentation site is Astro/Starlight and already has Lucode styling; it is not currently configured as a React/Tailwind shadcn project. The implementation will add only the rendering support needed to adapt the selected Shadcnblocks source components and their shadcn primitives. Static sections should render as Astro; only the Studio evidence tabs should ship as a small interactive island.

The selected Shadcnblocks items are third-party source blocks. `navbar1` is free; `hero104`, `feature175`, `feature50`, `feature364`, `cta1`, and the future `feature36` are Pro at the time of selection. Their source must be available under the team's Shadcnblocks access before implementation. Preserve the structural idea of a block when adapting it, but remove all sample content, assets, metrics, and excess sections that conflict with this specification.

## Verification

- Confirm the existing development stack is healthy before using or replacing it.
- Render desktop and mobile views and inspect headline wrapping, CTA visibility, screenshot legibility, tab keyboard behavior, and mobile stacking.
- Run Astro type checks and the documentation production build.
- Verify every landing-page claim against repository/product evidence, especially the open-source license and Free Forever statement.
