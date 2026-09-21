---
title: Secrets and Environment
description: Keep provider credentials outside project source and make local configuration explicit.
---

AQVEN project files reference secrets; they do not contain them. A provider key in `aqven.yaml` uses an environment reference:

```yaml
providers:
  - id: "openrouter"
    api_key: "ref:env/OPENROUTER_API_KEY"
    data_policy:
      allows_pii: false
      allows_sensitive: false
      retention: "unknown"
```

Set the corresponding key in the project environment, for example in a local `.env` file that is excluded from version control:

```bash
OPENROUTER_API_KEY=replace-with-local-value
```

The generated project includes `.env.example` as the safe file to commit. It records required variable names without values.

## Provider keys and project policy

Every provider also declares its data policy. `allows_pii`, `allows_sensitive`, and `retention` tell AQVEN which model route is permitted for the data at a call site. Project PII and trust policies apply further controls to traces and incoming values. Changing a provider endpoint or its data policy changes where workflow data can travel; review that change as carefully as a code integration.

## Inspect without exposing a value

Use the CLI and Studio settings to inspect which provider configuration a project needs. Do not paste a credential into source files, prompts, datasets, screenshots, traces, or an `AGENTS.md` file. Keep credential provisioning separate from the workflow contract.

## Local and automated environments

Use distinct environment values for local development, tests, and deployed environments. Offline checks and simulated workflow tests should not require a provider credential. A real run, evaluation, or live tool integration may require one; document that requirement in the project rather than silently falling back to a developer key.

[Project Configuration](/engineering/project-configuration/) explains provider sources and [Safety and Reliability](/engineering/safety-and-reliability/) explains the data policy controls.
