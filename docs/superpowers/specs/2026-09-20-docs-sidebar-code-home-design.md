# Documentation sidebar, code blocks, and Home design

## Scope

Refine the documentation navigation, then rewrite the four Home pages around the work of engineers building AI systems.

## Sidebar

The Home pages appear beneath a visible `Documentation Home` group. Engineering and Studio keep their own top-level groups.

Shorten long engineering section labels where a shorter label preserves meaning:

- `Prompts, Inferences, and Model Agents` becomes `Prompts & Agents`.
- `Tools, MCP, and Human Approval` becomes `Tools & Review`.
- `Run, Test, and Improve` becomes `Run & Improve`.
- `Reliability, Safety, and Operations` becomes `Reliability & Operations`.

Use concise sidebar labels for long recipe pages while preserving each document's full page title.

Sidebar section titles and links use `min-height`, horizontal and vertical padding, and natural text wrapping. They must not use a fixed height. Active and hover surfaces span the full item width and the full wrapped height. Text starts at the first line, so a wrapped label does not overlap its neighbor.

## Documentation Home

Position AQVEN as an engineering environment for AI systems. Do not define it primarily as a Python framework.

`Documentation Home` explains the primary audiences, their recurring jobs, the pains AQVEN addresses, the practical outcomes, how AQVEN fits alongside Pydantic AI, DBOS, providers, tools, and existing application infrastructure, and routes to Engineering, Studio, or AI-assisted work.

`Documentation for AI` explains the job of giving a coding agent a current semantic representation of the AI system so it can inspect, change, validate, and evaluate work safely.

`Glossary` retains precise definitions with a short explanation of why shared terms make a system reviewable.

`What’s New` retains release, upgrade, and compatibility details, written around impact, migration, and verification.

## Verification

Use a desktop browser to verify a long recipe item, a multi-line section title, Home navigation, and active/hover surfaces. Run the site check and production build.
