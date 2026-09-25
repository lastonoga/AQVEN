---
expect:
  series_id: "01a0d5b2-3f41-7a0c-9d62-8e1f4b7c2a05"
---
{
  "series_id": "{{input.series_id}}",
  "origin": {
    "kind": "experiment",
    "experiment_id": "intent_escalation_agents"
  },
  "flow_id": "escalation",
  "dataset_id": "support_case_cases",
  "question": "noninferior",
  "on": "dev",
  "cases": 6,
  "repeats": 3,
  "variants": [
    "deepseek",
    "qwen",
    "gpt"
  ],
  "status": "cancelled",
  "progress": {
    "done": 15,
    "total": 54
  },
  "spend": {
    "usd": "0.07",
    "cap_usd": "1.00",
    "unpriced_attempts": 0
  },
  "verdict": null,
  "waits": 0,
  "started_at": "2026-09-25T09:40:03Z",
  "finished_at": "2026-09-25T10:07:40Z",
  "pause": null
}
