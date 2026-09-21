---
title: Debug a Failure
description: Locate the first differing execution, inspect evidence, and turn a verified failure into a regression case.
---

Start with the final error or unexpected output, then move backward through the timeline until you find the first execution whose input, route, output, or check differs from expectation. Inspect raw values as well as formatted values.

![Start an investigation from the recorded run status and metrics.](/images/studio/runs.png)

If the issue is in source, run `uv run {{CLI_COMMAND}} check .` and use prompt preview or provider checks as appropriate. Save the input, context, expected property, and needed fixtures as a dataset case before changing behavior. [Engineering Debugging](/engineering/debugging/) covers the command-side sequence.
