---
title: Agent Change Protocol
description: Require a coding agent to inspect, plan, edit, generate, check, evaluate, and report.
---

For every workflow change, an agent should:

1. Inspect the project, definitions, references, and affected dataset cases.
2. State the proposed contract and source files before changing behavior.
3. Edit source YAML, prompts, and Python; never hand-edit derived types.
4. Run `generate` when types change, `check`, prompt preview for model changes, and relevant tests or evaluation.
5. Report the diff, commands, results, remaining live-provider uncertainty, and any external effect not exercised.

This sequence turns an agent change into a reviewable engineering change rather than an unverified text edit.
