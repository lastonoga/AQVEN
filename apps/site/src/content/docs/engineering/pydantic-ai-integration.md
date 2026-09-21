---
title: Pydantic AI Integration
description: Understand which model-facing responsibilities AQVEN delegates to Pydantic AI.
---

AQVEN uses Pydantic AI to construct and call model agents. Pydantic AI owns model-provider adapters, model requests, streaming support, structured-output mechanisms, and model-facing tools. AQVEN owns the project declarations, typed workflow boundary, provider policy, prompt assembly, compiler checks, runtime events, and Studio trace.

Configure AQVEN [Agents](/engineering/agents-and-models/) and [Providers](/engineering/providers/) in project source. Use a custom factory when the project needs a Pydantic AI `Model` that the catalog cannot build. [Custom Providers](/engineering/custom-providers/) documents that seam.

The generated [Provider Catalog](/engineering/reference/provider-catalog/) reports installed Pydantic AI model classes and extras. It is the source for available provider prefixes in the current package.
