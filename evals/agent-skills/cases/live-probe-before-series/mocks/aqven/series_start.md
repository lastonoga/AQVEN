---
expect:
  experiment_id: "tie_break_gemma"
---
{
  "series_id": "0199a2d7-4c1e-7a52-8b3f-6e7d8c9a0b12",
  "origin": {"kind": "experiment", "experiment_id": "tie_break_gemma"},
  "flow_id": "judge_panel",
  "dataset_id": "judge_panel_cases",
  "question": "compare",
  "on": "dev",
  "cases": 4,
  "repeats": 3,
  "variants": ["gpt_tie_break", "gemma_tie_break"],
  "status": "running",
  "progress": {"done": 0, "total": 24},
  "spend": {"usd": "0.00", "cap_usd": "1.00", "unpriced_attempts": 0},
  "verdict": null,
  "waits": 0,
  "started_at": "2026-09-25T10:02:11Z",
  "finished_at": null,
  "pause": null,
  "launch": {
    "on": "dev",
    "cases": 4,
    "repeats": 3,
    "variants": 2,
    "attempts": 24,
    "available": 4,
    "half_width": 0.25,
    "mde": 0.35,
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
