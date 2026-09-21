---
title: Model Reliability
description: Bound retries, time, output repair, and fallback behavior around a typed model task.
---

Model reliability starts with a narrow input, a stable output contract, and representative cases. Then choose output retries, fallback models, request and token limits, and a safe outcome for refusal or truncation.

Fallback models must accept the same modalities and output mode. They can change quality, latency, cost, and data policy. Compare the primary and fallback on the same dataset before relying on automatic recovery. Do not hide a persistent semantic failure behind retries; fix inputs, prompt, type, or workflow design.

[Agents and Models](/engineering/agents-and-models/) lists output settings and fallback configuration. [Testing and Evaluation](/engineering/testing-and-evaluation/) provides the evidence loop.
