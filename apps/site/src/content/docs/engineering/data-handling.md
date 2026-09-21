---
title: Data Handling
description: Declare provider data policy, keep secrets out of source, and treat run content as project data.
---

Provider configuration declares whether a route may receive PII or sensitive data and records its retention assumption. This is a project policy statement, so verify it against the provider agreement and your deployment environment.

Keep credentials in environment-backed secret references. Treat prompts, inputs, outputs, tool results, datasets, blobs, cassettes, and run traces as potentially sensitive records. Minimize what enters an inference and external tool; do not use documentation examples as a reason to log production data.

[Secrets and Environment](/engineering/secrets-and-environment/) and [Project Configuration](/engineering/project-configuration/) document the project fields.
