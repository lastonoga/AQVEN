---
expect:
  series_id: "01a0d7a4-2b63-7c9e-8d14-0a3f6e9c4d27"
---
{
  "series": {
    "series_id": "{{input.series_id}}",
    "origin": {
      "kind": "experiment",
      "experiment_id": "panel_merge_rule"
    },
    "flow_id": "judge_panel",
    "dataset_id": "judge_panel_cases",
    "question": "noninferior",
    "on": "holdout",
    "cases": 5,
    "repeats": 3,
    "variants": [
      "majority_and_spread",
      "majority_only",
      "always_tie_break"
    ],
    "status": "running",
    "progress": {
      "done": 11,
      "total": 45
    },
    "spend": {
      "usd": "0.13",
      "cap_usd": "1.00",
      "unpriced_attempts": 0
    },
    "verdict": null,
    "waits": 0,
    "started_at": "2026-09-25T12:05:30Z",
    "finished_at": null,
    "pause": null,
    "question_detail": {
      "kind": "noninferior",
      "metric": "winner",
      "bound": null,
      "value": null,
      "variant": null,
      "baseline": "majority_and_spread",
      "candidate": "majority_only",
      "direction": "higher_is_better",
      "margin": 0.05,
      "relative": false,
      "guardrails": []
    },
    "checks": [
      {
        "check_id": "winner",
        "kind": "binary",
        "source": {
          "kind": "builtin",
          "use": "expected",
          "fields": [
            "winner"
          ]
        }
      },
      {
        "check_id": "settled_by_panel",
        "kind": "binary",
        "source": {
          "kind": "code",
          "ref": "@root.experiments.panel_merge_rule.checks:settled_by_panel"
        }
      }
    ],
    "matrix": {
      "columns": [
        {
          "metric": "winner",
          "role": "primary",
          "direction": "higher_is_better",
          "unit": "rate",
          "margin": 0.05,
          "relative": false
        },
        {
          "metric": "settled_by_panel",
          "role": "check",
          "direction": "higher_is_better",
          "unit": "rate",
          "margin": null,
          "relative": false
        }
      ],
      "rows": []
    },
    "stability": [],
    "contrasts": [],
    "thresholds": [],
    "aggregates": [],
    "launch": {
      "on": "holdout",
      "cases": 5,
      "repeats": 3,
      "variants": 3,
      "attempts": 45,
      "available": 5,
      "half_width": 0.25,
      "mde": 0.35,
      "margin": 0.05,
      "spread": 0.5,
      "spread_source": "prior",
      "icc": 0.3,
      "recommended": {
        "cases": 40,
        "repeats": 3,
        "reason": "wide",
        "text": "about 40 cases"
      },
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
  "cases": [],
  "hidden_cases": 5
}
