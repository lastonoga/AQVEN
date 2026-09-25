---
expect:
  series_id: "01a0d5b2-3f41-7a0c-9d62-8e1f4b7c2a05"
---
{
  "series": {
    "series_id": "{{input.series_id}}",
    "origin": {
      "kind": "experiment",
      "experiment_id": "intent_escalation_agents"
    },
    "flow_id": "escalation",
    "dataset_id": "support_case_cases",
    "question": "noninferior",
    "on": "dev",
    "cases": 6,
    "repeats": 3,
    "variants": [
      "deepseek",
      "qwen",
      "gpt"
    ],
    "status": "running",
    "progress": {
      "done": 15,
      "total": 54
    },
    "spend": {
      "usd": "0.07",
      "cap_usd": "1.00",
      "unpriced_attempts": 0
    },
    "verdict": null,
    "waits": 0,
    "started_at": "2026-09-25T09:40:03Z",
    "finished_at": null,
    "pause": null,
    "question_detail": {
      "kind": "noninferior",
      "metric": "intent",
      "bound": null,
      "value": null,
      "variant": null,
      "baseline": "deepseek",
      "candidate": "qwen",
      "direction": "higher_is_better",
      "margin": 0.1,
      "relative": false,
      "guardrails": [
        {
          "metric": "schema_valid_first_try",
          "direction": "higher_is_better",
          "margin": 0.05,
          "relative": false
        },
        {
          "metric": "latency_p95_ms",
          "direction": "lower_is_better",
          "margin": 0.25,
          "relative": true
        }
      ]
    },
    "checks": [
      {
        "check_id": "intent",
        "kind": "binary",
        "source": {
          "kind": "builtin",
          "use": "expected",
          "fields": [
            "intent"
          ]
        }
      }
    ],
    "matrix": {
      "columns": [
        {
          "metric": "intent",
          "role": "primary",
          "direction": "higher_is_better",
          "unit": "rate",
          "margin": 0.1,
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
          "role": "baseline",
          "cells": [
            {
              "metric": "intent",
              "value": 0.75,
              "low": null,
              "high": null,
              "verdict": "none",
              "method": null,
              "cases": 6
            },
            {
              "metric": "latency_p50_ms",
              "value": 4390,
              "low": null,
              "high": null,
              "verdict": "none",
              "method": null,
              "cases": 6
            },
            {
              "metric": "infra_error_rate",
              "value": 0.0,
              "low": null,
              "high": null,
              "verdict": "none",
              "method": null,
              "cases": 6
            }
          ]
        },
        {
          "variant_id": "qwen",
          "role": "candidate",
          "cells": [
            {
              "metric": "intent",
              "value": 0.86,
              "low": null,
              "high": null,
              "verdict": "none",
              "method": null,
              "cases": 6
            },
            {
              "metric": "latency_p50_ms",
              "value": 2560,
              "low": null,
              "high": null,
              "verdict": "none",
              "method": null,
              "cases": 6
            },
            {
              "metric": "infra_error_rate",
              "value": 0.0,
              "low": null,
              "high": null,
              "verdict": "none",
              "method": null,
              "cases": 6
            }
          ]
        },
        {
          "variant_id": "gpt",
          "role": "other",
          "cells": [
            {
              "metric": "intent",
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
              "value": null,
              "low": null,
              "high": null,
              "verdict": "none",
              "method": null,
              "cases": 0
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
        "role": "baseline",
        "cases": 6,
        "attempts": 8,
        "counted": 8,
        "infra_errors": 0,
        "spend_usd": "0.0283",
        "pass_k": null,
        "icc": null,
        "stability": null,
        "metrics": {
          "intent": {
            "value": 0.75,
            "low": null,
            "high": null,
            "method": null,
            "p_value": null,
            "p_adjusted": null,
            "cases": 6,
            "attempts": 8,
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
        "role": "candidate",
        "cases": 6,
        "attempts": 7,
        "counted": 7,
        "infra_errors": 0,
        "spend_usd": "0.0064",
        "pass_k": null,
        "icc": null,
        "stability": null,
        "metrics": {
          "intent": {
            "value": 0.86,
            "low": null,
            "high": null,
            "method": null,
            "p_value": null,
            "p_adjusted": null,
            "cases": 6,
            "attempts": 7,
            "degenerate": "too_few_attempts"
          }
        },
        "runtime_checks": {},
        "models": [
          "openrouter:qwen/qwen3-30b-a3b-instruct-2507"
        ]
      },
      {
        "variant_id": "gpt",
        "role": "other",
        "cases": 0,
        "attempts": 0,
        "counted": 0,
        "infra_errors": 0,
        "spend_usd": "0",
        "pass_k": null,
        "icc": null,
        "stability": null,
        "metrics": {
          "intent": {
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
          "openrouter:openai/gpt-oss-20b"
        ]
      }
    ],
    "launch": {
      "on": "dev",
      "cases": 6,
      "repeats": 3,
      "variants": 3,
      "attempts": 54,
      "available": 6,
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
  "cases": [
    {
      "name": "strip_flicker_credit",
      "split": "dev",
      "tags": {
        "length": "long",
        "regression": "no"
      },
      "variants": [
        {
          "variant_id": "deepseek",
          "passed": 1,
          "total": 1,
          "failed_checks": [],
          "usd": "0.0049"
        },
        {
          "variant_id": "qwen",
          "passed": 0,
          "total": 1,
          "failed_checks": [
            "intent"
          ],
          "usd": "0.0011"
        },
        {
          "variant_id": "gpt",
          "passed": 0,
          "total": 1,
          "failed_checks": [],
          "usd": "0.0000"
        }
      ],
      "usd": "0.0060",
      "failing": true,
      "divergent": true,
      "attempts": [
        {
          "run_id": "01a0d5b2-bd3b-714d-b0c2-d874abcdb40e",
          "variant_id": "deepseek",
          "repeat": 1,
          "passed": true,
          "outcome": "passed",
          "failed_checks": [],
          "usd": "0.0049",
          "latency_ms": 5210,
          "error": null
        },
        {
          "run_id": "01a0d5b2-31fd-76f4-9447-0586896093ae",
          "variant_id": "qwen",
          "repeat": 1,
          "passed": false,
          "outcome": "failed",
          "failed_checks": [
            "intent"
          ],
          "usd": "0.0011",
          "latency_ms": 2980,
          "error": null
        },
        {
          "run_id": "01a0d5b2-5e16-7fcd-b6be-5ebe9148acf6",
          "variant_id": "gpt",
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
      "name": "bulb_app_offline_advice",
      "split": "dev",
      "tags": {
        "length": "short",
        "regression": "yes"
      },
      "variants": [
        {
          "variant_id": "deepseek",
          "passed": 2,
          "total": 2,
          "failed_checks": [],
          "usd": "0.0061"
        },
        {
          "variant_id": "qwen",
          "passed": 2,
          "total": 2,
          "failed_checks": [],
          "usd": "0.0016"
        },
        {
          "variant_id": "gpt",
          "passed": 0,
          "total": 1,
          "failed_checks": [],
          "usd": "0.0000"
        }
      ],
      "usd": "0.0077",
      "failing": false,
      "divergent": true,
      "attempts": [
        {
          "run_id": "01a0d5b2-19e0-72c4-bd65-124d52d9290e",
          "variant_id": "deepseek",
          "repeat": 1,
          "passed": true,
          "outcome": "passed",
          "failed_checks": [],
          "usd": "0.0031",
          "latency_ms": 4120,
          "error": null
        },
        {
          "run_id": "01a0d5b2-8b98-7270-b942-d4a1bc6a8b6c",
          "variant_id": "qwen",
          "repeat": 1,
          "passed": true,
          "outcome": "passed",
          "failed_checks": [],
          "usd": "0.0008",
          "latency_ms": 2410,
          "error": null
        },
        {
          "run_id": "01a0d5b2-bf64-737f-8990-6836be53e327",
          "variant_id": "gpt",
          "repeat": 1,
          "passed": false,
          "outcome": "running",
          "failed_checks": [],
          "usd": "0",
          "latency_ms": 0,
          "error": null
        },
        {
          "run_id": "01a0d5b2-896a-7e7e-9b5c-e88cbf613eb5",
          "variant_id": "deepseek",
          "repeat": 2,
          "passed": true,
          "outcome": "passed",
          "failed_checks": [],
          "usd": "0.0030",
          "latency_ms": 3980,
          "error": null
        },
        {
          "run_id": "01a0d5b2-f093-7f6c-9647-d9c5650e4d79",
          "variant_id": "qwen",
          "repeat": 2,
          "passed": true,
          "outcome": "passed",
          "failed_checks": [],
          "usd": "0.0008",
          "latency_ms": 2330,
          "error": null
        }
      ]
    },
    {
      "name": "lamp_crushed_box_reship",
      "split": "dev",
      "tags": {
        "length": "short",
        "regression": "yes"
      },
      "variants": [
        {
          "variant_id": "deepseek",
          "passed": 1,
          "total": 1,
          "failed_checks": [],
          "usd": "0.0033"
        },
        {
          "variant_id": "qwen",
          "passed": 1,
          "total": 1,
          "failed_checks": [],
          "usd": "0.0009"
        },
        {
          "variant_id": "gpt",
          "passed": 0,
          "total": 1,
          "failed_checks": [],
          "usd": "0.0000"
        }
      ],
      "usd": "0.0042",
      "failing": false,
      "divergent": true,
      "attempts": [
        {
          "run_id": "01a0d5b2-f619-7090-acf0-22dfcf4c688a",
          "variant_id": "deepseek",
          "repeat": 1,
          "passed": true,
          "outcome": "passed",
          "failed_checks": [],
          "usd": "0.0033",
          "latency_ms": 4390,
          "error": null
        },
        {
          "run_id": "01a0d5b2-cb66-7367-a7aa-e096dacaec1e",
          "variant_id": "qwen",
          "repeat": 1,
          "passed": true,
          "outcome": "passed",
          "failed_checks": [],
          "usd": "0.0009",
          "latency_ms": 2560,
          "error": null
        },
        {
          "run_id": "01a0d5b2-cf44-75b8-afdf-6358ff04758b",
          "variant_id": "gpt",
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
      "name": "nova_runtime_advice",
      "split": "dev",
      "tags": {
        "length": "short",
        "regression": "yes"
      },
      "variants": [
        {
          "variant_id": "deepseek",
          "passed": 1,
          "total": 2,
          "failed_checks": [
            "intent"
          ],
          "usd": "0.0059"
        },
        {
          "variant_id": "qwen",
          "passed": 1,
          "total": 1,
          "failed_checks": [],
          "usd": "0.0008"
        },
        {
          "variant_id": "gpt",
          "passed": 0,
          "total": 1,
          "failed_checks": [],
          "usd": "0.0000"
        }
      ],
      "usd": "0.0067",
      "failing": true,
      "divergent": true,
      "attempts": [
        {
          "run_id": "01a0d5b2-1463-716b-bf8b-2d650deed506",
          "variant_id": "deepseek",
          "repeat": 1,
          "passed": true,
          "outcome": "passed",
          "failed_checks": [],
          "usd": "0.0029",
          "latency_ms": 3870,
          "error": null
        },
        {
          "run_id": "01a0d5b2-29e1-7b8b-88fe-e3c9898f0fc2",
          "variant_id": "qwen",
          "repeat": 1,
          "passed": true,
          "outcome": "passed",
          "failed_checks": [],
          "usd": "0.0008",
          "latency_ms": 2290,
          "error": null
        },
        {
          "run_id": "01a0d5b2-4fbc-7ab0-a280-ac73ca8f19ed",
          "variant_id": "gpt",
          "repeat": 1,
          "passed": false,
          "outcome": "running",
          "failed_checks": [],
          "usd": "0",
          "latency_ms": 0,
          "error": null
        },
        {
          "run_id": "01a0d5b2-c77d-74da-b665-833cc3ac926c",
          "variant_id": "deepseek",
          "repeat": 2,
          "passed": false,
          "outcome": "failed",
          "failed_checks": [
            "intent"
          ],
          "usd": "0.0030",
          "latency_ms": 4010,
          "error": null
        }
      ]
    },
    {
      "name": "zigbee_pairing_advice",
      "split": "dev",
      "tags": {
        "length": "short",
        "regression": "no"
      },
      "variants": [
        {
          "variant_id": "deepseek",
          "passed": 1,
          "total": 1,
          "failed_checks": [],
          "usd": "0.0034"
        },
        {
          "variant_id": "qwen",
          "passed": 1,
          "total": 1,
          "failed_checks": [],
          "usd": "0.0009"
        },
        {
          "variant_id": "gpt",
          "passed": 0,
          "total": 1,
          "failed_checks": [],
          "usd": "0.0000"
        }
      ],
      "usd": "0.0043",
      "failing": false,
      "divergent": true,
      "attempts": [
        {
          "run_id": "01a0d5b2-7f0d-78d9-9e64-64782af8d30b",
          "variant_id": "deepseek",
          "repeat": 1,
          "passed": true,
          "outcome": "passed",
          "failed_checks": [],
          "usd": "0.0034",
          "latency_ms": 4450,
          "error": null
        },
        {
          "run_id": "01a0d5b2-14f0-799d-bc11-8865af58517e",
          "variant_id": "qwen",
          "repeat": 1,
          "passed": true,
          "outcome": "passed",
          "failed_checks": [],
          "usd": "0.0009",
          "latency_ms": 2620,
          "error": null
        },
        {
          "run_id": "01a0d5b2-bc05-74dc-bc40-6488c37cd403",
          "variant_id": "gpt",
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
      "name": "dimmer_buzz_advice",
      "split": "dev",
      "tags": {
        "length": "long",
        "regression": "yes"
      },
      "variants": [
        {
          "variant_id": "deepseek",
          "passed": 0,
          "total": 1,
          "failed_checks": [
            "intent"
          ],
          "usd": "0.0047"
        },
        {
          "variant_id": "qwen",
          "passed": 1,
          "total": 1,
          "failed_checks": [],
          "usd": "0.0011"
        },
        {
          "variant_id": "gpt",
          "passed": 0,
          "total": 3,
          "failed_checks": [],
          "usd": "0.0000"
        }
      ],
      "usd": "0.0058",
      "failing": true,
      "divergent": true,
      "attempts": [
        {
          "run_id": "01a0d5b2-5a9f-7fd2-84dd-c00b9ef17d60",
          "variant_id": "deepseek",
          "repeat": 1,
          "passed": false,
          "outcome": "failed",
          "failed_checks": [
            "intent"
          ],
          "usd": "0.0047",
          "latency_ms": 5030,
          "error": null
        },
        {
          "run_id": "01a0d5b2-7995-74c9-bcd6-bc31a7afc9f1",
          "variant_id": "qwen",
          "repeat": 1,
          "passed": true,
          "outcome": "passed",
          "failed_checks": [],
          "usd": "0.0011",
          "latency_ms": 2870,
          "error": null
        },
        {
          "run_id": "01a0d5b2-c43b-78ce-8a15-46219f39a72e",
          "variant_id": "gpt",
          "repeat": 1,
          "passed": false,
          "outcome": "running",
          "failed_checks": [],
          "usd": "0",
          "latency_ms": 0,
          "error": null
        },
        {
          "run_id": "01a0d5b2-f8b7-73cc-ba6d-c15bffc1a75a",
          "variant_id": "gpt",
          "repeat": 2,
          "passed": false,
          "outcome": "running",
          "failed_checks": [],
          "usd": "0",
          "latency_ms": 0,
          "error": null
        },
        {
          "run_id": "01a0d5b2-414a-77b4-9cd0-20b2745aeda6",
          "variant_id": "gpt",
          "repeat": 3,
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
