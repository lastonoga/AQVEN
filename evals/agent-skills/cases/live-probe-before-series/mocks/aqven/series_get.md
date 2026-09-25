{
  "series": {
    "series_id": "{{input.series_id}}",
    "origin": {"kind": "experiment", "experiment_id": "tie_break_gemma"},
    "flow_id": "judge_panel",
    "dataset_id": "judge_panel_cases",
    "question": "compare",
    "on": "dev",
    "cases": 4,
    "repeats": 3,
    "variants": ["gpt_tie_break", "gemma_tie_break"],
    "status": "running",
    "progress": {"done": 2, "total": 24},
    "spend": {"usd": "0.01", "cap_usd": "1.00", "unpriced_attempts": 0},
    "verdict": null,
    "waits": 0,
    "started_at": "2026-09-25T10:02:11Z",
    "finished_at": null,
    "pause": null,
    "question_detail": {
      "kind": "compare",
      "metric": "winner",
      "baseline": "gpt_tie_break",
      "candidate": "gemma_tie_break",
      "margin": 0.05,
      "relative": false,
      "guardrails": [
        {"metric": "cost_of_pass", "direction": "lower_is_better", "margin": 0.3, "relative": true}
      ]
    },
    "checks": [
      {
        "check_id": "winner",
        "kind": "binary",
        "source": {"kind": "builtin", "use": "expected", "fields": ["winner"]}
      }
    ],
    "matrix": {"columns": [], "rows": []},
    "stability": [],
    "contrasts": [],
    "thresholds": [],
    "aggregates": [],
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
    },
    "needs_approval": false,
    "approved_by": null,
    "finding_path": null,
    "error": null
  },
  "cases": null,
  "hidden_cases": 0
}
