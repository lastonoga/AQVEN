---
expect:
  series_id: "0199a1c4-7e2b-7c3d-9a10-3b4c5d6e7f80"
---
{
  "series": {
    "series_id": "{{input.series_id}}",
    "origin": {"kind": "experiment", "experiment_id": "judge_panel_agents"},
    "flow_id": "judge_panel",
    "dataset_id": "judge_panel_cases",
    "question": "compare",
    "on": "dev",
    "cases": 8,
    "repeats": 3,
    "variants": ["gpt_tie_break", "deepseek_tie_break"],
    "status": "awaiting_approval",
    "progress": {"done": 41, "total": 48},
    "spend": {"usd": "0.91", "cap_usd": "1.00", "unpriced_attempts": 0},
    "verdict": null,
    "waits": 0,
    "started_at": "2026-09-25T09:12:40Z",
    "finished_at": null,
    "pause": {"reason": "spend_near_cap", "spent_usd": "0.91"},
    "question_detail": {
      "kind": "compare",
      "metric": "winner",
      "baseline": "gpt_tie_break",
      "candidate": "deepseek_tie_break",
      "margin": 0.05,
      "relative": false,
      "guardrails": [
        {"metric": "cost_of_pass", "direction": "lower_is_better", "margin": 0.3, "relative": true},
        {"metric": "latency_p95_ms", "direction": "lower_is_better", "margin": 0.5, "relative": true}
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
    "needs_approval": true,
    "approved_by": null,
    "finding_path": null,
    "error": null
  },
  "cases": null,
  "hidden_cases": 0
}
