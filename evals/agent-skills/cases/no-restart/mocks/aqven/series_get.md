---
expect:
  series_id: "01a0d8b5-6c74-7da0-9e25-1b4a7f0d5e38"
---
{
  "series": {
    "series_id": "{{input.series_id}}",
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
      "done": 2,
      "total": 6
    },
    "spend": {
      "usd": "0.009",
      "cap_usd": "1.00",
      "unpriced_attempts": 0
    },
    "verdict": null,
    "waits": 0,
    "started_at": "2026-09-25T13:10:12Z",
    "finished_at": null,
    "pause": null,
    "question_detail": {
      "kind": "look",
      "metric": null,
      "bound": null,
      "value": null,
      "variant": null,
      "baseline": null,
      "candidate": null,
      "direction": null,
      "margin": null,
      "relative": false,
      "guardrails": []
    },
    "checks": [],
    "matrix": {
      "columns": [],
      "rows": []
    },
    "stability": [],
    "contrasts": [],
    "thresholds": [],
    "aggregates": [],
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
    },
    "needs_approval": false,
    "approved_by": null,
    "finding_path": null,
    "error": null
  },
  "cases": null,
  "hidden_cases": 0
}
