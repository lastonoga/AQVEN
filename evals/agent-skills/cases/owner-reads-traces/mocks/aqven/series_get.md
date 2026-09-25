---
expect:
  series_id: "01a0d9c6-0d85-7eb1-8f36-2c5b8a1e6f49"
---
{
  "series": {
    "series_id": "{{input.series_id}}",
    "origin": {
      "kind": "experiment",
      "experiment_id": "reply_look"
    },
    "flow_id": "support_case",
    "dataset_id": "support_case_cases",
    "question": "look",
    "on": "dev",
    "cases": 4,
    "repeats": 5,
    "variants": [
      "current"
    ],
    "status": "done",
    "progress": {
      "done": 20,
      "total": 20
    },
    "spend": {
      "usd": "0.38",
      "cap_usd": "1.00",
      "unpriced_attempts": 0
    },
    "verdict": null,
    "waits": 0,
    "started_at": "2026-09-25T14:02:40Z",
    "finished_at": "2026-09-25T14:19:05Z",
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
    "checks": [
      {
        "check_id": "promises",
        "kind": "binary",
        "source": {
          "kind": "code",
          "ref": "@root.code.support_case:reply_keeps_resolution"
        }
      },
      {
        "check_id": "critique",
        "kind": "continuous",
        "source": {
          "kind": "judge",
          "inference": "critique",
          "agent": {
            "agent_id": "deepseek",
            "model": "openrouter:deepseek/deepseek-v4-flash-0731"
          },
          "validated_by": "critique_planted_defects"
        }
      }
    ],
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
      "cases": 4,
      "repeats": 5,
      "variants": 1,
      "attempts": 20,
      "available": 4,
      "half_width": 0.25,
      "mde": 0.35,
      "margin": 0.05,
      "spread": 0.5,
      "spread_source": "prior",
      "icc": 0.3,
      "recommended": {
        "cases": 4,
        "repeats": 5,
        "reason": "look",
        "text": "a look runs every selected case"
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
  "cases": [
    {
      "name": "bulb_app_offline_advice",
      "split": "dev",
      "tags": {
        "length": "short",
        "regression": "yes"
      },
      "variants": [
        {
          "variant_id": "current",
          "passed": 2,
          "total": 5,
          "failed_checks": [
            "promises"
          ],
          "usd": "0.0950"
        }
      ],
      "usd": "0.0950",
      "failing": true,
      "divergent": false,
      "attempts": [
        {
          "run_id": "01a0d9c7-060a-7526-a375-d99567f02314",
          "variant_id": "current",
          "repeat": 1,
          "passed": false,
          "outcome": "failed",
          "failed_checks": [
            "promises"
          ],
          "usd": "0.0190",
          "latency_ms": 39310,
          "error": null
        },
        {
          "run_id": "01a0d9c7-08aa-7fc2-8b12-a7f275f7c849",
          "variant_id": "current",
          "repeat": 2,
          "passed": false,
          "outcome": "failed",
          "failed_checks": [
            "promises"
          ],
          "usd": "0.0190",
          "latency_ms": 40220,
          "error": null
        },
        {
          "run_id": "01a0d9c7-69b0-7063-b612-a838dba8392d",
          "variant_id": "current",
          "repeat": 3,
          "passed": true,
          "outcome": "passed",
          "failed_checks": [],
          "usd": "0.0190",
          "latency_ms": 41130,
          "error": null
        },
        {
          "run_id": "01a0d9c7-c96f-797d-a3cf-16f3bfb2f8db",
          "variant_id": "current",
          "repeat": 4,
          "passed": false,
          "outcome": "failed",
          "failed_checks": [
            "promises"
          ],
          "usd": "0.0190",
          "latency_ms": 42040,
          "error": null
        },
        {
          "run_id": "01a0d9c7-1c32-767c-9a6f-7b50cf336ab3",
          "variant_id": "current",
          "repeat": 5,
          "passed": true,
          "outcome": "passed",
          "failed_checks": [],
          "usd": "0.0190",
          "latency_ms": 42950,
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
          "variant_id": "current",
          "passed": 2,
          "total": 5,
          "failed_checks": [
            "critique",
            "promises"
          ],
          "usd": "0.0950"
        }
      ],
      "usd": "0.0950",
      "failing": true,
      "divergent": false,
      "attempts": [
        {
          "run_id": "01a0d9c7-7bf5-777a-8a55-c60541e941ea",
          "variant_id": "current",
          "repeat": 1,
          "passed": false,
          "outcome": "failed",
          "failed_checks": [
            "critique"
          ],
          "usd": "0.0190",
          "latency_ms": 39310,
          "error": null
        },
        {
          "run_id": "01a0d9c7-0474-7ba9-a5fe-5e75b9f0fa17",
          "variant_id": "current",
          "repeat": 2,
          "passed": true,
          "outcome": "passed",
          "failed_checks": [],
          "usd": "0.0190",
          "latency_ms": 40220,
          "error": null
        },
        {
          "run_id": "01a0d9c7-4423-7bf8-8f89-a5d55339f80c",
          "variant_id": "current",
          "repeat": 3,
          "passed": false,
          "outcome": "failed",
          "failed_checks": [
            "promises",
            "critique"
          ],
          "usd": "0.0190",
          "latency_ms": 41130,
          "error": null
        },
        {
          "run_id": "01a0d9c7-ff2f-7990-a6e9-9c429555f8e3",
          "variant_id": "current",
          "repeat": 4,
          "passed": false,
          "outcome": "failed",
          "failed_checks": [
            "critique"
          ],
          "usd": "0.0190",
          "latency_ms": 42040,
          "error": null
        },
        {
          "run_id": "01a0d9c7-e563-7403-994f-5bb3f1035af2",
          "variant_id": "current",
          "repeat": 5,
          "passed": true,
          "outcome": "passed",
          "failed_checks": [],
          "usd": "0.0190",
          "latency_ms": 42950,
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
          "variant_id": "current",
          "passed": 0,
          "total": 5,
          "failed_checks": [
            "promises"
          ],
          "usd": "0.0830"
        }
      ],
      "usd": "0.0830",
      "failing": true,
      "divergent": false,
      "attempts": [
        {
          "run_id": "01a0d9c7-34a2-7eb9-81b7-32963e87e0fc",
          "variant_id": "current",
          "repeat": 1,
          "passed": false,
          "outcome": "failed",
          "failed_checks": [
            "promises"
          ],
          "usd": "0.0190",
          "latency_ms": 39310,
          "error": null
        },
        {
          "run_id": "01a0d9c7-bec7-7742-af95-7ed1f41a246f",
          "variant_id": "current",
          "repeat": 2,
          "passed": false,
          "outcome": "failed",
          "failed_checks": [
            "promises"
          ],
          "usd": "0.0190",
          "latency_ms": 40220,
          "error": null
        },
        {
          "run_id": "01a0d9c7-1d98-78a8-9d93-ec93fa63f7de",
          "variant_id": "current",
          "repeat": 3,
          "passed": false,
          "outcome": "failed",
          "failed_checks": [
            "promises"
          ],
          "usd": "0.0190",
          "latency_ms": 41130,
          "error": null
        },
        {
          "run_id": "01a0d9c7-ff0b-7c4e-bf12-184e98608dc8",
          "variant_id": "current",
          "repeat": 4,
          "passed": false,
          "outcome": "error",
          "failed_checks": [],
          "usd": "0.0070",
          "latency_ms": 0,
          "error": "provider_error: model openrouter:openai/gpt-oss-20b failed: the call to the provider failed: timed out"
        },
        {
          "run_id": "01a0d9c7-c593-7fe7-a801-210c2b8bbea7",
          "variant_id": "current",
          "repeat": 5,
          "passed": false,
          "outcome": "failed",
          "failed_checks": [
            "promises"
          ],
          "usd": "0.0190",
          "latency_ms": 42950,
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
          "variant_id": "current",
          "passed": 2,
          "total": 5,
          "failed_checks": [
            "critique",
            "promises"
          ],
          "usd": "0.0950"
        }
      ],
      "usd": "0.0950",
      "failing": true,
      "divergent": false,
      "attempts": [
        {
          "run_id": "01a0d9c7-355d-78de-b786-46dd63213083",
          "variant_id": "current",
          "repeat": 1,
          "passed": true,
          "outcome": "passed",
          "failed_checks": [],
          "usd": "0.0190",
          "latency_ms": 39310,
          "error": null
        },
        {
          "run_id": "01a0d9c7-32b1-7ffb-9599-300b731af49f",
          "variant_id": "current",
          "repeat": 2,
          "passed": false,
          "outcome": "failed",
          "failed_checks": [
            "critique"
          ],
          "usd": "0.0190",
          "latency_ms": 40220,
          "error": null
        },
        {
          "run_id": "01a0d9c7-e2c2-7d8f-83e6-9c9553e134a0",
          "variant_id": "current",
          "repeat": 3,
          "passed": true,
          "outcome": "passed",
          "failed_checks": [],
          "usd": "0.0190",
          "latency_ms": 41130,
          "error": null
        },
        {
          "run_id": "01a0d9c7-8b2c-77f4-a77a-5ea577f4dc54",
          "variant_id": "current",
          "repeat": 4,
          "passed": false,
          "outcome": "failed",
          "failed_checks": [
            "promises"
          ],
          "usd": "0.0190",
          "latency_ms": 42040,
          "error": null
        },
        {
          "run_id": "01a0d9c7-ac3a-79f3-96c4-e9f95046fab3",
          "variant_id": "current",
          "repeat": 5,
          "passed": false,
          "outcome": "failed",
          "failed_checks": [
            "critique"
          ],
          "usd": "0.0190",
          "latency_ms": 42950,
          "error": null
        }
      ]
    }
  ],
  "hidden_cases": 0
}
