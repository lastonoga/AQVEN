---
type: "fixed"
---
{
  "series": {
    "series_id": "{{input.series_id}}",
    "origin": {"kind": "experiment", "experiment_id": "{{input.series_id}}"},
    "flow_id": "judge_panel",
    "dataset_id": "judge_panel_cases",
    "question": "compare",
    "on": "dev",
    "cases": 8,
    "repeats": 3,
    "variants": [],
    "status": "done",
    "progress": {"done": 48, "total": 48},
    "spend": {"usd": "0.21", "cap_usd": "1.00", "unpriced_attempts": 0},
    "verdict": {
      "state": "signal",
      "reason": "dev_split",
      "text": "Dev signal, not a finding: the candidate picked the expected winner in 18 of 24 attempts against 15 of 24 for the baseline, +12.5 points (95% interval -10 to +35), 8 cases x 3 repeats. Confirm on holdout before relying on it."
    },
    "waits": 0,
    "started_at": "2026-09-25T10:02:11Z",
    "finished_at": "2026-09-25T10:09:40Z",
    "pause": null,
    "question_detail": {"kind": "compare", "metric": "winner", "margin": 0.05},
    "checks": [],
    "matrix": {"columns": [], "rows": []},
    "stability": [],
    "contrasts": [],
    "thresholds": [],
    "aggregates": [],
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
    },
    "needs_approval": false,
    "approved_by": null,
    "finding_path": null,
    "error": null
  },
  "cases": null,
  "hidden_cases": 0
}
