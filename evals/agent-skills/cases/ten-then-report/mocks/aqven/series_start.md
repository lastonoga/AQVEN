---
type: "fixed"
---
{
  "series_id": "{{input.experiment_id}}",
  "origin": {"kind": "experiment", "experiment_id": "{{input.experiment_id}}"},
  "flow_id": "judge_panel",
  "dataset_id": "judge_panel_cases",
  "question": "compare",
  "on": "dev",
  "cases": 8,
  "repeats": 3,
  "variants": [],
  "status": "running",
  "progress": {"done": 0, "total": 48},
  "spend": {"usd": "0.00", "cap_usd": "1.00", "unpriced_attempts": 0},
  "verdict": null,
  "waits": 0,
  "started_at": "2026-09-25T10:02:11Z",
  "finished_at": null,
  "pause": null,
  "launch": {
    "on": "dev",
    "cases": 8,
    "repeats": 3,
    "variants": 2,
    "attempts": 48,
    "available": 8,
    "half_width": 0.2,
    "mde": 0.28,
    "margin": 0.05,
    "spread": 0.5,
    "spread_source": "prior",
    "icc": 0.3,
    "recommended": {"cases": 40, "repeats": 3, "reason": "wide", "text": "about 40 cases"},
    "below_recommended": true,
    "needs_approval": false,
    "project_cap_usd": "1.00",
    "cap_usd": "1.00"
  }
}
