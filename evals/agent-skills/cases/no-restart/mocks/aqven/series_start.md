---
expect:
  experiment_id: "panel_failure_scan"
---
{
  "series_id": "01a0d8b5-6c74-7da0-9e25-1b4a7f0d5e38",
  "origin": {
    "kind": "experiment",
    "experiment_id": "panel_failure_scan"
  },
  "flow_id": "judge_panel",
  "dataset_id": "judge_panel_cases",
  "question": "look",
  "on": "dev",
  "cases": 3,
  "repeats": 1,
  "variants": [
    "gpt_tie_break",
    "mistral_tie_break"
  ],
  "status": "running",
  "progress": {
    "done": 0,
    "total": 6
  },
  "spend": {
    "usd": "0",
    "cap_usd": "1.00",
    "unpriced_attempts": 0
  },
  "verdict": null,
  "waits": 0,
  "started_at": "2026-09-25T13:10:12Z",
  "finished_at": null,
  "pause": null,
  "launch": {
    "on": "dev",
    "cases": 3,
    "repeats": 1,
    "variants": 2,
    "attempts": 6,
    "available": 3,
    "half_width": 0.25,
    "mde": 0.35,
    "margin": 0.05,
    "spread": 0.5,
    "spread_source": "prior",
    "icc": 0.3,
    "recommended": {
      "cases": 3,
      "repeats": 1,
      "reason": "look",
      "text": "a look runs every case once"
    },
    "below_recommended": false,
    "needs_approval": false,
    "project_cap_usd": "1.00",
    "cap_usd": "1.00"
  }
}
