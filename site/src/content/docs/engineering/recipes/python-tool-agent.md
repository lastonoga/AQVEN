---
title: Call a Python Tool from a Model Agent
description: Give a model agent a small code-backed capability with an explicit typed effect contract.
---

Define the Tool with a Python `run` reference, typed input/output, and accurate `effect`. List its ID in the agent’s `tools`, then constrain instructions so the model knows when to use it. Start with a read-only tool and inspect its trace before adding a write capability.

Read [Python Function Tools](/engineering/python-function-tools/) and [Agents and Models](/engineering/agents-and-models/).
