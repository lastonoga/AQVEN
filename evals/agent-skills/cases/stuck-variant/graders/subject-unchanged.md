---
type: "regex"
target:
  source: "file"
  path: "agents/gpt.yaml"
---
model:\s*"openrouter:openai/gpt-oss-20b"\s+settings:\s+temperature:\s*0\.3\s+max_tokens:\s*6000\s+output:\s+mode:\s*"prompted"\s+strict:\s*false\s+retries:\s*4\s*$
