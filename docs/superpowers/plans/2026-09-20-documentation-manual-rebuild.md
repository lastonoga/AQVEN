# AQVEN Documentation Manual Rebuild Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the mixed documentation navigation with complete Engineering and Studio manuals that lead from workflow design through operation, while keeping exact contracts generated from the AQVEN packages.

**Architecture:** Human-authored pages explain purpose, decision points, examples, and failure modes. Generated pages own all exact Pydantic fields, Python signatures, provider catalog entries, OpenAPI operations, MCP schemas, JSON Schemas, and diagnostics. The two manuals share terminology and links but have distinct audiences: engineers author and operate projects; Studio users inspect and manage a selected project.

**Tech Stack:** Astro, Starlight, Markdown, the AQVEN Python packages, Pydantic schemas, OpenAPI, MCP registrations, and the existing generated-reference scripts.

---

### Task 1: Establish the published documentation taxonomy

**Files:**
- Modify: `site/astro.config.mjs`
- Modify: `site/src/content/docs/index.mdx`
- Modify: `site/src/content/docs/engineering/index.md`
- Modify: `site/src/content/docs/studio/index.md`

- [ ] Replace the current engineering sidebar with the approved sections: Get Started; How AQVEN Works; Project Fundamentals; Types and Data; Build Workflows; Prompts, Inferences, and Model Agents; Tools, MCP, and Human Approval; Run, Test, and Improve; Reliability, Safety, and Operations; Integrate and Extend; Coding Agents; Recipes; Reference.
- [ ] Replace the Studio sidebar with the approved sections: Studio Overview; Get Started; Explore a Workflow; Run and Debug; Datasets and Evaluations; Human Review and Tool Approval; Studio AI Assistance; Settings and Maintenance; Troubleshooting; Studio Reference.
- [ ] Make each manual home state its audience, relationship to the other manual, source-of-truth rule, and the route to generated reference material.
- [ ] Run `corepack pnpm --dir site check` and verify no sidebar slug is missing.

### Task 2: Rebuild the entry path and project fundamentals

**Files:**
- Modify: `site/src/content/docs/engineering/quickstart.md`
- Modify: `site/src/content/docs/engineering/getting-started-with-ai.md`
- Modify: `site/src/content/docs/engineering/architecture.md`
- Modify: `site/src/content/docs/engineering/project-layout.md`
- Modify: `site/src/content/docs/engineering/project-configuration.md`
- Create: `site/src/content/docs/engineering/source-and-generated-files.md`
- Create: `site/src/content/docs/engineering/names-ids-and-paths.md`
- Create: `site/src/content/docs/engineering/secrets-and-environment.md`
- Create: `site/src/content/docs/engineering/authoring-modes.md`

- [ ] Make Quickstart a concise route chooser and one runnable first project.
- [ ] Explain Pydantic AI and DBOS responsibilities in Architecture without duplicating their upstream API documentation.
- [ ] Document the project root, source/generated boundary, entity-to-file mapping, IDs, path aliases, and secret handling from the loader and template contracts.
- [ ] Document YAML and Python authoring as equivalent routes into the compiled project representation.
- [ ] Run `uv run aqven new` against a temporary project if command-level claims change, then run `corepack pnpm --dir site check`.

### Task 3: Complete authoring guides for types, bindings, and workflow structure

**Files:**
- Modify: `site/src/content/docs/engineering/types.md`
- Modify: `site/src/content/docs/engineering/schema-design.md`
- Modify: `site/src/content/docs/engineering/flows.md`
- Modify: `site/src/content/docs/engineering/nodes.md`
- Modify: `site/src/content/docs/engineering/code-references-and-aliases.md`
- Modify: `site/src/content/docs/engineering/built-in-functions.md`
- Create: `site/src/content/docs/engineering/field-bindings.md`
- Create: `site/src/content/docs/engineering/input-output-contracts.md`
- Create: `site/src/content/docs/engineering/flow-contracts.md`

- [ ] Explain typed boundaries before individual node kinds.
- [ ] Add runnable YAML examples for record, enum, union, ID, constrained value, field bindings, flow input/output, return bindings, context, and limits.
- [ ] Connect every authoring guide to its generated specification page for field defaults and accepted values.
- [ ] Run `aqven check` against the showcase template examples used in documentation and run `corepack pnpm --dir site check`.

### Task 4: Complete node and control-flow documentation

**Files:**
- Modify: `site/src/content/docs/engineering/python-authoring.md`
- Modify: `site/src/content/docs/engineering/switch.md`
- Modify: `site/src/content/docs/engineering/parallel-and-map.md`
- Modify: `site/src/content/docs/engineering/loops.md`
- Modify: `site/src/content/docs/engineering/calls-and-narrowing.md`
- Modify: `site/src/content/docs/engineering/dynamic-output.md`
- Modify: `site/src/content/docs/engineering/multimodal-input.md`
- Create: `site/src/content/docs/engineering/code-nodes.md`
- Create: `site/src/content/docs/engineering/model-nodes.md`
- Create: `site/src/content/docs/engineering/tool-nodes.md`
- Create: `site/src/content/docs/engineering/human-nodes.md`

- [ ] Give each of the ten implemented node kinds a dedicated decision guide with a minimal example, inputs, outputs, common combinations, and failure behavior.
- [ ] Keep unsupported node kinds out of the user-facing authoring path.
- [ ] Verify examples with `aqven check` and confirm their exact fields are covered by generated node references.

