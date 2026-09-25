---
expect:
  series_id: "01a0d6c3-8e52-7b1d-a073-9f2e5c8d3b16"
---
{
  "series_id": "{{input.series_id}}",
  "origin": {
    "kind": "experiment",
    "experiment_id": "critique_recall_by_agent"
  },
  "flow_id": "critic",
  "dataset_id": "planted_defect_replies",
  "question": "threshold",
  "on": "dev",
  "cases": 4,
  "repeats": 3,
  "variants": [
    "deepseek",
    "qwen",
    "llama"
  ],
  "status": "cancelled",
  "progress": {
    "done": 13,
    "total": 36
  },
  "spend": {
    "usd": "0.0146",
    "cap_usd": "1.00",
    "unpriced_attempts": 0
  },
  "verdict": {
    "state": "invalid",
    "reason": "cancelled",
    "text": "No finding: the series was cancelled after 13 of 36 attempts."
  },
  "waits": 0,
  "started_at": "2026-09-25T11:20:05Z",
  "finished_at": "2026-09-25T11:22:31Z",
  "pause": null
}
