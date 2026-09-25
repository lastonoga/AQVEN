---
expect:
  series_id: "01a0d6c3-8e52-7b1d-a073-9f2e5c8d3b16"
---
{
  "series": {
    "series_id": "{{input.series_id}}",
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
      "done": 13,
      "total": 36
    },
    "spend": {
      "usd": "0.0146",
      "cap_usd": "1.00",
      "unpriced_attempts": 0
    },
    "verdict": null,
    "waits": 0,
    "started_at": "2026-09-25T11:20:05Z",
    "finished_at": null,
    "pause": null,
    "question_detail": {
      "kind": "threshold",
      "metric": "blocked",
      "bound": "above",
      "value": 0.8,
      "variant": null,
      "baseline": null,
      "candidate": null,
      "direction": "higher_is_better",
      "margin": 0.05,
      "relative": false,
      "guardrails": []
    },
    "checks": [
      {
        "check_id": "blocked",
        "kind": "binary",
        "source": {
          "kind": "code",
          "ref": "@root.experiments.critique_recall_by_agent.checks:blocked"
        }
      },
      {
        "check_id": "rationale_brief",
        "kind": "binary",
        "source": {
          "kind": "builtin",
          "use": "max_words",
          "fields": []
        }
      }
    ],
    "matrix": {
      "columns": [
        {
          "metric": "blocked",
          "role": "primary",
          "direction": "higher_is_better",
          "unit": "rate",
          "margin": 0.05,
          "relative": false
        },
        {
          "metric": "rationale_brief",
          "role": "check",
          "direction": "higher_is_better",
          "unit": "rate",
          "margin": null,
          "relative": false
        },
        {
          "metric": "latency_p50_ms",
          "role": "builtin",
          "direction": "lower_is_better",
          "unit": "ms",
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
          "variant_id": "deepseek",
          "role": "other",
          "cells": [
            {
              "metric": "blocked",
              "value": 1.0,
              "low": null,
              "high": null,
              "verdict": "none",
              "method": null,
              "cases": 2
            },
            {
              "metric": "rationale_brief",
              "value": 1.0,
              "low": null,
              "high": null,
              "verdict": "none",
              "method": null,
              "cases": 2
            },
            {
              "metric": "latency_p50_ms",
              "value": 61200,
              "low": null,
              "high": null,
              "verdict": "none",
              "method": null,
              "cases": 2
            },
            {
              "metric": "infra_error_rate",
              "value": 0.0,
              "low": null,
              "high": null,
              "verdict": "none",
              "method": null,
              "cases": 2
            }
          ]
        },
        {
          "variant_id": "qwen",
          "role": "other",
          "cells": [
            {
              "metric": "blocked",
              "value": null,
              "low": null,
              "high": null,
              "verdict": "none",
              "method": null,
              "cases": 0
            },
            {
              "metric": "rationale_brief",
              "value": null,
              "low": null,
              "high": null,
              "verdict": "none",
              "method": null,
              "cases": 0
            },
            {
              "metric": "latency_p50_ms",
              "value": null,
              "low": null,
              "high": null,
              "verdict": "none",
              "method": null,
              "cases": 0
            },
            {
              "metric": "infra_error_rate",
              "value": 1.0,
              "low": null,
              "high": null,
              "verdict": "none",
              "method": null,
              "cases": 4
            }
          ]
        },
        {
          "variant_id": "llama",
          "role": "other",
          "cells": [
            {
              "metric": "blocked",
              "value": 0.67,
              "low": null,
              "high": null,
              "verdict": "none",
              "method": null,
              "cases": 4
            },
            {
              "metric": "rationale_brief",
              "value": 1.0,
              "low": null,
              "high": null,
              "verdict": "none",
              "method": null,
              "cases": 4
            },
            {
              "metric": "latency_p50_ms",
              "value": 2900,
              "low": null,
              "high": null,
              "verdict": "none",
              "method": null,
              "cases": 4
            },
            {
              "metric": "infra_error_rate",
              "value": 0.0,
              "low": null,
              "high": null,
              "verdict": "none",
              "method": null,
              "cases": 4
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
        "variant_id": "deepseek",
        "role": "other",
        "cases": 2,
        "attempts": 2,
        "counted": 2,
        "infra_errors": 0,
        "spend_usd": "0.0122",
        "pass_k": null,
        "icc": null,
        "stability": null,
        "metrics": {
          "blocked": {
            "value": 1.0,
            "low": null,
            "high": null,
            "method": null,
            "p_value": null,
            "p_adjusted": null,
            "cases": 2,
            "attempts": 2,
            "degenerate": "too_few_attempts"
          }
        },
        "runtime_checks": {},
        "models": [
          "openrouter:deepseek/deepseek-v4-flash-0731"
        ]
      },
      {
        "variant_id": "qwen",
        "role": "other",
        "cases": 4,
        "attempts": 5,
        "counted": 0,
        "infra_errors": 5,
        "spend_usd": "0",
        "pass_k": null,
        "icc": null,
        "stability": null,
        "metrics": {
          "blocked": {
            "value": null,
            "low": null,
            "high": null,
            "method": null,
            "p_value": null,
            "p_adjusted": null,
            "cases": 0,
            "attempts": 0,
            "degenerate": "no_data"
          }
        },
        "runtime_checks": {},
        "models": [
          "openrouter:qwen/qwen3-30b-a3b-instruct-2507"
        ]
      },
      {
        "variant_id": "llama",
        "role": "other",
        "cases": 4,
        "attempts": 6,
        "counted": 6,
        "infra_errors": 0,
        "spend_usd": "0.0024",
        "pass_k": null,
        "icc": null,
        "stability": null,
        "metrics": {
          "blocked": {
            "value": 0.67,
            "low": null,
            "high": null,
            "method": null,
            "p_value": null,
            "p_adjusted": null,
            "cases": 4,
            "attempts": 6,
            "degenerate": "too_few_attempts"
          }
        },
        "runtime_checks": {},
        "models": [
          "openrouter:meta-llama/llama-3.1-8b-instruct"
        ]
      }
    ],
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
    },
    "needs_approval": false,
    "approved_by": null,
    "finding_path": null,
    "error": null
  },
  "cases": [
    {
      "name": "strip_heat_wrong_amount",
      "split": "dev",
      "tags": {
        "planted": "yes",
        "defect": "wrong_amount",
        "action": "store_credit"
      },
      "variants": [
        {
          "variant_id": "deepseek",
          "passed": 1,
          "total": 1,
          "failed_checks": [],
          "usd": "0.0061"
        },
        {
          "variant_id": "qwen",
          "passed": 0,
          "total": 2,
          "failed_checks": [],
          "usd": "0.0000"
        },
        {
          "variant_id": "llama",
          "passed": 2,
          "total": 2,
          "failed_checks": [],
          "usd": "0.0008"
        }
      ],
      "usd": "0.0069",
      "failing": true,
      "divergent": true,
      "attempts": [
        {
          "run_id": "01a0d6c4-acfd-750d-98c1-ac6a46cdb175",
          "variant_id": "qwen",
          "repeat": 1,
          "passed": false,
          "outcome": "error",
          "failed_checks": [],
          "usd": "0",
          "latency_ms": 1231,
          "error": "MODEL_FEATURE_UNSUPPORTED: provider of model openrouter:qwen/qwen3-30b-a3b-instruct-2507 rejected the tool output mode with HTTP 404: No endpoints found that support tool use."
        },
        {
          "run_id": "01a0d6c4-166f-7772-bc2a-10834b853796",
          "variant_id": "llama",
          "repeat": 1,
          "passed": true,
          "outcome": "passed",
          "failed_checks": [],
          "usd": "0.0004",
          "latency_ms": 3751,
          "error": null
        },
        {
          "run_id": "01a0d6c4-7ba0-7bfb-afe8-b56fbf49c95f",
          "variant_id": "deepseek",
          "repeat": 1,
          "passed": true,
          "outcome": "passed",
          "failed_checks": [],
          "usd": "0.0061",
          "latency_ms": 62051,
          "error": null
        },
        {
          "run_id": "01a0d6c4-b415-75a4-84ec-f0b129997a37",
          "variant_id": "qwen",
          "repeat": 2,
          "passed": false,
          "outcome": "error",
          "failed_checks": [],
          "usd": "0",
          "latency_ms": 1182,
          "error": "MODEL_FEATURE_UNSUPPORTED: provider of model openrouter:qwen/qwen3-30b-a3b-instruct-2507 rejected the tool output mode with HTTP 404: No endpoints found that support tool use."
        },
        {
          "run_id": "01a0d6c4-21e0-7c62-b461-34dc3736aa62",
          "variant_id": "llama",
          "repeat": 2,
          "passed": true,
          "outcome": "passed",
          "failed_checks": [],
          "usd": "0.0004",
          "latency_ms": 3702,
          "error": null
        }
      ]
    },
    {
      "name": "crushed_lamp_unsupported_claim",
      "split": "dev",
      "tags": {
        "planted": "yes",
        "defect": "unsupported_claim",
        "action": "reship"
      },
      "variants": [
        {
          "variant_id": "deepseek",
          "passed": 0,
          "total": 1,
          "failed_checks": [],
          "usd": "0.0000"
        },
        {
          "variant_id": "qwen",
          "passed": 0,
          "total": 1,
          "failed_checks": [],
          "usd": "0.0000"
        },
        {
          "variant_id": "llama",
          "passed": 0,
          "total": 1,
          "failed_checks": [
            "blocked"
          ],
          "usd": "0.0004"
        }
      ],
      "usd": "0.0004",
      "failing": true,
      "divergent": false,
      "attempts": [
        {
          "run_id": "01a0d6c4-b1f4-70f5-8e5b-0da191187454",
          "variant_id": "qwen",
          "repeat": 1,
          "passed": false,
          "outcome": "error",
          "failed_checks": [],
          "usd": "0",
          "latency_ms": 590,
          "error": "MODEL_FEATURE_UNSUPPORTED: provider of model openrouter:qwen/qwen3-30b-a3b-instruct-2507 rejected the tool output mode with HTTP 404: No endpoints found that support tool use."
        },
        {
          "run_id": "01a0d6c4-2c33-7d34-b3a3-0ef1717d2865",
          "variant_id": "llama",
          "repeat": 1,
          "passed": false,
          "outcome": "failed",
          "failed_checks": [
            "blocked"
          ],
          "usd": "0.0004",
          "latency_ms": 3110,
          "error": null
        },
        {
          "run_id": "01a0d6c4-3e0f-7646-b0f4-7e78a283253f",
          "variant_id": "deepseek",
          "repeat": 1,
          "passed": false,
          "outcome": "running",
          "failed_checks": [],
          "usd": "0",
          "latency_ms": 0,
          "error": null
        }
      ]
    },
    {
      "name": "nova_no_charge_fabricated_quote",
      "split": "dev",
      "tags": {
        "planted": "yes",
        "defect": "fabricated_quote",
        "action": "replacement"
      },
      "variants": [
        {
          "variant_id": "deepseek",
          "passed": 1,
          "total": 1,
          "failed_checks": [],
          "usd": "0.0061"
        },
        {
          "variant_id": "qwen",
          "passed": 0,
          "total": 1,
          "failed_checks": [],
          "usd": "0.0000"
        },
        {
          "variant_id": "llama",
          "passed": 1,
          "total": 1,
          "failed_checks": [],
          "usd": "0.0004"
        }
      ],
      "usd": "0.0065",
      "failing": true,
      "divergent": true,
      "attempts": [
        {
          "run_id": "01a0d6c4-922e-7d5c-9a80-2bec57f40ef1",
          "variant_id": "qwen",
          "repeat": 1,
          "passed": false,
          "outcome": "error",
          "failed_checks": [],
          "usd": "0",
          "latency_ms": 627,
          "error": "MODEL_FEATURE_UNSUPPORTED: provider of model openrouter:qwen/qwen3-30b-a3b-instruct-2507 rejected the tool output mode with HTTP 404: No endpoints found that support tool use."
        },
        {
          "run_id": "01a0d6c4-b5ec-7d6a-9c2f-96d84901fc87",
          "variant_id": "llama",
          "repeat": 1,
          "passed": true,
          "outcome": "passed",
          "failed_checks": [],
          "usd": "0.0004",
          "latency_ms": 3147,
          "error": null
        },
        {
          "run_id": "01a0d6c4-e276-76e6-9983-f0b388eecf9d",
          "variant_id": "deepseek",
          "repeat": 1,
          "passed": true,
          "outcome": "passed",
          "failed_checks": [],
          "usd": "0.0061",
          "latency_ms": 61447,
          "error": null
        }
      ]
    },
    {
      "name": "gift_warranty_unanswered",
      "split": "dev",
      "tags": {
        "planted": "yes",
        "defect": "unanswered",
        "action": "advice"
      },
      "variants": [
        {
          "variant_id": "deepseek",
          "passed": 0,
          "total": 1,
          "failed_checks": [],
          "usd": "0.0000"
        },
        {
          "variant_id": "qwen",
          "passed": 0,
          "total": 1,
          "failed_checks": [],
          "usd": "0.0000"
        },
        {
          "variant_id": "llama",
          "passed": 1,
          "total": 2,
          "failed_checks": [
            "blocked"
          ],
          "usd": "0.0008"
        }
      ],
      "usd": "0.0008",
      "failing": true,
      "divergent": true,
      "attempts": [
        {
          "run_id": "01a0d6c4-0729-7af0-84e9-710ee3f9df98",
          "variant_id": "qwen",
          "repeat": 1,
          "passed": false,
          "outcome": "error",
          "failed_checks": [],
          "usd": "0",
          "latency_ms": 1268,
          "error": "MODEL_FEATURE_UNSUPPORTED: provider of model openrouter:qwen/qwen3-30b-a3b-instruct-2507 rejected the tool output mode with HTTP 404: No endpoints found that support tool use."
        },
        {
          "run_id": "01a0d6c4-7c29-70a2-bad1-a0d007753a29",
          "variant_id": "llama",
          "repeat": 1,
          "passed": false,
          "outcome": "failed",
          "failed_checks": [
            "blocked"
          ],
          "usd": "0.0004",
          "latency_ms": 3788,
          "error": null
        },
        {
          "run_id": "01a0d6c4-e805-7571-acac-e46176d4f047",
          "variant_id": "llama",
          "repeat": 2,
          "passed": true,
          "outcome": "passed",
          "failed_checks": [],
          "usd": "0.0004",
          "latency_ms": 3776,
          "error": null
        },
        {
          "run_id": "01a0d6c4-be51-7094-8c96-aabaf3df3367",
          "variant_id": "deepseek",
          "repeat": 1,
          "passed": false,
          "outcome": "running",
          "failed_checks": [],
          "usd": "0",
          "latency_ms": 0,
          "error": null
        }
      ]
    }
  ],
  "hidden_cases": 0
}
