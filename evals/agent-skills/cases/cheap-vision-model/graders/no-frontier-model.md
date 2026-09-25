---
type: "regex"
target:
  source: "file"
  path: "agents/receipt_reader.yaml"
match: "not_contains"
weight: 2
---
openai/gpt-5|anthropic/|gemini-2\.5-pro|x-ai/grok-4
