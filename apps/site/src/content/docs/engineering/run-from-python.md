---
title: Run from Python
description: Load a project in an application, use generated types at the boundary, and consume a typed flow result.
---

Embed AQVEN by loading the project from its root, selecting a declared flow, and providing its generated input type. Keep HTTP request parsing, authentication, and external application concerns outside the flow definition.

Use the public `aqven` Python API for the installed package’s exact signatures. The authored [Python API](/engineering/python-api/) explains integration choices; the generated [Python API Reference](/engineering/reference/python-api/) is the signature authority.

Use the project server when a separate process needs events, Studio, REST, or MCP instead of directly embedding the runtime.
