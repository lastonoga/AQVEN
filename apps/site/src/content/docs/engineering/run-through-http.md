---
title: Run Through HTTP
description: Start the local project server, create a run, read its state, inspect executions, and stream events over REST.
---

Start the project server with `uv run {{CLI_COMMAND}} serve .` or start it with Studio through `dev`. Use the server’s run endpoints to start work, read the run snapshot, read a node execution, resume a wait, fork, cancel, and consume event streams.

The raw contract is served as `/api/openapi.json` by the running project. Use it instead of copying field shapes into a client. [HTTP API](/engineering/http-api/) explains the workflow and the generated [HTTP API / OpenAPI](/engineering/reference/openapi/) indexes operations.
