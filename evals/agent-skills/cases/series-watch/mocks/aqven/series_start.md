---
expect:
  experiment_id: "critique_recall_by_agent"
---
{
  "series_id": "01a0d6c3-8e52-7b1d-a073-9f2e5c8d3b16",
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
  "status": "running",
  "progress": {
    "done": 0,
    "total": 36
  },
  "spend": {
    "usd": "0",
    "cap_usd": "1.00",
    "unpriced_attempts": 0
  },
  "verdict": null,
  "waits": 0,
  "started_at": "2026-09-25T11:20:05Z",
  "finished_at": null,
  "pause": null,
  "launch": {
    "on": "dev",
    "cases": 4,
    "repeats": 3,
    "variants": 3,
    "attempts": 36,
    "available": 4,
    "half_width": 0.25,
    "mde": 0.35,
    "margin": 0.05,
    "spread": 0.5,
    "spread_source": "prior",
    "icc": 0.3,
    "recommended": {
      "cases": 30,
      "repeats": 3,
      "reason": "wide",
      "text": "about 30 cases"
    },
    "below_recommended": true,
    "needs_approval": false,
    "project_cap_usd": "1.00",
    "cap_usd": "1.00"
  }
}
