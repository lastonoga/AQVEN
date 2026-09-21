---
title: Custom Providers
description: Construct a custom Pydantic AI model when the catalog and OpenAI-compatible routes do not fit.
---

Set a project provider’s `kind` to `code` and point `run` at a factory that accepts `model_name` and `ProviderContext`. The factory returns a streaming-capable Pydantic AI `Model`.

```yaml
providers:
  - id: "company_gateway"
    kind: "code"
    run: "my_workflow.providers:build_model"
    data_policy:
      allows_pii: false
      allows_sensitive: false
      retention: "unknown"
```

Declare capabilities honestly: input and output modalities, tool support, and JSON-schema support. Store credentials as secret references. Run `models check` first, then test a representative live request and dataset case. [Providers](/engineering/providers/#custom-provider-factory) includes the complete factory example.
