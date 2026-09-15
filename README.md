# AQVEN

### Engineer AI systems, not just prompts.

Production AI is not a model call.

A real AI system may combine multiple models, context sources, reasoning strategies, evaluators, retries, verification and generated intermediate results.

The problem is that these systems are difficult to **build, test, debug and optimize**.

AQVEN is an engineering layer for building reliable AI systems from probabilistic components.

---

## The problem

A prototype is simple:

```text
Input → Model → Output
```

Production is not:

```text
                    ┌─ Model A ─┐
Input → Context ────┼─ Model B ─┼─→ Judge → Verify → Output
                    └─ Model C ─┘
                           ↑
                      Retry / Refine
```

Now you need to answer:

* Why did this result happen?
* Which component caused the failure?
* Does a new model improve quality or just change behavior?
* Can we prove that a change didn't introduce regressions?
* What is the cheapest architecture that reaches the required quality?
* Can a coding agent safely modify the system?

Existing AI frameworks help you execute these components.

**AQVEN is about engineering the system they form.**

---

## The AQVEN model

AQVEN treats an AI application as an **engineered intelligence system**.

```text
Components
   ↓
Context + Models + Strategies + Tools
   ↓
Executable system
   ↓
Tests + Evaluation + Verification
   ↓
Measured result
   ↓
Iteration
```

The system itself becomes the thing you can inspect, test and improve.

---

## What AQVEN provides

### Compose

Build systems from models, context, tools, code and control logic.

### Evaluate

Run real examples and measure output quality, not just execution success.

### Verify

Use independent evaluators and quality gates to control probabilistic behavior.

### Debug

Trace a result through its inputs, context, prompts, model calls and intermediate states.

### Compare

Experiment with different models, architectures and reasoning strategies.

### Optimize

Find the best quality / cost / latency trade-off for a specific job.

### Iterate

Change a component, run the system again, compare the result and improve.

---

## Built for AI-native engineering

AQVEN is designed to work with coding agents such as Claude Code, Codex and Cursor.

Instead of an agent simply writing AI code:

```text
Agent → Code → "Looks good"
```

AQVEN creates a feedback loop:

```text
Agent
  ↓
Modify system
  ↓
Validate
  ↓
Run tests
  ↓
Evaluate
  ↓
Inspect failures
  ↓
Modify again
```

The agent doesn't have to guess whether the AI system works.

**The system can tell it.**

---

## Code-first. Visual when useful.

The source of truth is structured and version-controlled.

The visual layer exists to make complex AI systems easier to understand and debug — not to replace engineering.

That means AI systems can be:

* reviewed in Git
* modified by humans or agents
* validated automatically
* tested against real examples
* inspected visually
* evolved through normal development workflows

---

## AQVEN vs. AI frameworks

AQVEN does not try to replace the frameworks you already use.

You can build execution with the tools you prefer.

The missing layer is what happens around execution:

```text
          AI Frameworks
               ↓
      ┌──────────────────┐
      │      AQVEN        │
      │                   │
      │  Test             │
      │  Evaluate         │
      │  Verify           │
      │  Debug            │
      │  Compare          │
      │  Optimize         │
      └──────────────────┘
               ↓
        Production AI
```

LangGraph, Pydantic AI, Mastra, custom Python, TypeScript or other runtimes can remain implementation details.

AQVEN focuses on the engineering problem above them.

---

## The fundamental idea

Traditional software:

```text
Code → Deterministic execution → Result
```

AI software:

```text
Intent
  ↓
Probabilistic components
  ↓
Composition
  ↓
Evaluation
  ↓
Verification
  ↓
Iteration
  ↓
Production result
```

You cannot make the underlying models fully deterministic.

You can engineer the system around them.

**That's AQVEN.**

---

## Status

AQVEN is an early-stage project exploring the engineering layer for production AI systems.

The goal is simple:

> **Turn probabilistic AI capabilities into software you can trust, test and continuously improve.**
