{
  "address": {
    "node_id": "judges__qwen",
    "branch_key": "qwen",
    "iteration": null,
    "item_index": null
  },
  "kind": "llm",
  "status": "failed",
  "attempts_count": 2,
  "started_at": "2026-09-25T08:09:43Z",
  "finished_at": "2026-09-25T08:11:57Z",
  "latency_ms": 134000,
  "agent": "qwen",
  "inference": "tie_break",
  "model": "openrouter:qwen/qwen3-30b-a3b-instruct-2507",
  "profile": null,
  "cost_usd": "0",
  "tokens_in": 0,
  "tokens_out": 0,
  "cache_hit": false,
  "degraded": false,
  "summary": null,
  "input_ref": null,
  "output_ref": null,
  "trace_id": null,
  "span_id": null,
  "provenance": {},
  "prompt": null,
  "response": null,
  "attempts": [
    {
      "attempt": 1,
      "cause": {
        "kind": "rate_limited",
        "message": "model openrouter:qwen/qwen3-30b-a3b-instruct-2507 failed: provider DeepInfra answered HTTP 429: Provider returned error",
        "schema_errors": [],
        "code": "provider_error",
        "details": {
          "agent": "qwen",
          "model": "openrouter:qwen/qwen3-30b-a3b-instruct-2507",
          "output_mode": "tool",
          "status_code": 429,
          "provider": "DeepInfra",
          "provider_code": "429",
          "provider_response": "{\"error\": {\"message\": \"Provider returned error\", \"code\": 429, \"metadata\": {\"raw\": \"qwen/qwen3-30b-a3b-instruct-2507 is temporarily rate-limited upstream. Please retry shortly.\", \"provider_name\": \"DeepInfra\"}}}"
        }
      },
      "action": "retry",
      "model": "openrouter:qwen/qwen3-30b-a3b-instruct-2507",
      "latency_ms": 412,
      "cost_usd": "0",
      "tokens_in": 0,
      "tokens_out": 0,
      "prompt_ref": null,
      "response_ref": null
    },
    {
      "attempt": 2,
      "cause": {
        "kind": "rate_limited",
        "message": "model openrouter:qwen/qwen3-30b-a3b-instruct-2507 failed: provider DeepInfra answered HTTP 429: Provider returned error",
        "schema_errors": [],
        "code": "provider_error",
        "details": {
          "agent": "qwen",
          "model": "openrouter:qwen/qwen3-30b-a3b-instruct-2507",
          "output_mode": "tool",
          "status_code": 429,
          "provider": "DeepInfra",
          "provider_code": "429",
          "provider_response": "{\"error\": {\"message\": \"Provider returned error\", \"code\": 429, \"metadata\": {\"raw\": \"qwen/qwen3-30b-a3b-instruct-2507 is temporarily rate-limited upstream. Please retry shortly.\", \"provider_name\": \"DeepInfra\"}}}"
        }
      },
      "action": "none",
      "model": "openrouter:qwen/qwen3-30b-a3b-instruct-2507",
      "latency_ms": 389,
      "cost_usd": "0",
      "tokens_in": 0,
      "tokens_out": 0,
      "prompt_ref": null,
      "response_ref": null
    }
  ],
  "checks": [],
  "rule_firings": [],
  "error": {
    "code": "provider_error",
    "message": "model openrouter:qwen/qwen3-30b-a3b-instruct-2507 failed: provider DeepInfra answered HTTP 429: Provider returned error",
    "address": {
      "node_id": "judges__qwen",
      "branch_key": "qwen",
      "iteration": null,
      "item_index": null
    },
    "hint": "the provider kept rate-limiting after the retries: lower limits.rpm or limits.concurrency of the provider in aqven.yaml, or add fallback_models from another provider in agents/qwen.yaml",
    "details": {
      "agent": "qwen",
      "model": "openrouter:qwen/qwen3-30b-a3b-instruct-2507",
      "output_mode": "tool",
      "status_code": 429,
      "provider": "DeepInfra",
      "provider_code": "429",
      "provider_response": "{\"error\": {\"message\": \"Provider returned error\", \"code\": 429, \"metadata\": {\"raw\": \"qwen/qwen3-30b-a3b-instruct-2507 is temporarily rate-limited upstream. Please retry shortly.\", \"provider_name\": \"DeepInfra\"}}}"
    }
  },
  "human": null
}
