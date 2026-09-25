---
expect:
  series_id: "01a0d4e1-7c20-7b3e-8f41-2d6c9a0b7e53"
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
    "status": "done",
    "progress": {
      "done": 45,
      "total": 45
    },
    "spend": {
      "usd": "0.62",
      "cap_usd": "1.00",
      "unpriced_attempts": 0
    },
    "verdict": {
      "state": "invalid",
      "reason": "infra_errors",
      "text": "No finding: 9 of 45 attempts hit infrastructure errors."
    },
    "waits": 0,
    "started_at": "2026-09-25T08:02:11Z",
    "finished_at": "2026-09-25T08:31:47Z",
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
        },
        {
          "metric": "infra_error_rate",
          "role": "builtin",
          "direction": "lower_is_better",
          "unit": "rate",
          "margin": null,
          "relative": false
        }
      ],
      "rows": [
        {
          "variant_id": "majority_and_spread",
          "role": "baseline",
          "cells": [
            {
              "metric": "winner",
              "value": 0.83,
              "low": 0.58,
              "high": 0.95,
              "verdict": "none",
              "method": "kish_wilson",
              "cases": 5
            },
            {
              "metric": "settled_by_panel",
              "value": 0.42,
              "low": null,
              "high": null,
              "verdict": "none",
              "method": "kish_wilson",
              "cases": 5
            },
            {
              "metric": "infra_error_rate",
              "value": 0.2,
              "low": null,
              "high": null,
              "verdict": "none",
              "method": null,
              "cases": 5
            }
          ]
        },
        {
          "variant_id": "majority_only",
          "role": "candidate",
          "cells": [
            {
              "metric": "winner",
              "value": 0.75,
              "low": 0.47,
              "high": 0.91,
              "verdict": "none",
              "method": "kish_wilson",
              "cases": 5
            },
            {
              "metric": "settled_by_panel",
              "value": 0.75,
              "low": null,
              "high": null,
              "verdict": "none",
              "method": "kish_wilson",
              "cases": 5
            },
            {
              "metric": "infra_error_rate",
              "value": 0.2,
              "low": null,
              "high": null,
              "verdict": "none",
              "method": null,
              "cases": 5
            }
          ]
        },
        {
          "variant_id": "always_tie_break",
          "role": "other",
          "cells": [
            {
              "metric": "winner",
              "value": 0.83,
              "low": 0.58,
              "high": 0.95,
              "verdict": "none",
              "method": "kish_wilson",
              "cases": 5
            },
            {
              "metric": "settled_by_panel",
              "value": 0.0,
              "low": null,
              "high": null,
              "verdict": "none",
              "method": "kish_wilson",
              "cases": 5
            },
            {
              "metric": "infra_error_rate",
              "value": 0.2,
              "low": null,
              "high": null,
              "verdict": "none",
              "method": null,
              "cases": 5
            }
          ]
        }
      ]
    },
    "stability": [],
    "contrasts": [],
    "thresholds": [],
    "aggregates": [
      {
        "variant_id": "majority_and_spread",
        "role": "baseline",
        "cases": 5,
        "attempts": 15,
        "counted": 12,
        "infra_errors": 3,
        "spend_usd": "0.21",
        "pass_k": null,
        "icc": null,
        "stability": null,
        "metrics": {
          "winner": {
            "value": 0.83,
            "low": 0.58,
            "high": 0.95,
            "method": "kish_wilson",
            "p_value": null,
            "p_adjusted": null,
            "cases": 5,
            "attempts": 12,
            "degenerate": null
          }
        },
        "runtime_checks": {},
        "models": [
          "openrouter:deepseek/deepseek-v4-flash-0731",
          "openrouter:qwen/qwen3-30b-a3b-instruct-2507",
          "openrouter:meta-llama/llama-3.1-8b-instruct",
          "openrouter:openai/gpt-oss-20b"
        ]
      },
      {
        "variant_id": "majority_only",
        "role": "candidate",
        "cases": 5,
        "attempts": 15,
        "counted": 12,
        "infra_errors": 3,
        "spend_usd": "0.21",
        "pass_k": null,
        "icc": null,
        "stability": null,
        "metrics": {
          "winner": {
            "value": 0.75,
            "low": 0.47,
            "high": 0.91,
            "method": "kish_wilson",
            "p_value": null,
            "p_adjusted": null,
            "cases": 5,
            "attempts": 12,
            "degenerate": null
          }
        },
        "runtime_checks": {},
        "models": [
          "openrouter:deepseek/deepseek-v4-flash-0731",
          "openrouter:qwen/qwen3-30b-a3b-instruct-2507",
          "openrouter:meta-llama/llama-3.1-8b-instruct",
          "openrouter:openai/gpt-oss-20b"
        ]
      },
      {
        "variant_id": "always_tie_break",
        "role": "other",
        "cases": 5,
        "attempts": 15,
        "counted": 12,
        "infra_errors": 3,
        "spend_usd": "0.21",
        "pass_k": null,
        "icc": null,
        "stability": null,
        "metrics": {
          "winner": {
            "value": 0.83,
            "low": 0.58,
            "high": 0.95,
            "method": "kish_wilson",
            "p_value": null,
            "p_adjusted": null,
            "cases": 5,
            "attempts": 12,
            "degenerate": null
          }
        },
        "runtime_checks": {},
        "models": [
          "openrouter:deepseek/deepseek-v4-flash-0731",
          "openrouter:qwen/qwen3-30b-a3b-instruct-2507",
          "openrouter:meta-llama/llama-3.1-8b-instruct",
          "openrouter:openai/gpt-oss-20b"
        ]
      }
    ],
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