### Task 5: Complete model, prompt, provider, tool, and approval documentation

**Files:**
- Modify: `site/src/content/docs/engineering/inferences.md`
- Modify: `site/src/content/docs/engineering/prompts.md`
- Modify: `site/src/content/docs/engineering/prompt-variants.md`
- Modify: `site/src/content/docs/engineering/agents-and-models.md`
- Modify: `site/src/content/docs/engineering/providers.md`
- Modify: `site/src/content/docs/engineering/tools-and-human-steps.md`
- Create: `site/src/content/docs/engineering/structured-output.md`
- Create: `site/src/content/docs/engineering/model-capabilities.md`
- Create: `site/src/content/docs/engineering/custom-providers.md`
- Create: `site/src/content/docs/engineering/mcp-tools.md`
- Create: `site/src/content/docs/engineering/tool-approval.md`

- [ ] Separate inference, agent, prompt, provider, and tool concepts so an engineer can choose the correct owner for a concern.
- [ ] Cover catalog, OpenAI-compatible, and custom Pydantic AI model providers; model modality, tool, streaming, and structured-output compatibility; MCP tools; deferred tool approval; and human waits.
- [ ] Link all exact provider and specification claims to generated references.
- [ ] Run `aqven models check`, prompt preview, and the documentation site checks.

### Task 6: Complete run, dataset, evaluation, safety, and integration guides

**Files:**
- Modify: `site/src/content/docs/engineering/runs-and-integration.md`
- Modify: `site/src/content/docs/engineering/datasets.md`
- Modify: `site/src/content/docs/engineering/testing-and-evaluation.md`
- Modify: `site/src/content/docs/engineering/safety-and-reliability.md`
- Modify: `site/src/content/docs/engineering/cli-reference.md`
- Modify: `site/src/content/docs/engineering/ai-coding-agents.md`
- Create: `site/src/content/docs/engineering/run-lifecycle.md`
- Create: `site/src/content/docs/engineering/debugging.md`
- Create: `site/src/content/docs/engineering/offline-testing-and-cassettes.md`
- Create: `site/src/content/docs/engineering/durable-execution.md`
- Create: `site/src/content/docs/engineering/python-api.md`
- Create: `site/src/content/docs/engineering/http-api.md`
- Create: `site/src/content/docs/engineering/project-mcp-server.md`

- [ ] Explain command-line, Python, HTTP, and MCP run paths separately.
- [ ] Cover lifecycle status, streams, resume, fork, cancel, partial dataset runs, cassettes, test fakes, evaluation gates, limits, PII, trust boundaries, and DBOS durability.
- [ ] Clearly label commands and optimization features that are not implemented as unavailable, rather than documenting them as working.
- [ ] Verify command and endpoint names from the CLI parser, OpenAPI, and MCP operation catalog.

### Task 7: Add coding-agent guides and scenario recipes

**Files:**
- Modify: `site/src/content/docs/engineering/getting-started-with-ai.md`
- Modify: `site/src/content/docs/engineering/ai-coding-agents.md`
- Create: `site/src/content/docs/engineering/agent-workflow-design-protocol.md`
- Create: `site/src/content/docs/engineering/agent-change-protocol.md`
- Create: `site/src/content/docs/engineering/recipes/*.md`

- [ ] Separate an AQVEN model agent from an AI coding agent in title, navigation, and terminology.
- [ ] Give coding agents a project contract, `llms.txt`, generated-reference routing, MCP setup, design protocol, validation requirements, and reporting requirements.
- [ ] Add only recipes supported by the implemented node kinds, templates, dataset runner, provider support, and Studio.
- [ ] Run all recipe projects through `aqven check` before publishing snippets.

### Task 8: Rebuild the Studio manual around real screens and tasks

**Files:**
- Modify: `site/src/content/docs/studio/*.md`
- Create: `site/src/content/docs/studio/run-a-workflow.md`
- Create: `site/src/content/docs/studio/debug-a-run.md`
- Create: `site/src/content/docs/studio/dataset-batches.md`
- Create: `site/src/content/docs/studio/tool-approval.md`
- Create: `site/src/content/docs/studio/chat.md`
- Create: `site/src/content/docs/studio/reference.md`

- [ ] Cover the actual Studio surfaces: project, canvas, nodes, datasets and CSV import, run start and trace, evaluation results, human review, tool approval, chat, provider keys, and project secrets.
- [ ] State that Studio runs with a project backend through `aqven dev`, not as an independent workspace.
- [ ] Check live pages against the active local documentation server after every category.

### Task 9: Make all reference routes generated and discoverable

**Files:**
- Modify: `site/scripts/generate_reference.py`
- Modify: `site/scripts/generate_llms.mjs`
- Modify: `site/src/content/docs/engineering/reference/index.md`
- Create or modify generated output under: `site/src/content/docs/engineering/reference/`

- [ ] Generate the raw Pydantic YAML models, JSON Schemas, Python signatures, provider catalog, OpenAPI index, MCP tool index, and diagnostics index from their implementation sources.
- [ ] Keep authored guides free of manually duplicated field tables where the generated page can be linked.
- [ ] Add a stale-reference verification command to the documentation build.
- [ ] Run `corepack pnpm --dir site llms:check`, the reference generator check, `corepack pnpm --dir site check`, and `corepack pnpm --dir site build`.
