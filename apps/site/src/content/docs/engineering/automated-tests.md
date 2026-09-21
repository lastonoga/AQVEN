---
title: Automated Tests
description: Test project contracts offline and use cassettes, fakes, and pytest for behavior that needs repeatability.
---

Start every test path with `uv run {{CLI_COMMAND}} check . --static`, then run the full simulated check. These commands validate definitions and simulated paths without provider credentials.

For Python behavior, test code and tool functions with pytest. For model behavior, use recorded cassettes or a controlled fake where a live provider would make a test expensive or nondeterministic. Supply scripted human answers when exercising a human branch without a reviewer.

Keep a dataset case for each customer-facing regression and run the corresponding evaluation when prompt, model, or tool behavior changes. [Cost and Usage](/engineering/cost-and-usage/) explains cassettes; [Testing and Evaluation](/engineering/testing-and-evaluation/) covers evaluation contracts.
