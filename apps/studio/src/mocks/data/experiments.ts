import type { ApiExperimentDetail } from "@/domain"

export const liveExperiments: readonly ApiExperimentDetail[] = [
  {
    "experiment_id": "critique_planted_defects",
    "description": "The DeepSeek critic blocks replies with a planted defect and lets clean replies through: its verdict matches the label in more than 85% of cases",
    "flow_id": null,
    "subject": {
      "kind": "flow",
      "flow_id": "critique_only",
      "local_flow": true,
      "from_node": null,
      "to_node": null
    },
    "failure_mode": "judge_misses_defect",
    "question": "threshold",
    "variants": [
      "deepseek"
    ],
    "baseline": null,
    "candidate": null,
    "latest": null,
    "series_count": 0,
    "spent_usd": "0",
    "archived": false,
    "created": "2026-09-12T10:00:00Z",
    "last_activity": "2026-09-22T09:00:00Z",
    "activity_source": "files",
    "running": false,
    "attention": [
      "results_stale"
    ],
    "question_detail": {
      "kind": "threshold",
      "metric": "label",
      "bound": "above",
      "value": 0.85,
      "variant": "deepseek",
      "baseline": null,
      "candidate": null,
      "direction": "higher_is_better",
      "margin": 0.05,
      "relative": false,
      "guardrails": []
    },
    "varies": null,
    "slots": [],
    "agents": [],
    "flows": [
      {
        "flow_id": "critique_only",
        "description": "The reply critic on its own: the critique inference with the DeepSeek agent scores a finished reply, and the verdict step reads the score and the blocking remarks as the polish loop does",
        "file": "experiments/critique_planted_defects/flows/critique_only/flow.yaml",
        "steps": [
          {
            "node_id": "critique",
            "kind": "llm",
            "agent": {
              "agent_id": "deepseek",
              "model": "openrouter:deepseek/deepseek-v4-flash-0731"
            },
            "description": "The DeepSeek-family critic scores the reply against the decision and the knowledge base chunks"
          },
          {
            "node_id": "verdict",
            "kind": "code",
            "agent": null,
            "description": "Reads the critique as the polish loop does: the reply may go out when the score reaches the approval threshold and nothing blocks it"
          }
        ]
      }
    ],
    "alternatives": [],
    "prompts": [],
    "cases": {
      "dataset_id": "planted_defect_replies",
      "flow_id": null,
      "tags": {},
      "selected": 16,
      "total": 16,
      "splits": {
        "dev": 9,
        "holdout": 7
      }
    },
    "variant_details": [
      {
        "variant_id": "deepseek",
        "role": "other",
        "changes": [],
        "assignments": [
          {
            "node_id": "critique",
            "agent": {
              "agent_id": "deepseek",
              "model": "openrouter:deepseek/deepseek-v4-flash-0731"
            },
            "overridden": false
          }
        ]
      }
    ],
    "checks": [
      {
        "check_id": "label",
        "kind": "binary",
        "source": {
          "kind": "builtin",
          "use": "expected",
          "fields": [
            "verdict"
          ],
          "ref": null,
          "inference": null,
          "agent": null,
          "validated_by": null
        }
      }
    ],
    "metrics": [
      {
        "metric": "label",
        "role": "primary",
        "direction": "higher_is_better",
        "unit": "rate",
        "margin": 0.05,
        "relative": false
      },
      {
        "metric": "success_rate",
        "role": "builtin",
        "direction": "higher_is_better",
        "unit": "rate",
        "margin": null,
        "relative": false
      },
      {
        "metric": "cost_usd",
        "role": "builtin",
        "direction": "lower_is_better",
        "unit": "usd",
        "margin": null,
        "relative": false
      },
      {
        "metric": "cost_of_pass",
        "role": "builtin",
        "direction": "lower_is_better",
        "unit": "usd",
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
        "metric": "latency_p95_ms",
        "role": "builtin",
        "direction": "lower_is_better",
        "unit": "ms",
        "margin": null,
        "relative": false
      },
      {
        "metric": "schema_valid_first_try",
        "role": "builtin",
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
    "plan": {
      "cases": 16,
      "repeats": 3
    },
    "notes": "# Validating the reply critic on planted defects\n\n**Purpose:** validating a judge. Until this experiment passes, every experiment that scores with this critic (see\n`validated_by` in `reply_noninferior_mistral` and `reply_look`) gives a signal, not evidence.\n\n**Subject.** The local flow `critique_only` (`flows/critique_only/`) runs the critic outside the polish loop. The `critique` step is the project's\n`critique` inference with the `deepseek` agent, exactly as the other experiments use it as a check. The `verdict` step\nreads the critique the way the loop does: a reply may go out when the score reaches the loop's approval threshold\nof 0.85 and there are no blocking remarks. It is deterministic, so it adds no noise of its own.\n\n**Cases.** `planted_defect_replies` holds eight Lumen scenarios. Each has a clean reply that a support lead would send\n(`planted: no`, expected `send`) and a copy of it with one planted defect (`planted: yes`, expected `block`). The\n`defect` tag names the kind of defect:\n\n- `wrong_amount`: the credit amount differs from the decision.\n- `overpromise`: a replacement is promised for an advice-only decision.\n- `unsupported_claim`: a delivery time that no chunk states.\n- `contradicts_source`: normal battery wear is called a fault.\n- `fabricated_quote`: a citation quotes text the chunk does not contain.\n- `wrong_steps`: Wi-Fi steps are given for a Zigbee bulb.\n- `missing_safety`: the unplug-and-stop instruction is dropped from a burning-smell case.\n- `unanswered`: one of the customer's two questions is left out.\n\n**Reading the result.** The `label` check is the built-in `expected` check on `verdict`. Its pass rate has to stay\nabove 0.85 with a margin of 0.05. Read it separately on `planted: yes` (TPR, defects caught) and `planted: no`\n(TNR, clean replies let through). A critic that blocks everything scores 0.5 overall and 0.0 on clean replies.\n\n**Caveat.** Planted defects are easier to spot than natural ones, so TPR here is an upper bound. These defects were\nwritten by hand. When the set grows, have a model from a family other than the critic's plant them. Re-run the\nexperiment after any edit to the critique prompt or a change of the critic agent.\n",
    "files": {
      "spec": "experiments/critique_planted_defects/experiment.yaml",
      "notes": "experiments/critique_planted_defects/experiment.md"
    }
  },
  {
    "experiment_id": "critique_recall_by_agent",
    "description": "Each candidate critic agent stops more than 80% of replies with a planted defect, by a score below the approval threshold or a blocking remark",
    "flow_id": null,
    "subject": {
      "kind": "flow",
      "flow_id": "critic",
      "local_flow": true,
      "from_node": null,
      "to_node": null
    },
    "failure_mode": "judge_misses_defect",
    "question": "threshold",
    "variants": [
      "deepseek",
      "qwen",
      "llama"
    ],
    "baseline": null,
    "candidate": null,
    "latest": null,
    "series_count": 0,
    "spent_usd": "0",
    "archived": false,
    "created": "2026-09-12T10:05:00Z",
    "last_activity": "2026-09-14T16:20:00Z",
    "activity_source": "files",
    "running": false,
    "attention": [],
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
    "varies": {
      "what": "agent",
      "nodes": [
        "critique"
      ]
    },
    "slots": [
      {
        "node_id": "critique",
        "kind": "llm",
        "written": "deepseek",
        "files": [
          {
            "role": "node",
            "path": "experiments/critique_recall_by_agent/flows/critic/flow.py"
          },
          {
            "role": "inference",
            "path": "flows/support_case/nodes/polish/critique.inference.yaml"
          },
          {
            "role": "prompt",
            "path": "flows/support_case/nodes/polish/critique.prompt.md"
          }
        ]
      }
    ],
    "agents": [
      {
        "agent_id": "deepseek",
        "file": "agents/deepseek.yaml",
        "spec": {
          "apiVersion": "aqven/v1",
          "kind": "Agent",
          "description": "Intent cascade escalation, DeepSeek-family panel judge and the reply critic in experiments",
          "model": "openrouter:deepseek/deepseek-v4-flash-0731",
          "fallback_models": null,
          "settings": {
            "temperature": 0.0,
            "top_p": null,
            "max_tokens": 1500,
            "seed": null,
            "provider_options": null
          },
          "output": {
            "mode": "prompted",
            "strict": false,
            "retries": 1,
            "on_error": "retry",
            "on_refusal": "fail",
            "on_truncated": "fail"
          },
          "instructions": null,
          "tools": null,
          "mcp_servers": null,
          "subagents": null,
          "approval": null,
          "limits": null
        },
        "instructions": null
      },
      {
        "agent_id": "qwen",
        "file": "agents/qwen.yaml",
        "spec": {
          "apiVersion": "aqven/v1",
          "kind": "Agent",
          "description": "Qwen-family panel judge",
          "model": "openrouter:qwen/qwen3-30b-a3b-instruct-2507",
          "fallback_models": null,
          "settings": {
            "temperature": 0.0,
            "top_p": null,
            "max_tokens": 1500,
            "seed": null,
            "provider_options": null
          },
          "output": {
            "mode": "tool",
            "strict": false,
            "retries": 1,
            "on_error": "retry",
            "on_refusal": "fail",
            "on_truncated": "fail"
          },
          "instructions": null,
          "tools": null,
          "mcp_servers": null,
          "subagents": null,
          "approval": null,
          "limits": null
        },
        "instructions": null
      },
      {
        "agent_id": "llama",
        "file": "agents/llama.yaml",
        "spec": {
          "apiVersion": "aqven/v1",
          "kind": "Agent",
          "description": "Cheap open model: intent ballots and the Meta-family panel judge",
          "model": "openrouter:meta-llama/llama-3.1-8b-instruct",
          "fallback_models": null,
          "settings": {
            "temperature": 0.2,
            "top_p": null,
            "max_tokens": 800,
            "seed": null,
            "provider_options": null
          },
          "output": {
            "mode": "auto",
            "strict": false,
            "retries": 1,
            "on_error": "retry",
            "on_refusal": "fail",
            "on_truncated": "fail"
          },
          "instructions": null,
          "tools": null,
          "mcp_servers": null,
          "subagents": null,
          "approval": null,
          "limits": null
        },
        "instructions": null
      }
    ],
    "flows": [
      {
        "flow_id": "critic",
        "description": "The reply critic as a one-step local flow: the project's critique inference on a finished reply",
        "file": "experiments/critique_recall_by_agent/flows/critic/flow.py",
        "steps": [
          {
            "node_id": "critique",
            "kind": "llm",
            "agent": {
              "agent_id": "deepseek",
              "model": "openrouter:deepseek/deepseek-v4-flash-0731"
            },
            "description": "The critic scores a finished reply against the decision and the knowledge base chunks"
          }
        ]
      }
    ],
    "alternatives": [],
    "prompts": [],
    "cases": {
      "dataset_id": "planted_defect_replies",
      "flow_id": null,
      "tags": {
        "planted": "yes"
      },
      "selected": 8,
      "total": 16,
      "splits": {
        "dev": 4,
        "holdout": 4
      }
    },
    "variant_details": [
      {
        "variant_id": "deepseek",
        "role": "other",
        "changes": [],
        "assignments": [
          {
            "node_id": "critique",
            "agent": {
              "agent_id": "deepseek",
              "model": "openrouter:deepseek/deepseek-v4-flash-0731"
            },
            "overridden": false
          }
        ]
      },
      {
        "variant_id": "qwen",
        "role": "other",
        "changes": [
          {
            "node_id": "critique",
            "what": "agent",
            "value": "qwen"
          }
        ],
        "assignments": [
          {
            "node_id": "critique",
            "agent": {
              "agent_id": "qwen",
              "model": "openrouter:qwen/qwen3-30b-a3b-instruct-2507"
            },
            "overridden": true
          }
        ]
      },
      {
        "variant_id": "llama",
        "role": "other",
        "changes": [
          {
            "node_id": "critique",
            "what": "agent",
            "value": "llama"
          }
        ],
        "assignments": [
          {
            "node_id": "critique",
            "agent": {
              "agent_id": "llama",
              "model": "openrouter:meta-llama/llama-3.1-8b-instruct"
            },
            "overridden": true
          }
        ]
      }
    ],
    "checks": [
      {
        "check_id": "blocked",
        "kind": "binary",
        "source": {
          "kind": "code",
          "use": null,
          "fields": [],
          "ref": "lumen.experiments.critique_recall_by_agent.checks:blocked",
          "inference": null,
          "agent": null,
          "validated_by": null
        }
      },
      {
        "check_id": "rationale_brief",
        "kind": "binary",
        "source": {
          "kind": "builtin",
          "use": "max_words",
          "fields": [
            "$out.rationale"
          ],
          "ref": null,
          "inference": null,
          "agent": null,
          "validated_by": null
        }
      }
    ],
    "metrics": [
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
        "metric": "success_rate",
        "role": "builtin",
        "direction": "higher_is_better",
        "unit": "rate",
        "margin": null,
        "relative": false
      },
      {
        "metric": "cost_usd",
        "role": "builtin",
        "direction": "lower_is_better",
        "unit": "usd",
        "margin": null,
        "relative": false
      },
      {
        "metric": "cost_of_pass",
        "role": "builtin",
        "direction": "lower_is_better",
        "unit": "usd",
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
        "metric": "latency_p95_ms",
        "role": "builtin",
        "direction": "lower_is_better",
        "unit": "ms",
        "margin": null,
        "relative": false
      },
      {
        "metric": "schema_valid_first_try",
        "role": "builtin",
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
    "plan": {
      "cases": 8,
      "repeats": 3
    },
    "notes": "# Which critic agent catches planted defects\n\n**Purpose:** validating a judge and choosing its agent: the recall half (TPR) of `critique_planted_defects`, per agent.\n\n`critique_planted_defects` measures the DeepSeek critic's overall agreement with the labels. This experiment asks a\nnarrower question for three agents at once: on replies that do carry a defect, how often does the critic stop them?\n\n**Subject.** The local flow `critic` is a Python flow builder (`flows/critic/flow.py`) with one step: the project's `critique`\ninference on a `ReplyReview`, returning the `Critique` as it is. There is no verdict step; the `blocked` check reads the\ncritique the way the polish loop does.\n\n**Cases.** Only `planted: yes` from `planted_defect_replies`: eight replies, one defect each. Clean replies are left out\non purpose, so a critic that blocks everything scores 1.0 here. Read this result together with the clean-reply pass\nrate of `critique_planted_defects` before trusting it.\n\n**Variants.** The factor is the agent on the `critique` node (`varies: what: agent`). `deepseek` is the flow as written;\n`qwen` and `llama` put the Qwen and Llama agents on `critique`. Both are cheaper panel families, so a pass would make the\ncritic cheaper too. The rows are agents, the columns are the two checks below.\n\n**Checks.**\n\n- `blocked`: a code check, passes when the score is below the loop's approval threshold of 0.85 or the critique has a\n  blocking remark.\n- `rationale_brief`: the rationale stays under 100 words, so the support lead can read why a reply was stopped.\n\n**Reading the result.** There is no `variant` in the question, so each agent gets its own verdict: a confirmed agent\nstops more than 80% of planted defects with a margin of 0.05. An agent that is confirmed here and fails on clean\nreplies is a critic that blocks everything, not a good critic.\n",
    "files": {
      "spec": "experiments/critique_recall_by_agent/experiment.yaml",
      "notes": "experiments/critique_recall_by_agent/experiment.md"
    }
  },
  {
    "experiment_id": "intent_ballot_pair",
    "description": "A second intent ballot on the evidence, settled by confidence, gets the intent of a long message right more often than one ballot, with at most 5 points fewer outputs valid on the first try",
    "flow_id": null,
    "subject": {
      "kind": "flow",
      "flow_id": "intent_decision",
      "local_flow": true,
      "from_node": null,
      "to_node": null
    },
    "failure_mode": "intent_misread",
    "question": "compare",
    "variants": [
      "single",
      "pair"
    ],
    "baseline": "single",
    "candidate": "pair",
    "latest": null,
    "series_count": 0,
    "spent_usd": "0",
    "archived": false,
    "created": "2026-09-13T09:00:00Z",
    "last_activity": "2026-09-16T11:45:00Z",
    "activity_source": "files",
    "running": false,
    "attention": [],
    "question_detail": {
      "kind": "compare",
      "metric": "intent",
      "bound": null,
      "value": null,
      "variant": null,
      "baseline": "single",
      "candidate": "pair",
      "direction": "higher_is_better",
      "margin": 0.05,
      "relative": false,
      "guardrails": [
        {
          "metric": "schema_valid_first_try",
          "direction": "higher_is_better",
          "margin": 0.05,
          "relative": false
        }
      ]
    },
    "varies": {
      "what": "flow",
      "nodes": [
        "ballots"
      ]
    },
    "slots": [
      {
        "node_id": "ballots",
        "kind": "call",
        "written": "single",
        "files": [
          {
            "role": "node",
            "path": "experiments/intent_ballot_pair/flows/intent_decision/nodes/ballots/ballots.node.yaml"
          }
        ]
      }
    ],
    "agents": [],
    "flows": [
      {
        "flow_id": "intent_decision",
        "description": "The intent of a case from one slot: the ballots node calls the ballot pattern a variant picks, one ballot as written",
        "file": "experiments/intent_ballot_pair/flows/intent_decision/flow.yaml",
        "steps": [
          {
            "node_id": "ballots",
            "kind": "call",
            "agent": null,
            "description": "The slot of the experiment: calls a ballot pattern with the whole case, as written the single ballot"
          }
        ]
      },
      {
        "flow_id": "pair",
        "description": "The case intent from two ballots: the product's own normalization and parsing, a ballot on the customer's words, a ballot on the evidence, and the more confident of the two",
        "file": "experiments/intent_ballot_pair/flows/pair/flow.yaml",
        "steps": [
          {
            "node_id": "prepare",
            "kind": "code",
            "agent": null,
            "description": "The support flow's own normalization: case text, channel, category signals, marketplace intake fields and voting perspectives"
          },
          {
            "node_id": "triage",
            "kind": "llm",
            "agent": {
              "agent_id": "gemini",
              "model": "openrouter:google/gemini-2.5-flash-lite"
            },
            "description": "The support flow's triage: the summary, the category, observations against the signals and the safety risk"
          },
          {
            "node_id": "words",
            "kind": "llm",
            "agent": {
              "agent_id": "llama",
              "model": "openrouter:meta-llama/llama-3.1-8b-instruct"
            },
            "description": "An intent ballot that reads first how the customer put the problem and what they ask for"
          },
          {
            "node_id": "evidence",
            "kind": "llm",
            "agent": {
              "agent_id": "llama",
              "model": "openrouter:meta-llama/llama-3.1-8b-instruct"
            },
            "description": "An intent ballot that reads first what the observations confirm, not what the customer says"
          },
          {
            "node_id": "settle",
            "kind": "code",
            "agent": null,
            "description": "Keeps the more confident of the two ballots; when they agree, that is their shared intent"
          }
        ]
      },
      {
        "flow_id": "single",
        "description": "The case intent from one ballot: the product's own normalization and attachment parsing, then a single cheap ballot with no perspective",
        "file": "experiments/intent_ballot_pair/flows/single/flow.yaml",
        "steps": [
          {
            "node_id": "prepare",
            "kind": "code",
            "agent": null,
            "description": "The support flow's own normalization: case text, channel, category signals, marketplace intake fields and voting perspectives"
          },
          {
            "node_id": "triage",
            "kind": "llm",
            "agent": {
              "agent_id": "gemini",
              "model": "openrouter:google/gemini-2.5-flash-lite"
            },
            "description": "The support flow's triage: the summary, the category, observations against the signals and the safety risk"
          },
          {
            "node_id": "ballot",
            "kind": "llm",
            "agent": {
              "agent_id": "llama",
              "model": "openrouter:meta-llama/llama-3.1-8b-instruct"
            },
            "description": "One intent ballot from the cheap open model, with no perspective set"
          }
        ]
      }
    ],
    "alternatives": [],
    "prompts": [],
    "cases": {
      "dataset_id": "long_customer_messages",
      "flow_id": null,
      "tags": {},
      "selected": 12,
      "total": 12,
      "splits": {
        "dev": 6,
        "holdout": 6
      }
    },
    "variant_details": [
      {
        "variant_id": "single",
        "role": "baseline",
        "changes": [],
        "assignments": []
      },
      {
        "variant_id": "pair",
        "role": "candidate",
        "changes": [
          {
            "node_id": "ballots",
            "what": "flow",
            "value": "pair"
          }
        ],
        "assignments": []
      }
    ],
    "checks": [
      {
        "check_id": "intent",
        "kind": "binary",
        "source": {
          "kind": "builtin",
          "use": "expected",
          "fields": [
            "intent"
          ],
          "ref": null,
          "inference": null,
          "agent": null,
          "validated_by": null
        }
      }
    ],
    "metrics": [
      {
        "metric": "intent",
        "role": "primary",
        "direction": "higher_is_better",
        "unit": "rate",
        "margin": 0.05,
        "relative": false
      },
      {
        "metric": "schema_valid_first_try",
        "role": "guardrail",
        "direction": "higher_is_better",
        "unit": "rate",
        "margin": 0.05,
        "relative": false
      },
      {
        "metric": "success_rate",
        "role": "builtin",
        "direction": "higher_is_better",
        "unit": "rate",
        "margin": null,
        "relative": false
      },
      {
        "metric": "cost_usd",
        "role": "builtin",
        "direction": "lower_is_better",
        "unit": "usd",
        "margin": null,
        "relative": false
      },
      {
        "metric": "cost_of_pass",
        "role": "builtin",
        "direction": "lower_is_better",
        "unit": "usd",
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
        "metric": "latency_p95_ms",
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
    "plan": {
      "cases": 12,
      "repeats": 3
    },
    "notes": "# One ballot or a pair of ballots\n\n**Purpose:** choosing a pattern for a step (two flows compared in one slot).\n\nIn `support_case`, three cheap ballots vote on the intent. A cheaper design is one ballot; a sturdier one is two\nballots that read the case from opposite sides, the customer's words and the evidence, with the more confident one\nkept. The hypothesis is that the pair gets the intent of a long message right more often than one ballot, without\nmore outputs failing their schema on the first try.\n\n**Subject.** The local flow `intent_decision` (`flows/intent_decision/`) is a slot: one `call` node, `ballots`, that\npasses the whole case on and returns the `IntentBallot` it gets back. As written it calls the local flow `single`.\n\n**Variants.** The factor is the flow called at the slot (`varies: what: flow, nodes: [ballots]`).\n\n| Variant | `ballots` calls | Steps |\n|---|---|---|\n| `single` | `single` (as written) | the product's `prepare` and `triage`, then one `ballot` with no perspective |\n| `pair` | `pair` | the same `prepare` and `triage`, a `words` and an `evidence` ballot, then `settle` keeps the more confident |\n\nBoth flows take a `CaseRequest` and return an `IntentBallot`, the contract a flow factor checks, and both ballots run\non the `llama` agent, so the only difference is the pattern. A pair on another agent is a second factor: compare\nagents in their own experiment once the pattern is chosen.\n\n**Checks.** `intent` is the built-in `expected` check on the intent a support lead assigned in\n`long_customer_messages`.\n\n**Reading the result.** `pair` has to beat `single` on `intent` by more than 0.05, and `schema_valid_first_try` may drop\nby at most 0.05: the pair makes two calls, and each can fail its schema.\n",
    "files": {
      "spec": "experiments/intent_ballot_pair/experiment.yaml",
      "notes": "experiments/intent_ballot_pair/experiment.md"
    }
  },
  {
    "experiment_id": "intent_escalation_agents",
    "description": "Qwen as the escalation agent decides the support lead's intent at most 0.1 less often than DeepSeek on the recorded triage, with no more invalid first outputs and at most 25% slower at p95",
    "flow_id": "support_case",
    "subject": {
      "kind": "range",
      "flow_id": "escalation",
      "local_flow": true,
      "from_node": "escalate",
      "to_node": "escalate"
    },
    "failure_mode": "intent_misread",
    "question": "noninferior",
    "variants": [
      "deepseek",
      "qwen",
      "gpt"
    ],
    "baseline": "deepseek",
    "candidate": "qwen",
    "latest": null,
    "series_count": 0,
    "spent_usd": "0",
    "archived": false,
    "created": "2026-09-13T09:30:00Z",
    "last_activity": "2026-09-17T08:10:00Z",
    "activity_source": "files",
    "running": false,
    "attention": [],
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
    "varies": {
      "what": "agent",
      "nodes": [
        "escalate"
      ]
    },
    "slots": [
      {
        "node_id": "escalate",
        "kind": "llm",
        "written": "deepseek",
        "files": [
          {
            "role": "node",
            "path": "experiments/intent_escalation_agents/flows/escalation/nodes/escalate/escalate.node.yaml"
          },
          {
            "role": "inference",
            "path": "flows/support_case/nodes/vote/ballot.inference.yaml"
          },
          {
            "role": "prompt",
            "path": "flows/support_case/nodes/vote/ballot.prompt.md"
          }
        ]
      }
    ],
    "agents": [
      {
        "agent_id": "deepseek",
        "file": "agents/deepseek.yaml",
        "spec": {
          "apiVersion": "aqven/v1",
          "kind": "Agent",
          "description": "Intent cascade escalation, DeepSeek-family panel judge and the reply critic in experiments",
          "model": "openrouter:deepseek/deepseek-v4-flash-0731",
          "fallback_models": null,
          "settings": {
            "temperature": 0.0,
            "top_p": null,
            "max_tokens": 1500,
            "seed": null,
            "provider_options": null
          },
          "output": {
            "mode": "prompted",
            "strict": false,
            "retries": 1,
            "on_error": "retry",
            "on_refusal": "fail",
            "on_truncated": "fail"
          },
          "instructions": null,
          "tools": null,
          "mcp_servers": null,
          "subagents": null,
          "approval": null,
          "limits": null
        },
        "instructions": null
      },
      {
        "agent_id": "qwen",
        "file": "agents/qwen.yaml",
        "spec": {
          "apiVersion": "aqven/v1",
          "kind": "Agent",
          "description": "Qwen-family panel judge",
          "model": "openrouter:qwen/qwen3-30b-a3b-instruct-2507",
          "fallback_models": null,
          "settings": {
            "temperature": 0.0,
            "top_p": null,
            "max_tokens": 1500,
            "seed": null,
            "provider_options": null
          },
          "output": {
            "mode": "tool",
            "strict": false,
            "retries": 1,
            "on_error": "retry",
            "on_refusal": "fail",
            "on_truncated": "fail"
          },
          "instructions": null,
          "tools": null,
          "mcp_servers": null,
          "subagents": null,
          "approval": null,
          "limits": null
        },
        "instructions": null
      },
      {
        "agent_id": "gpt",
        "file": "agents/gpt.yaml",
        "spec": {
          "apiVersion": "aqven/v1",
          "kind": "Agent",
          "description": "OpenAI-family reply author: draft, revision from critique and the judge panel tie-break",
          "model": "openrouter:openai/gpt-oss-20b",
          "fallback_models": null,
          "settings": {
            "temperature": 0.3,
            "top_p": null,
            "max_tokens": 6000,
            "seed": null,
            "provider_options": null
          },
          "output": {
            "mode": "prompted",
            "strict": false,
            "retries": 4,
            "on_error": "retry",
            "on_refusal": "fail",
            "on_truncated": "fail"
          },
          "instructions": null,
          "tools": null,
          "mcp_servers": null,
          "subagents": null,
          "approval": null,
          "limits": null
        },
        "instructions": null
      }
    ],
    "flows": [
      {
        "flow_id": "escalation",
        "description": "The escalation path of the intent cascade: the product's normalization and attachment parsing, then the strong model that decides the intent when the cheap ballots split",
        "file": "experiments/intent_escalation_agents/flows/escalation/flow.yaml",
        "steps": [
          {
            "node_id": "prepare",
            "kind": "code",
            "agent": null,
            "description": "The support flow's own normalization: case text, channel, category signals, marketplace intake fields and voting perspectives"
          },
          {
            "node_id": "triage",
            "kind": "llm",
            "agent": {
              "agent_id": "gemini",
              "model": "openrouter:google/gemini-2.5-flash-lite"
            },
            "description": "The support flow's triage: the summary, the category, observations against the signals and the safety risk"
          },
          {
            "node_id": "escalate",
            "kind": "llm",
            "agent": {
              "agent_id": "deepseek",
              "model": "openrouter:deepseek/deepseek-v4-flash-0731"
            },
            "description": "The cascade's escalation step: a stronger model decides the intent from the triage alone, with no perspective set"
          }
        ]
      }
    ],
    "alternatives": [],
    "prompts": [],
    "cases": {
      "dataset_id": "support_case_cases",
      "flow_id": "support_case",
      "tags": {},
      "selected": 12,
      "total": 12,
      "splits": {
        "dev": 6,
        "holdout": 6
      }
    },
    "variant_details": [
      {
        "variant_id": "deepseek",
        "role": "baseline",
        "changes": [],
        "assignments": [
          {
            "node_id": "escalate",
            "agent": {
              "agent_id": "deepseek",
              "model": "openrouter:deepseek/deepseek-v4-flash-0731"
            },
            "overridden": false
          }
        ]
      },
      {
        "variant_id": "qwen",
        "role": "candidate",
        "changes": [
          {
            "node_id": "escalate",
            "what": "agent",
            "value": "qwen"
          }
        ],
        "assignments": [
          {
            "node_id": "escalate",
            "agent": {
              "agent_id": "qwen",
              "model": "openrouter:qwen/qwen3-30b-a3b-instruct-2507"
            },
            "overridden": true
          }
        ]
      },
      {
        "variant_id": "gpt",
        "role": "other",
        "changes": [
          {
            "node_id": "escalate",
            "what": "agent",
            "value": "gpt"
          }
        ],
        "assignments": [
          {
            "node_id": "escalate",
            "agent": {
              "agent_id": "gpt",
              "model": "openrouter:openai/gpt-oss-20b"
            },
            "overridden": true
          }
        ]
      }
    ],
    "checks": [
      {
        "check_id": "intent",
        "kind": "binary",
        "source": {
          "kind": "builtin",
          "use": "expected",
          "fields": [
            "intent"
          ],
          "ref": null,
          "inference": null,
          "agent": null,
          "validated_by": null
        }
      }
    ],
    "metrics": [
      {
        "metric": "intent",
        "role": "primary",
        "direction": "higher_is_better",
        "unit": "rate",
        "margin": 0.1,
        "relative": false
      },
      {
        "metric": "schema_valid_first_try",
        "role": "guardrail",
        "direction": "higher_is_better",
        "unit": "rate",
        "margin": 0.05,
        "relative": false
      },
      {
        "metric": "latency_p95_ms",
        "role": "guardrail",
        "direction": "lower_is_better",
        "unit": "ms",
        "margin": 0.25,
        "relative": true
      },
      {
        "metric": "success_rate",
        "role": "builtin",
        "direction": "higher_is_better",
        "unit": "rate",
        "margin": null,
        "relative": false
      },
      {
        "metric": "cost_usd",
        "role": "builtin",
        "direction": "lower_is_better",
        "unit": "usd",
        "margin": null,
        "relative": false
      },
      {
        "metric": "cost_of_pass",
        "role": "builtin",
        "direction": "lower_is_better",
        "unit": "usd",
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
    "plan": {
      "cases": 12,
      "repeats": 3
    },
    "notes": "# Escalation agent of the intent cascade\n\n**Purpose:** choosing an agent (a non-inferiority question on a range of a local flow).\n\nIn `support_case`, three cheap Llama ballots vote on the intent, and when they split, the `intent__escalate` step asks\nDeepSeek to decide. Qwen is a smaller mixture-of-experts model that answers faster and costs less per call. The\nhypothesis is that it can take over the escalation without misreading more cases.\n\n**Subject.** The local flow `escalation` (`flows/escalation/`) is the escalation path on its own: the product's `prepare` and `triage` steps, then\n`escalate`, the project's `ballot` inference with no perspective and the `deepseek` agent. It is a complete flow,\nso it can run on fresh cases too. Here the range `escalate`..`escalate` runs only the last step: `prepare` and\n`triage` come from the `node_outputs` recorded in `support_case_cases`. Every variant reads the same triage, the\nGemini parsing is not paid again on every attempt, and any difference comes from the escalation agent.\n\n**Cases.** All twelve cases of `support_case_cases`. `expected_output.intent` is the intent a support lead assigned by\nthe rubric in `fragments/intent_rubric.md`: six defects, two delivery problems and four questions. Two of them are\nhard on purpose: in `dimmer_buzz_advice` the customer claims a defect that the decision later turns into advice, and in\n`nova_runtime_advice` the customer asks whether the battery is faulty without claiming it is.\n\n**Variants.** The factor is the agent on `escalate` (`varies: what: agent`). `deepseek` is the flow as written, `qwen`\nputs the Qwen agent on `escalate`, and `gpt` is measured on the same cases for the Pareto view; the verdict compares\nonly `deepseek` and `qwen`.\n\n**Reading the result.** `qwen` passes when its `intent` pass rate is at most 0.1 below DeepSeek's. Two guardrails\nkeep the switch honest:\n\n- `schema_valid_first_try` may drop by at most 0.05, absolute: Qwen answers in the tool output mode, DeepSeek in the\n  prompted mode, and a retry costs the latency the switch is meant to save.\n- `latency_p95_ms` may grow by at most 25% of DeepSeek's value: the escalation sits on the critical path of a case.\n\n**Caveat.** The escalation only runs on cases where the ballots split, and those are harder than the average case.\nAll twelve cases run here, so a pass says the agent is good enough on a mixed set. Before switching, re-run it on\nthe split cases once the series records which ones they are.\n",
    "files": {
      "spec": "experiments/intent_escalation_agents/experiment.yaml",
      "notes": "experiments/intent_escalation_agents/experiment.md"
    }
  },
  {
    "experiment_id": "intent_split_long_messages",
    "description": "Condensing a long customer message before deciding the intent beats deciding it from the whole message, at most 50% dearer per correct intent",
    "flow_id": null,
    "subject": {
      "kind": "flow",
      "flow_id": "message_intent",
      "local_flow": true,
      "from_node": null,
      "to_node": null
    },
    "failure_mode": "intent_misread",
    "question": "compare",
    "variants": [
      "one_step",
      "two_step"
    ],
    "baseline": "one_step",
    "candidate": "two_step",
    "latest": null,
    "series_count": 0,
    "spent_usd": "0",
    "archived": false,
    "created": "2026-09-11T15:00:00Z",
    "last_activity": "2026-09-15T10:00:00Z",
    "activity_source": "files",
    "running": false,
    "attention": [],
    "question_detail": {
      "kind": "compare",
      "metric": "intent",
      "bound": null,
      "value": null,
      "variant": null,
      "baseline": "one_step",
      "candidate": "two_step",
      "direction": "higher_is_better",
      "margin": 0.05,
      "relative": false,
      "guardrails": [
        {
          "metric": "cost_of_pass",
          "direction": "lower_is_better",
          "margin": 0.5,
          "relative": true
        }
      ]
    },
    "varies": {
      "what": "flow",
      "nodes": [
        "classify"
      ]
    },
    "slots": [
      {
        "node_id": "classify",
        "kind": "call",
        "written": "one_step",
        "files": [
          {
            "role": "node",
            "path": "experiments/intent_split_long_messages/flows/message_intent/nodes/classify/classify.node.yaml"
          }
        ]
      }
    ],
    "agents": [],
    "flows": [
      {
        "flow_id": "message_intent",
        "description": "The intent of a case from one slot: the classify node calls the reading pattern a variant picks, one step as written",
        "file": "experiments/intent_split_long_messages/flows/message_intent/flow.yaml",
        "steps": [
          {
            "node_id": "classify",
            "kind": "call",
            "agent": null,
            "description": "The slot of the experiment: calls a reading pattern with the whole case, as written the one-step classifier"
          }
        ]
      },
      {
        "flow_id": "one_step",
        "description": "The case intent straight from the customer's message, in one call to a cheap open model",
        "file": "experiments/intent_split_long_messages/flows/one_step/flow.yaml",
        "steps": [
          {
            "node_id": "classify_message",
            "kind": "llm",
            "agent": {
              "agent_id": "llama",
              "model": "openrouter:meta-llama/llama-3.1-8b-instruct"
            },
            "description": "A cheap open model reads the whole message and decides the intent"
          }
        ]
      },
      {
        "flow_id": "two_step",
        "description": "The case intent in two calls to a cheap open model: the message is condensed to what the customer needs first, then the intent is decided from that summary",
        "file": "experiments/intent_split_long_messages/flows/two_step/flow.yaml",
        "steps": [
          {
            "node_id": "condense_message",
            "kind": "llm",
            "agent": {
              "agent_id": "llama",
              "model": "openrouter:meta-llama/llama-3.1-8b-instruct"
            },
            "description": "A cheap open model condenses a long message to the request and the facts behind it"
          },
          {
            "node_id": "classify_summary",
            "kind": "llm",
            "agent": {
              "agent_id": "llama",
              "model": "openrouter:meta-llama/llama-3.1-8b-instruct"
            },
            "description": "The same cheap open model decides the intent from the condensed summary"
          }
        ]
      }
    ],
    "alternatives": [],
    "prompts": [],
    "cases": {
      "dataset_id": "long_customer_messages",
      "flow_id": null,
      "tags": {},
      "selected": 12,
      "total": 12,
      "splits": {
        "dev": 6,
        "holdout": 6
      }
    },
    "variant_details": [
      {
        "variant_id": "one_step",
        "role": "baseline",
        "changes": [],
        "assignments": []
      },
      {
        "variant_id": "two_step",
        "role": "candidate",
        "changes": [
          {
            "node_id": "classify",
            "what": "flow",
            "value": "two_step"
          }
        ],
        "assignments": []
      }
    ],
    "checks": [
      {
        "check_id": "intent",
        "kind": "binary",
        "source": {
          "kind": "builtin",
          "use": "expected",
          "fields": [
            "intent"
          ],
          "ref": null,
          "inference": null,
          "agent": null,
          "validated_by": null
        }
      }
    ],
    "metrics": [
      {
        "metric": "intent",
        "role": "primary",
        "direction": "higher_is_better",
        "unit": "rate",
        "margin": 0.05,
        "relative": false
      },
      {
        "metric": "cost_of_pass",
        "role": "guardrail",
        "direction": "lower_is_better",
        "unit": "usd",
        "margin": 0.5,
        "relative": true
      },
      {
        "metric": "success_rate",
        "role": "builtin",
        "direction": "higher_is_better",
        "unit": "rate",
        "margin": null,
        "relative": false
      },
      {
        "metric": "cost_usd",
        "role": "builtin",
        "direction": "lower_is_better",
        "unit": "usd",
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
        "metric": "latency_p95_ms",
        "role": "builtin",
        "direction": "lower_is_better",
        "unit": "ms",
        "margin": null,
        "relative": false
      },
      {
        "metric": "schema_valid_first_try",
        "role": "builtin",
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
    "plan": {
      "cases": 12,
      "repeats": 3
    },
    "notes": "# Condense first, then classify\n\n**Purpose:** checking a risky hypothesis before building it into the flow (two flows compared in one slot).\n\nLong customer messages often open with something other than the request: a late parcel that did arrive, praise, a\nside question about colours. A cheap model reading the whole message tends to classify the opening topic. The\nhypothesis is that condensing the message to \"what the customer needs now\" first, and classifying that summary,\ngets the intent right more often.\n\n**Subject.** The local flow `message_intent` (`flows/message_intent/`) is a slot: one `call` node, `classify`, that\npasses the whole case on and returns the `IntentBallot` it gets back. As written it calls the local flow `one_step`.\n\n**Variants.** The factor is the flow called at the slot (`varies: what: flow, nodes: [classify]`). Both flows take a\n`CaseRequest` and return an `IntentBallot`, as a flow factor requires, and both use the cheap `llama` agent, so the only\ndifference is the structure.\n\n| Variant | `classify` calls | Steps |\n|---|---|---|\n| `one_step` | `one_step` (as written) | `classify_message` reads the whole message |\n| `two_step` | `two_step` | `condense_message` writes a summary of at most 600 characters, `classify_summary` decides from it |\n\nBoth classifiers share the intent rubric in `fragments/intent_rubric.md`.\n\n**Cases.** `long_customer_messages` holds twelve long messages, four per intent, each with the intent a support lead\nassigned (`expected_output.intent`). The tags are:\n\n- `length`: `long` is about 150 words, `very_long` is about 250.\n- `intent`: the expected intent.\n- `opens_with`: the topic the message leads with. The interesting cases are the ones where it differs from `intent`.\n\n**Reading the result.** `two_step` has to beat `one_step` on the `intent` check by more than 0.05, and a correct intent\nmay cost at most 50% more (`cost_of_pass`), since the split adds a second call. If it wins only on `very_long`, the\nsplit belongs behind a length switch, not on every case.\n\n**Caveat.** Twelve cases can reject a large effect but cannot confirm a small one. Treat a win here as a reason to run\nthe comparison on a larger set, not as a decision.\n",
    "files": {
      "spec": "experiments/intent_split_long_messages/experiment.yaml",
      "notes": "experiments/intent_split_long_messages/experiment.md"
    }
  },
  {
    "experiment_id": "judge_panel_agents",
    "description": "A DeepSeek tie-break picks the expected winner more often than the gpt tie-break, at most 30% dearer per correct pick",
    "flow_id": "judge_panel",
    "subject": {
      "kind": "flow",
      "flow_id": "judge_panel",
      "local_flow": false,
      "from_node": null,
      "to_node": null
    },
    "failure_mode": "panel_wrong_winner",
    "question": "compare",
    "variants": [
      "gpt_tie_break",
      "deepseek_tie_break"
    ],
    "baseline": "gpt_tie_break",
    "candidate": "deepseek_tie_break",
    "latest": null,
    "series_count": 0,
    "spent_usd": "0",
    "archived": false,
    "created": "2026-09-10T12:00:00Z",
    "last_activity": "2026-09-16T09:30:00Z",
    "activity_source": "files",
    "running": false,
    "attention": [],
    "question_detail": {
      "kind": "compare",
      "metric": "winner",
      "bound": null,
      "value": null,
      "variant": null,
      "baseline": "gpt_tie_break",
      "candidate": "deepseek_tie_break",
      "direction": "higher_is_better",
      "margin": 0.05,
      "relative": false,
      "guardrails": [
        {
          "metric": "cost_of_pass",
          "direction": "lower_is_better",
          "margin": 0.3,
          "relative": true
        },
        {
          "metric": "latency_p95_ms",
          "direction": "lower_is_better",
          "margin": 0.5,
          "relative": true
        }
      ]
    },
    "varies": {
      "what": "agent",
      "nodes": [
        "tie_break"
      ]
    },
    "slots": [
      {
        "node_id": "tie_break",
        "kind": "llm",
        "written": "gpt",
        "files": [
          {
            "role": "node",
            "path": "flows/judge_panel/nodes/decide/tie_break.node.yaml"
          },
          {
            "role": "inference",
            "path": "flows/judge_panel/nodes/decide/tie_break.inference.yaml"
          },
          {
            "role": "prompt",
            "path": "flows/judge_panel/nodes/decide/tie_break.prompt.md"
          }
        ]
      }
    ],
    "agents": [
      {
        "agent_id": "gpt",
        "file": "agents/gpt.yaml",
        "spec": {
          "apiVersion": "aqven/v1",
          "kind": "Agent",
          "description": "OpenAI-family reply author: draft, revision from critique and the judge panel tie-break",
          "model": "openrouter:openai/gpt-oss-20b",
          "fallback_models": null,
          "settings": {
            "temperature": 0.3,
            "top_p": null,
            "max_tokens": 6000,
            "seed": null,
            "provider_options": null
          },
          "output": {
            "mode": "prompted",
            "strict": false,
            "retries": 4,
            "on_error": "retry",
            "on_refusal": "fail",
            "on_truncated": "fail"
          },
          "instructions": null,
          "tools": null,
          "mcp_servers": null,
          "subagents": null,
          "approval": null,
          "limits": null
        },
        "instructions": null
      },
      {
        "agent_id": "deepseek",
        "file": "agents/deepseek.yaml",
        "spec": {
          "apiVersion": "aqven/v1",
          "kind": "Agent",
          "description": "Intent cascade escalation, DeepSeek-family panel judge and the reply critic in experiments",
          "model": "openrouter:deepseek/deepseek-v4-flash-0731",
          "fallback_models": null,
          "settings": {
            "temperature": 0.0,
            "top_p": null,
            "max_tokens": 1500,
            "seed": null,
            "provider_options": null
          },
          "output": {
            "mode": "prompted",
            "strict": false,
            "retries": 1,
            "on_error": "retry",
            "on_refusal": "fail",
            "on_truncated": "fail"
          },
          "instructions": null,
          "tools": null,
          "mcp_servers": null,
          "subagents": null,
          "approval": null,
          "limits": null
        },
        "instructions": null
      }
    ],
    "flows": [],
    "alternatives": [],
    "prompts": [],
    "cases": {
      "dataset_id": "judge_panel_cases",
      "flow_id": "judge_panel",
      "tags": {},
      "selected": 8,
      "total": 8,
      "splits": {
        "dev": 3,
        "holdout": 5
      }
    },
    "variant_details": [
      {
        "variant_id": "gpt_tie_break",
        "role": "baseline",
        "changes": [],
        "assignments": [
          {
            "node_id": "decide__tie_break",
            "agent": {
              "agent_id": "gpt",
              "model": "openrouter:openai/gpt-oss-20b"
            },
            "overridden": false
          },
          {
            "node_id": "judges__deepseek",
            "agent": {
              "agent_id": "deepseek",
              "model": "openrouter:deepseek/deepseek-v4-flash-0731"
            },
            "overridden": false
          },
          {
            "node_id": "judges__llama",
            "agent": {
              "agent_id": "llama",
              "model": "openrouter:meta-llama/llama-3.1-8b-instruct"
            },
            "overridden": false
          },
          {
            "node_id": "judges__qwen",
            "agent": {
              "agent_id": "qwen",
              "model": "openrouter:qwen/qwen3-30b-a3b-instruct-2507"
            },
            "overridden": false
          }
        ]
      },
      {
        "variant_id": "deepseek_tie_break",
        "role": "candidate",
        "changes": [
          {
            "node_id": "tie_break",
            "what": "agent",
            "value": "deepseek"
          }
        ],
        "assignments": [
          {
            "node_id": "decide__tie_break",
            "agent": {
              "agent_id": "deepseek",
              "model": "openrouter:deepseek/deepseek-v4-flash-0731"
            },
            "overridden": true
          },
          {
            "node_id": "judges__deepseek",
            "agent": {
              "agent_id": "deepseek",
              "model": "openrouter:deepseek/deepseek-v4-flash-0731"
            },
            "overridden": false
          },
          {
            "node_id": "judges__llama",
            "agent": {
              "agent_id": "llama",
              "model": "openrouter:meta-llama/llama-3.1-8b-instruct"
            },
            "overridden": false
          },
          {
            "node_id": "judges__qwen",
            "agent": {
              "agent_id": "qwen",
              "model": "openrouter:qwen/qwen3-30b-a3b-instruct-2507"
            },
            "overridden": false
          }
        ]
      }
    ],
    "checks": [
      {
        "check_id": "winner",
        "kind": "binary",
        "source": {
          "kind": "builtin",
          "use": "expected",
          "fields": [
            "winner"
          ],
          "ref": null,
          "inference": null,
          "agent": null,
          "validated_by": null
        }
      }
    ],
    "metrics": [
      {
        "metric": "winner",
        "role": "primary",
        "direction": "higher_is_better",
        "unit": "rate",
        "margin": 0.05,
        "relative": false
      },
      {
        "metric": "cost_of_pass",
        "role": "guardrail",
        "direction": "lower_is_better",
        "unit": "usd",
        "margin": 0.3,
        "relative": true
      },
      {
        "metric": "latency_p95_ms",
        "role": "guardrail",
        "direction": "lower_is_better",
        "unit": "ms",
        "margin": 0.5,
        "relative": true
      },
      {
        "metric": "success_rate",
        "role": "builtin",
        "direction": "higher_is_better",
        "unit": "rate",
        "margin": null,
        "relative": false
      },
      {
        "metric": "cost_usd",
        "role": "builtin",
        "direction": "lower_is_better",
        "unit": "usd",
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
        "metric": "schema_valid_first_try",
        "role": "builtin",
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
    "plan": {
      "cases": 8,
      "repeats": 3
    },
    "notes": "# Tie-break agent of the judge panel\n\n**Purpose:** choosing an agent (a paired comparison).\n\nWhen the three panel judges disagree, `decide__tie_break` settles the dispute. It runs on gpt, which is outside the\npanel. The hypothesis is that DeepSeek, the strongest family on the panel, settles disputes better. The risk is that\na tie-breaker from a family that has already voted sides with its own vote, so this is worth measuring before the\nflow changes.\n\n**Variants.** The factor is the agent on the `tie_break` node (`varies: what: agent`). A nested node is named by its\nown id, so the factor names `tie_break`, not `decide__tie_break`. `gpt_tie_break` is the flow as written,\n`deepseek_tie_break` puts the DeepSeek agent on `tie_break`.\n\n**Cases.** `judge_panel_cases` holds eight panel inputs built from real Lumen cases. Each has three reply candidates\nand a winner that a support lead picked by hand (`expected_output.winner`). The tags are:\n\n- `contest`: `close` when two candidates are both acceptable and one is better on a detail, `clear` when one\n  candidate is plainly right and the others are unsafe or ungrounded. Only close contests tend to reach the tie-break.\n- `winner_position`: where the expected winner sits in the list. A panel that keeps picking the first or the middle\n  candidate shows an order bias.\n- `category`: the product category.\n\n**Check.** `winner` is the built-in `expected` check on the `winner` field. The panel copies the chosen candidate\nverbatim, so exact equality is the right comparison.\n\n**Reading the result.** The candidate has to beat the baseline by more than 0.05 on `winner`. It may cost at most\n30% more per correct pick and be at most 50% slower at p95. Look at the `close` slice first: the `clear` cases rarely\nreach the tie-break and mostly confirm that nothing else changed.\n",
    "files": {
      "spec": "experiments/judge_panel_agents/experiment.yaml",
      "notes": "experiments/judge_panel_agents/experiment.md"
    }
  },
  {
    "experiment_id": "panel_aa_noise",
    "description": "Two identical runs of the judge panel pick the expected winner equally often: the spread between them is the noise floor for every comparison of panel variants",
    "flow_id": "judge_panel",
    "subject": {
      "kind": "flow",
      "flow_id": "judge_panel",
      "local_flow": false,
      "from_node": null,
      "to_node": null
    },
    "failure_mode": null,
    "question": "compare",
    "variants": [
      "run_a",
      "run_b"
    ],
    "baseline": "run_a",
    "candidate": "run_b",
    "latest": null,
    "series_count": 0,
    "spent_usd": "0",
    "archived": false,
    "created": "2026-09-10T12:30:00Z",
    "last_activity": "2026-09-15T14:00:00Z",
    "activity_source": "files",
    "running": false,
    "attention": [],
    "question_detail": {
      "kind": "compare",
      "metric": "matches_expected",
      "bound": null,
      "value": null,
      "variant": null,
      "baseline": "run_a",
      "candidate": "run_b",
      "direction": "higher_is_better",
      "margin": 0,
      "relative": false,
      "guardrails": []
    },
    "varies": {
      "what": "agent",
      "nodes": [
        "tie_break"
      ]
    },
    "slots": [
      {
        "node_id": "tie_break",
        "kind": "llm",
        "written": "gpt",
        "files": [
          {
            "role": "node",
            "path": "flows/judge_panel/nodes/decide/tie_break.node.yaml"
          },
          {
            "role": "inference",
            "path": "flows/judge_panel/nodes/decide/tie_break.inference.yaml"
          },
          {
            "role": "prompt",
            "path": "flows/judge_panel/nodes/decide/tie_break.prompt.md"
          }
        ]
      }
    ],
    "agents": [
      {
        "agent_id": "gpt",
        "file": "agents/gpt.yaml",
        "spec": {
          "apiVersion": "aqven/v1",
          "kind": "Agent",
          "description": "OpenAI-family reply author: draft, revision from critique and the judge panel tie-break",
          "model": "openrouter:openai/gpt-oss-20b",
          "fallback_models": null,
          "settings": {
            "temperature": 0.3,
            "top_p": null,
            "max_tokens": 6000,
            "seed": null,
            "provider_options": null
          },
          "output": {
            "mode": "prompted",
            "strict": false,
            "retries": 4,
            "on_error": "retry",
            "on_refusal": "fail",
            "on_truncated": "fail"
          },
          "instructions": null,
          "tools": null,
          "mcp_servers": null,
          "subagents": null,
          "approval": null,
          "limits": null
        },
        "instructions": null
      }
    ],
    "flows": [],
    "alternatives": [],
    "prompts": [],
    "cases": {
      "dataset_id": "judge_panel_cases",
      "flow_id": "judge_panel",
      "tags": {},
      "selected": 8,
      "total": 8,
      "splits": {
        "dev": 3,
        "holdout": 5
      }
    },
    "variant_details": [
      {
        "variant_id": "run_a",
        "role": "baseline",
        "changes": [],
        "assignments": [
          {
            "node_id": "decide__tie_break",
            "agent": {
              "agent_id": "gpt",
              "model": "openrouter:openai/gpt-oss-20b"
            },
            "overridden": false
          },
          {
            "node_id": "judges__deepseek",
            "agent": {
              "agent_id": "deepseek",
              "model": "openrouter:deepseek/deepseek-v4-flash-0731"
            },
            "overridden": false
          },
          {
            "node_id": "judges__llama",
            "agent": {
              "agent_id": "llama",
              "model": "openrouter:meta-llama/llama-3.1-8b-instruct"
            },
            "overridden": false
          },
          {
            "node_id": "judges__qwen",
            "agent": {
              "agent_id": "qwen",
              "model": "openrouter:qwen/qwen3-30b-a3b-instruct-2507"
            },
            "overridden": false
          }
        ]
      },
      {
        "variant_id": "run_b",
        "role": "candidate",
        "changes": [
          {
            "node_id": "tie_break",
            "what": "agent",
            "value": "gpt"
          }
        ],
        "assignments": [
          {
            "node_id": "decide__tie_break",
            "agent": {
              "agent_id": "gpt",
              "model": "openrouter:openai/gpt-oss-20b"
            },
            "overridden": true
          },
          {
            "node_id": "judges__deepseek",
            "agent": {
              "agent_id": "deepseek",
              "model": "openrouter:deepseek/deepseek-v4-flash-0731"
            },
            "overridden": false
          },
          {
            "node_id": "judges__llama",
            "agent": {
              "agent_id": "llama",
              "model": "openrouter:meta-llama/llama-3.1-8b-instruct"
            },
            "overridden": false
          },
          {
            "node_id": "judges__qwen",
            "agent": {
              "agent_id": "qwen",
              "model": "openrouter:qwen/qwen3-30b-a3b-instruct-2507"
            },
            "overridden": false
          }
        ]
      }
    ],
    "checks": [
      {
        "check_id": "matches_expected",
        "kind": "binary",
        "source": {
          "kind": "builtin",
          "use": "expected",
          "fields": [],
          "ref": null,
          "inference": null,
          "agent": null,
          "validated_by": null
        }
      }
    ],
    "metrics": [
      {
        "metric": "matches_expected",
        "role": "primary",
        "direction": "higher_is_better",
        "unit": "rate",
        "margin": 0,
        "relative": false
      },
      {
        "metric": "success_rate",
        "role": "builtin",
        "direction": "higher_is_better",
        "unit": "rate",
        "margin": null,
        "relative": false
      },
      {
        "metric": "cost_usd",
        "role": "builtin",
        "direction": "lower_is_better",
        "unit": "usd",
        "margin": null,
        "relative": false
      },
      {
        "metric": "cost_of_pass",
        "role": "builtin",
        "direction": "lower_is_better",
        "unit": "usd",
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
        "metric": "latency_p95_ms",
        "role": "builtin",
        "direction": "lower_is_better",
        "unit": "ms",
        "margin": null,
        "relative": false
      },
      {
        "metric": "schema_valid_first_try",
        "role": "builtin",
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
    "plan": {
      "cases": null,
      "repeats": 5
    },
    "notes": "# A/A: how much the panel disagrees with itself\n\n**Purpose:** stability, and the noise floor for comparisons.\n\n`run_a` and `run_b` run the same flow: the project flow `judge_panel` as written, on the same cases, with the same\nagents. Any difference between them is noise: sampling at temperature 0.2 on llama, provider routing, the tie-break\nfiring on one run and not on the other.\n\n**Variants.** Two variants still declare one factor, here the agent on the `tie_break` node. `run_a` is the flow as\nwritten; `run_b` sets `tie_break` to `gpt`, the agent the flow already names. Both variants assemble to the same flow,\nso the pair measures the flow against itself.\n\n**Check.** `matches_expected` is the built-in `expected` check with no `fields`: it compares every field the case lists\nin `expected_output`, which for these cases is only the `winner`.\n\n**Reading the result.** The question is a `compare` with margin 0, so it asks whether `run_b` beats `run_a` at all. The\nexpected outcome is \"not confirmed\". The useful number is the half-width of the confidence interval on the\ndifference: it is the smallest effect `judge_panel_agents` and `panel_single_judge` can tell apart from noise on\nthese eight cases. Five repeats also give the per-case pass^k and the share of cases that flip between repeats. A case\nthat flips is where a variant comparison should not be read case by case.\n\n**When to re-run.** After a change of any panel agent, a provider pin, or the tie-break prompt.\n",
    "files": {
      "spec": "experiments/panel_aa_noise/experiment.yaml",
      "notes": "experiments/panel_aa_noise/experiment.md"
    }
  },
  {
    "experiment_id": "panel_failure_scan",
    "description": "Where the judge panel goes wrong: every case with the winner's grounding, length and privacy, the shape of the verdict, its weakest criterion, cost and time, for the gpt tie-break and a Mistral one",
    "flow_id": "judge_panel",
    "subject": {
      "kind": "flow",
      "flow_id": "judge_panel",
      "local_flow": false,
      "from_node": null,
      "to_node": null
    },
    "failure_mode": null,
    "question": "look",
    "variants": [
      "gpt_tie_break",
      "mistral_tie_break"
    ],
    "baseline": null,
    "candidate": null,
    "latest": null,
    "series_count": 0,
    "spent_usd": "0",
    "archived": true,
    "created": "2026-09-09T08:00:00Z",
    "last_activity": "2026-09-12T08:00:00Z",
    "activity_source": "files",
    "running": false,
    "attention": [],
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
    "varies": {
      "what": "agent",
      "nodes": [
        "tie_break"
      ]
    },
    "slots": [
      {
        "node_id": "tie_break",
        "kind": "llm",
        "written": "gpt",
        "files": [
          {
            "role": "node",
            "path": "flows/judge_panel/nodes/decide/tie_break.node.yaml"
          },
          {
            "role": "inference",
            "path": "flows/judge_panel/nodes/decide/tie_break.inference.yaml"
          },
          {
            "role": "prompt",
            "path": "flows/judge_panel/nodes/decide/tie_break.prompt.md"
          }
        ]
      }
    ],
    "agents": [
      {
        "agent_id": "gpt",
        "file": "agents/gpt.yaml",
        "spec": {
          "apiVersion": "aqven/v1",
          "kind": "Agent",
          "description": "OpenAI-family reply author: draft, revision from critique and the judge panel tie-break",
          "model": "openrouter:openai/gpt-oss-20b",
          "fallback_models": null,
          "settings": {
            "temperature": 0.3,
            "top_p": null,
            "max_tokens": 6000,
            "seed": null,
            "provider_options": null
          },
          "output": {
            "mode": "prompted",
            "strict": false,
            "retries": 4,
            "on_error": "retry",
            "on_refusal": "fail",
            "on_truncated": "fail"
          },
          "instructions": null,
          "tools": null,
          "mcp_servers": null,
          "subagents": null,
          "approval": null,
          "limits": null
        },
        "instructions": null
      },
      {
        "agent_id": "mistral",
        "file": "agents/mistral.yaml",
        "spec": {
          "apiVersion": "aqven/v1",
          "kind": "Agent",
          "description": "Mistral-family model: reply draft and reply critique",
          "model": "openrouter:mistralai/mistral-nemo",
          "fallback_models": null,
          "settings": {
            "temperature": 0.2,
            "top_p": null,
            "max_tokens": 3000,
            "seed": null,
            "provider_options": null
          },
          "output": {
            "mode": "prompted",
            "strict": false,
            "retries": 2,
            "on_error": "retry",
            "on_refusal": "fail",
            "on_truncated": "fail"
          },
          "instructions": null,
          "tools": null,
          "mcp_servers": null,
          "subagents": null,
          "approval": null,
          "limits": null
        },
        "instructions": null
      }
    ],
    "flows": [],
    "alternatives": [],
    "prompts": [],
    "cases": {
      "dataset_id": "judge_panel_cases",
      "flow_id": "judge_panel",
      "tags": {},
      "selected": 8,
      "total": 8,
      "splits": {
        "dev": 3,
        "holdout": 5
      }
    },
    "variant_details": [
      {
        "variant_id": "gpt_tie_break",
        "role": "other",
        "changes": [],
        "assignments": [
          {
            "node_id": "decide__tie_break",
            "agent": {
              "agent_id": "gpt",
              "model": "openrouter:openai/gpt-oss-20b"
            },
            "overridden": false
          },
          {
            "node_id": "judges__deepseek",
            "agent": {
              "agent_id": "deepseek",
              "model": "openrouter:deepseek/deepseek-v4-flash-0731"
            },
            "overridden": false
          },
          {
            "node_id": "judges__llama",
            "agent": {
              "agent_id": "llama",
              "model": "openrouter:meta-llama/llama-3.1-8b-instruct"
            },
            "overridden": false
          },
          {
            "node_id": "judges__qwen",
            "agent": {
              "agent_id": "qwen",
              "model": "openrouter:qwen/qwen3-30b-a3b-instruct-2507"
            },
            "overridden": false
          }
        ]
      },
      {
        "variant_id": "mistral_tie_break",
        "role": "other",
        "changes": [
          {
            "node_id": "tie_break",
            "what": "agent",
            "value": "mistral"
          }
        ],
        "assignments": [
          {
            "node_id": "decide__tie_break",
            "agent": {
              "agent_id": "mistral",
              "model": "openrouter:mistralai/mistral-nemo"
            },
            "overridden": true
          },
          {
            "node_id": "judges__deepseek",
            "agent": {
              "agent_id": "deepseek",
              "model": "openrouter:deepseek/deepseek-v4-flash-0731"
            },
            "overridden": false
          },
          {
            "node_id": "judges__llama",
            "agent": {
              "agent_id": "llama",
              "model": "openrouter:meta-llama/llama-3.1-8b-instruct"
            },
            "overridden": false
          },
          {
            "node_id": "judges__qwen",
            "agent": {
              "agent_id": "qwen",
              "model": "openrouter:qwen/qwen3-30b-a3b-instruct-2507"
            },
            "overridden": false
          }
        ]
      }
    ],
    "checks": [
      {
        "check_id": "quotes_in_chunks",
        "kind": "binary",
        "source": {
          "kind": "builtin",
          "use": "citations_in_sources",
          "fields": [],
          "ref": null,
          "inference": null,
          "agent": null,
          "validated_by": null
        }
      },
      {
        "check_id": "cites_known_chunks",
        "kind": "binary",
        "source": {
          "kind": "builtin",
          "use": "ids_in_allowed_set",
          "fields": [
            "$out.winner.citations[*].chunk_id"
          ],
          "ref": null,
          "inference": null,
          "agent": null,
          "validated_by": null
        }
      },
      {
        "check_id": "winner_within_length",
        "kind": "binary",
        "source": {
          "kind": "builtin",
          "use": "max_words",
          "fields": [
            "$out.winner.text"
          ],
          "ref": null,
          "inference": null,
          "agent": null,
          "validated_by": null
        }
      },
      {
        "check_id": "winner_without_contacts",
        "kind": "binary",
        "source": {
          "kind": "builtin",
          "use": "no_pii",
          "fields": [
            "$out.winner.text"
          ],
          "ref": null,
          "inference": null,
          "agent": null,
          "validated_by": null
        }
      },
      {
        "check_id": "rationale_written",
        "kind": "binary",
        "source": {
          "kind": "builtin",
          "use": "not_empty",
          "fields": [
            "$out.verdict.verdict.rationale"
          ],
          "ref": null,
          "inference": null,
          "agent": null,
          "validated_by": null
        }
      },
      {
        "check_id": "rationale_names_criteria",
        "kind": "binary",
        "source": {
          "kind": "builtin",
          "use": "regex",
          "fields": [
            "$out.verdict.verdict.rationale"
          ],
          "ref": null,
          "inference": null,
          "agent": null,
          "validated_by": null
        }
      },
      {
        "check_id": "one_score_per_criterion",
        "kind": "binary",
        "source": {
          "kind": "builtin",
          "use": "unique_items",
          "fields": [
            "$out.verdict.verdict.scores"
          ],
          "ref": null,
          "inference": null,
          "agent": null,
          "validated_by": null
        }
      },
      {
        "check_id": "weakest_criterion",
        "kind": "ordinal",
        "source": {
          "kind": "code",
          "use": null,
          "fields": [],
          "ref": "lumen.experiments.panel_failure_scan.checks:weakest_criterion",
          "inference": null,
          "agent": null,
          "validated_by": null
        }
      },
      {
        "check_id": "panel_cost",
        "kind": "continuous",
        "source": {
          "kind": "builtin",
          "use": "cost_usd",
          "fields": [],
          "ref": null,
          "inference": null,
          "agent": null,
          "validated_by": null
        }
      },
      {
        "check_id": "panel_latency",
        "kind": "continuous",
        "source": {
          "kind": "builtin",
          "use": "latency_ms",
          "fields": [],
          "ref": null,
          "inference": null,
          "agent": null,
          "validated_by": null
        }
      }
    ],
    "metrics": [
      {
        "metric": "quotes_in_chunks",
        "role": "check",
        "direction": "higher_is_better",
        "unit": "rate",
        "margin": null,
        "relative": false
      },
      {
        "metric": "cites_known_chunks",
        "role": "check",
        "direction": "higher_is_better",
        "unit": "rate",
        "margin": null,
        "relative": false
      },
      {
        "metric": "winner_within_length",
        "role": "check",
        "direction": "higher_is_better",
        "unit": "rate",
        "margin": null,
        "relative": false
      },
      {
        "metric": "winner_without_contacts",
        "role": "check",
        "direction": "higher_is_better",
        "unit": "rate",
        "margin": null,
        "relative": false
      },
      {
        "metric": "rationale_written",
        "role": "check",
        "direction": "higher_is_better",
        "unit": "rate",
        "margin": null,
        "relative": false
      },
      {
        "metric": "rationale_names_criteria",
        "role": "check",
        "direction": "higher_is_better",
        "unit": "rate",
        "margin": null,
        "relative": false
      },
      {
        "metric": "one_score_per_criterion",
        "role": "check",
        "direction": "higher_is_better",
        "unit": "rate",
        "margin": null,
        "relative": false
      },
      {
        "metric": "weakest_criterion",
        "role": "check",
        "direction": "higher_is_better",
        "unit": "ordinal",
        "margin": null,
        "relative": false
      },
      {
        "metric": "panel_cost",
        "role": "check",
        "direction": "higher_is_better",
        "unit": "score",
        "margin": null,
        "relative": false
      },
      {
        "metric": "panel_latency",
        "role": "check",
        "direction": "higher_is_better",
        "unit": "score",
        "margin": null,
        "relative": false
      },
      {
        "metric": "success_rate",
        "role": "builtin",
        "direction": "higher_is_better",
        "unit": "rate",
        "margin": null,
        "relative": false
      },
      {
        "metric": "cost_usd",
        "role": "builtin",
        "direction": "lower_is_better",
        "unit": "usd",
        "margin": null,
        "relative": false
      },
      {
        "metric": "cost_of_pass",
        "role": "builtin",
        "direction": "lower_is_better",
        "unit": "usd",
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
        "metric": "latency_p95_ms",
        "role": "builtin",
        "direction": "lower_is_better",
        "unit": "ms",
        "margin": null,
        "relative": false
      },
      {
        "metric": "schema_valid_first_try",
        "role": "builtin",
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
    "plan": {
      "cases": 8,
      "repeats": 1
    },
    "notes": "# Where the judge panel goes wrong\n\n**Purpose:** exploring failure modes before naming them.\n\nThe panel has no failure mode on record yet besides \"wrong winner\". This experiment runs every panel case once for two\ntie-break agents and puts the detectors side by side, so the failures can be grouped and named before any of them\nbecomes a hypothesis. `failure_mode` stays unset until they are.\n\n**Variants.** The factor is the agent on the `tie_break` node. `gpt_tie_break` is the flow as written.\n`mistral_tie_break` puts the Mistral agent on `tie_break`. Mistral also writes one of the drafts upstream, so this variant shows whether a tie-break from an\nauthor family favours its own style.\n\n**Detectors.** None of them is a verdict; each points at a kind of failure.\n\n| Check | What a failure means |\n|---|---|\n| `quotes_in_chunks` | The panel picked a candidate that quotes text the chunks do not contain. |\n| `cites_known_chunks` | The winner cites a chunk id that is not among the case chunks. |\n| `winner_within_length` | The panel rewarded length: the winner is over the 220-word reply limit. |\n| `winner_without_contacts` | The winner carries an email, a phone or a card number. |\n| `rationale_written` | The verdict has no reasoning to audit. |\n| `rationale_names_criteria` | The reasoning ignores the rubric: grounding, helpfulness, tone. |\n| `one_score_per_criterion` | A criterion is scored twice, so the merged scores are skewed. |\n| `weakest_criterion` | The winner's lowest rubric score, 1 to 5; below 3 the panel settled for a weak reply. |\n| `panel_cost`, `panel_latency` | Cost and time of the attempt, to spot cases that loop through the tie-break. |\n\n**Reading the result.** Sort by the first failing detector and read the traces. Two or three cases failing the same\nway are a named `failure_mode` and the start of a threshold experiment. Eight cases say nothing about rates.\n",
    "files": {
      "spec": "experiments/panel_failure_scan/experiment.yaml",
      "notes": "experiments/panel_failure_scan/experiment.md"
    }
  },
  {
    "experiment_id": "panel_judge_prompt",
    "description": "A judge prompt that checks every claim of a draft against the chunks before scoring makes the three panel judges pick the expected winner more often, at most 25% dearer per correct pick",
    "flow_id": "judge_panel",
    "subject": {
      "kind": "flow",
      "flow_id": "judge_panel",
      "local_flow": false,
      "from_node": null,
      "to_node": null
    },
    "failure_mode": "panel_wrong_winner",
    "question": "compare",
    "variants": [
      "as_written",
      "claims_first",
      "anchored_scale"
    ],
    "baseline": "as_written",
    "candidate": "claims_first",
    "latest": null,
    "series_count": 0,
    "spent_usd": "0",
    "archived": false,
    "created": "2026-09-14T10:00:00Z",
    "last_activity": "2026-09-17T19:30:00Z",
    "activity_source": "files",
    "running": false,
    "attention": [
      "check_errors"
    ],
    "question_detail": {
      "kind": "compare",
      "metric": "winner",
      "bound": null,
      "value": null,
      "variant": null,
      "baseline": "as_written",
      "candidate": "claims_first",
      "direction": "higher_is_better",
      "margin": 0.05,
      "relative": false,
      "guardrails": [
        {
          "metric": "cost_of_pass",
          "direction": "lower_is_better",
          "margin": 0.25,
          "relative": true
        }
      ]
    },
    "varies": {
      "what": "prompt",
      "nodes": [
        "deepseek",
        "qwen",
        "llama"
      ]
    },
    "slots": [
      {
        "node_id": "deepseek",
        "kind": "llm",
        "written": "tie_break",
        "files": [
          {
            "role": "node",
            "path": "flows/judge_panel/nodes/judges/deepseek.node.yaml"
          },
          {
            "role": "inference",
            "path": "flows/judge_panel/nodes/decide/tie_break.inference.yaml"
          },
          {
            "role": "prompt",
            "path": "flows/judge_panel/nodes/decide/tie_break.prompt.md"
          }
        ]
      },
      {
        "node_id": "qwen",
        "kind": "llm",
        "written": "tie_break",
        "files": [
          {
            "role": "node",
            "path": "flows/judge_panel/nodes/judges/qwen.node.yaml"
          },
          {
            "role": "inference",
            "path": "flows/judge_panel/nodes/decide/tie_break.inference.yaml"
          },
          {
            "role": "prompt",
            "path": "flows/judge_panel/nodes/decide/tie_break.prompt.md"
          }
        ]
      },
      {
        "node_id": "llama",
        "kind": "llm",
        "written": "tie_break",
        "files": [
          {
            "role": "node",
            "path": "flows/judge_panel/nodes/judges/llama.node.yaml"
          },
          {
            "role": "inference",
            "path": "flows/judge_panel/nodes/decide/tie_break.inference.yaml"
          },
          {
            "role": "prompt",
            "path": "flows/judge_panel/nodes/decide/tie_break.prompt.md"
          }
        ]
      }
    ],
    "agents": [],
    "flows": [],
    "alternatives": [],
    "prompts": [
      {
        "name": "anchored_scale",
        "file": "experiments/panel_judge_prompt/prompts/anchored_scale.md"
      },
      {
        "name": "claims_first",
        "file": "experiments/panel_judge_prompt/prompts/claims_first.md"
      }
    ],
    "cases": {
      "dataset_id": "judge_panel_cases",
      "flow_id": "judge_panel",
      "tags": {},
      "selected": 8,
      "total": 8,
      "splits": {
        "dev": 3,
        "holdout": 5
      }
    },
    "variant_details": [
      {
        "variant_id": "as_written",
        "role": "baseline",
        "changes": [],
        "assignments": [
          {
            "node_id": "decide__tie_break",
            "agent": {
              "agent_id": "gpt",
              "model": "openrouter:openai/gpt-oss-20b"
            },
            "overridden": false
          },
          {
            "node_id": "judges__deepseek",
            "agent": {
              "agent_id": "deepseek",
              "model": "openrouter:deepseek/deepseek-v4-flash-0731"
            },
            "overridden": false
          },
          {
            "node_id": "judges__llama",
            "agent": {
              "agent_id": "llama",
              "model": "openrouter:meta-llama/llama-3.1-8b-instruct"
            },
            "overridden": false
          },
          {
            "node_id": "judges__qwen",
            "agent": {
              "agent_id": "qwen",
              "model": "openrouter:qwen/qwen3-30b-a3b-instruct-2507"
            },
            "overridden": false
          }
        ]
      },
      {
        "variant_id": "claims_first",
        "role": "candidate",
        "changes": [
          {
            "node_id": "deepseek",
            "what": "prompt",
            "value": "claims_first"
          },
          {
            "node_id": "qwen",
            "what": "prompt",
            "value": "claims_first"
          },
          {
            "node_id": "llama",
            "what": "prompt",
            "value": "claims_first"
          }
        ],
        "assignments": [
          {
            "node_id": "decide__tie_break",
            "agent": {
              "agent_id": "gpt",
              "model": "openrouter:openai/gpt-oss-20b"
            },
            "overridden": false
          },
          {
            "node_id": "judges__deepseek",
            "agent": {
              "agent_id": "deepseek",
              "model": "openrouter:deepseek/deepseek-v4-flash-0731"
            },
            "overridden": false
          },
          {
            "node_id": "judges__llama",
            "agent": {
              "agent_id": "llama",
              "model": "openrouter:meta-llama/llama-3.1-8b-instruct"
            },
            "overridden": false
          },
          {
            "node_id": "judges__qwen",
            "agent": {
              "agent_id": "qwen",
              "model": "openrouter:qwen/qwen3-30b-a3b-instruct-2507"
            },
            "overridden": false
          }
        ]
      },
      {
        "variant_id": "anchored_scale",
        "role": "other",
        "changes": [
          {
            "node_id": "deepseek",
            "what": "prompt",
            "value": "anchored_scale"
          },
          {
            "node_id": "qwen",
            "what": "prompt",
            "value": "anchored_scale"
          },
          {
            "node_id": "llama",
            "what": "prompt",
            "value": "anchored_scale"
          }
        ],
        "assignments": [
          {
            "node_id": "decide__tie_break",
            "agent": {
              "agent_id": "gpt",
              "model": "openrouter:openai/gpt-oss-20b"
            },
            "overridden": false
          },
          {
            "node_id": "judges__deepseek",
            "agent": {
              "agent_id": "deepseek",
              "model": "openrouter:deepseek/deepseek-v4-flash-0731"
            },
            "overridden": false
          },
          {
            "node_id": "judges__llama",
            "agent": {
              "agent_id": "llama",
              "model": "openrouter:meta-llama/llama-3.1-8b-instruct"
            },
            "overridden": false
          },
          {
            "node_id": "judges__qwen",
            "agent": {
              "agent_id": "qwen",
              "model": "openrouter:qwen/qwen3-30b-a3b-instruct-2507"
            },
            "overridden": false
          }
        ]
      }
    ],
    "checks": [
      {
        "check_id": "winner",
        "kind": "binary",
        "source": {
          "kind": "builtin",
          "use": "expected",
          "fields": [
            "winner"
          ],
          "ref": null,
          "inference": null,
          "agent": null,
          "validated_by": null
        }
      },
      {
        "check_id": "winner_quotes_in_chunks",
        "kind": "binary",
        "source": {
          "kind": "builtin",
          "use": "citations_in_sources",
          "fields": [],
          "ref": null,
          "inference": null,
          "agent": null,
          "validated_by": null
        }
      }
    ],
    "metrics": [
      {
        "metric": "winner",
        "role": "primary",
        "direction": "higher_is_better",
        "unit": "rate",
        "margin": 0.05,
        "relative": false
      },
      {
        "metric": "cost_of_pass",
        "role": "guardrail",
        "direction": "lower_is_better",
        "unit": "usd",
        "margin": 0.25,
        "relative": true
      },
      {
        "metric": "winner_quotes_in_chunks",
        "role": "check",
        "direction": "higher_is_better",
        "unit": "rate",
        "margin": null,
        "relative": false
      },
      {
        "metric": "success_rate",
        "role": "builtin",
        "direction": "higher_is_better",
        "unit": "rate",
        "margin": null,
        "relative": false
      },
      {
        "metric": "cost_usd",
        "role": "builtin",
        "direction": "lower_is_better",
        "unit": "usd",
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
        "metric": "latency_p95_ms",
        "role": "builtin",
        "direction": "lower_is_better",
        "unit": "ms",
        "margin": null,
        "relative": false
      },
      {
        "metric": "schema_valid_first_try",
        "role": "builtin",
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
    "plan": {
      "cases": 8,
      "repeats": 3
    },
    "notes": "# The panel judges' prompt\n\n**Purpose:** choosing a prompt for several nodes at once.\n\nThe three panel judges, `deepseek`, `qwen` and `llama` inside `judges`, share the `tie_break` inference and its prompt,\nand so does the tie-break judge in `decide`. The panel's failure mode on record is a wrong winner, and the usual way a\njudge gets there is a well-written draft with an amount or a quote that no chunk supports. The hypothesis is that a\nprompt which makes each judge check the claims of every draft against the chunks before scoring picks the expected\nwinner more often.\n\n**Variants.** The factor is the prompt of the three judges (`varies: what: prompt, nodes: [deepseek, qwen, llama]`). A\nvariant names a file in `prompts/`; the text replaces the prompt of those nodes only, and the inputs, the output schema\nand the checks of `tie_break` stay as they are. The tie-break judge is not in the factor and keeps its prompt, so the\ndispute rule does not change.\n\n| Variant | Judges' prompt |\n|---|---|\n| `as_written` | `flows/judge_panel/nodes/decide/tie_break.prompt.md` |\n| `claims_first` | `prompts/claims_first.md`: every claim and quote checked against the chunks, an unconfirmed claim caps grounding at 2 |\n| `anchored_scale` | `prompts/anchored_scale.md`: fixed anchors for 1, 3 and 5 on each criterion |\n\n`anchored_scale` is measured on the same cases for the Pareto view: fixed anchors should narrow the score spread\nbetween the judges, which the panel's merge reads, but they do not target ungrounded drafts.\n\n**Checks.** The columns of every row:\n\n- `winner`: the built-in `expected` check on the winner a support lead picked.\n- `winner_quotes_in_chunks`: the winner's quotes appear word for word in the chunks it cites. A prompt that checks\n  claims first should raise it.\n\n**Reading the result.** `claims_first` has to beat `as_written` on `winner` by more than 0.05, and a correct pick may\ncost at most 25% more (`cost_of_pass`): a judge that checks claims writes longer reasoning. Read the `contest: close`\nslice first; the clear contests rarely change.\n\n**Caveat.** The prompt goes to three families at once. If one family gains and another loses, the mean hides it: open\nthe traces by judge before you adopt the prompt.\n",
    "files": {
      "spec": "experiments/panel_judge_prompt/experiment.yaml",
      "notes": "experiments/panel_judge_prompt/experiment.md"
    }
  },
  {
    "experiment_id": "panel_merge_rule",
    "description": "Merging the panel by a two-judge majority alone, without the score-spread rule, picks the expected winner at most 0.05 less often than the current merge",
    "flow_id": "judge_panel",
    "subject": {
      "kind": "flow",
      "flow_id": "judge_panel",
      "local_flow": false,
      "from_node": null,
      "to_node": null
    },
    "failure_mode": "panel_wrong_winner",
    "question": "noninferior",
    "variants": [
      "majority_and_spread",
      "majority_only",
      "always_tie_break"
    ],
    "baseline": "majority_and_spread",
    "candidate": "majority_only",
    "latest": null,
    "series_count": 0,
    "spent_usd": "0",
    "archived": false,
    "created": "2026-09-18T03:00:00Z",
    "last_activity": "2026-09-18T03:00:00Z",
    "activity_source": "files",
    "running": false,
    "attention": [],
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
    "varies": {
      "what": "use",
      "nodes": [
        "aggregate"
      ]
    },
    "slots": [
      {
        "node_id": "aggregate",
        "kind": "code",
        "written": "aggregate",
        "files": [
          {
            "role": "node",
            "path": "flows/judge_panel/nodes/aggregate/aggregate.node.yaml"
          },
          {
            "role": "code",
            "path": "flows/judge_panel/nodes/aggregate/aggregate.py"
          }
        ]
      }
    ],
    "agents": [],
    "flows": [],
    "alternatives": [
      {
        "alternative_id": "always_tie_break",
        "kind": "code",
        "description": "Never merges the verdicts: every case goes to the tie-break judge with the three verdicts in view, and the spread is kept for the panel result",
        "file": "experiments/panel_merge_rule/nodes/always_tie_break/always_tie_break.node.yaml",
        "files": [
          {
            "role": "node",
            "path": "experiments/panel_merge_rule/nodes/always_tie_break/always_tie_break.node.yaml"
          },
          {
            "role": "code",
            "path": "experiments/panel_merge_rule/nodes/always_tie_break/always_tie_break.py"
          }
        ]
      },
      {
        "alternative_id": "majority_only",
        "kind": "code",
        "description": "Merges the verdicts by majority alone: two judges on the same candidate agree however far apart their scores are, and only a three-way split goes to the tie-break",
        "file": "experiments/panel_merge_rule/nodes/majority_only/majority_only.node.yaml",
        "files": [
          {
            "role": "node",
            "path": "experiments/panel_merge_rule/nodes/majority_only/majority_only.node.yaml"
          },
          {
            "role": "code",
            "path": "experiments/panel_merge_rule/nodes/majority_only/majority_only.py"
          }
        ]
      }
    ],
    "prompts": [],
    "cases": {
      "dataset_id": "judge_panel_cases",
      "flow_id": "judge_panel",
      "tags": {},
      "selected": 8,
      "total": 8,
      "splits": {
        "dev": 3,
        "holdout": 5
      }
    },
    "variant_details": [
      {
        "variant_id": "majority_and_spread",
        "role": "baseline",
        "changes": [],
        "assignments": [
          {
            "node_id": "decide__tie_break",
            "agent": {
              "agent_id": "gpt",
              "model": "openrouter:openai/gpt-oss-20b"
            },
            "overridden": false
          },
          {
            "node_id": "judges__deepseek",
            "agent": {
              "agent_id": "deepseek",
              "model": "openrouter:deepseek/deepseek-v4-flash-0731"
            },
            "overridden": false
          },
          {
            "node_id": "judges__llama",
            "agent": {
              "agent_id": "llama",
              "model": "openrouter:meta-llama/llama-3.1-8b-instruct"
            },
            "overridden": false
          },
          {
            "node_id": "judges__qwen",
            "agent": {
              "agent_id": "qwen",
              "model": "openrouter:qwen/qwen3-30b-a3b-instruct-2507"
            },
            "overridden": false
          }
        ]
      },
      {
        "variant_id": "majority_only",
        "role": "candidate",
        "changes": [
          {
            "node_id": "aggregate",
            "what": "use",
            "value": "majority_only"
          }
        ],
        "assignments": [
          {
            "node_id": "decide__tie_break",
            "agent": {
              "agent_id": "gpt",
              "model": "openrouter:openai/gpt-oss-20b"
            },
            "overridden": false
          },
          {
            "node_id": "judges__deepseek",
            "agent": {
              "agent_id": "deepseek",
              "model": "openrouter:deepseek/deepseek-v4-flash-0731"
            },
            "overridden": false
          },
          {
            "node_id": "judges__llama",
            "agent": {
              "agent_id": "llama",
              "model": "openrouter:meta-llama/llama-3.1-8b-instruct"
            },
            "overridden": false
          },
          {
            "node_id": "judges__qwen",
            "agent": {
              "agent_id": "qwen",
              "model": "openrouter:qwen/qwen3-30b-a3b-instruct-2507"
            },
            "overridden": false
          }
        ]
      },
      {
        "variant_id": "always_tie_break",
        "role": "other",
        "changes": [
          {
            "node_id": "aggregate",
            "what": "use",
            "value": "always_tie_break"
          }
        ],
        "assignments": [
          {
            "node_id": "decide__tie_break",
            "agent": {
              "agent_id": "gpt",
              "model": "openrouter:openai/gpt-oss-20b"
            },
            "overridden": false
          },
          {
            "node_id": "judges__deepseek",
            "agent": {
              "agent_id": "deepseek",
              "model": "openrouter:deepseek/deepseek-v4-flash-0731"
            },
            "overridden": false
          },
          {
            "node_id": "judges__llama",
            "agent": {
              "agent_id": "llama",
              "model": "openrouter:meta-llama/llama-3.1-8b-instruct"
            },
            "overridden": false
          },
          {
            "node_id": "judges__qwen",
            "agent": {
              "agent_id": "qwen",
              "model": "openrouter:qwen/qwen3-30b-a3b-instruct-2507"
            },
            "overridden": false
          }
        ]
      }
    ],
    "checks": [
      {
        "check_id": "winner",
        "kind": "binary",
        "source": {
          "kind": "builtin",
          "use": "expected",
          "fields": [
            "winner"
          ],
          "ref": null,
          "inference": null,
          "agent": null,
          "validated_by": null
        }
      },
      {
        "check_id": "settled_by_panel",
        "kind": "binary",
        "source": {
          "kind": "code",
          "use": null,
          "fields": [],
          "ref": "lumen.experiments.panel_merge_rule.checks:settled_by_panel",
          "inference": null,
          "agent": null,
          "validated_by": null
        }
      }
    ],
    "metrics": [
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
        "metric": "success_rate",
        "role": "builtin",
        "direction": "higher_is_better",
        "unit": "rate",
        "margin": null,
        "relative": false
      },
      {
        "metric": "cost_usd",
        "role": "builtin",
        "direction": "lower_is_better",
        "unit": "usd",
        "margin": null,
        "relative": false
      },
      {
        "metric": "cost_of_pass",
        "role": "builtin",
        "direction": "lower_is_better",
        "unit": "usd",
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
        "metric": "latency_p95_ms",
        "role": "builtin",
        "direction": "lower_is_better",
        "unit": "ms",
        "margin": null,
        "relative": false
      },
      {
        "metric": "schema_valid_first_try",
        "role": "builtin",
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
    "plan": {
      "cases": 8,
      "repeats": 3
    },
    "notes": "# How the panel merges its verdicts\n\n**Purpose:** choosing an algorithm for a code step.\n\nThe `aggregate` step of `judge_panel` turns three verdicts into one. As written, the panel agrees when two judges pick\nthe same candidate and their scores on every criterion are at most 2 apart; otherwise the `decide` switch calls the\ntie-break judge. The spread rule sends close contests to the tie-break, which costs a call and time. The hypothesis is\nthat a majority alone picks the right winner just as often.\n\n**Variants.** The ways of merging are the variants, not checks: each is an alternative node in `nodes/` that takes the\nplace of `aggregate` (`varies: what: use, nodes: [aggregate]`). An alternative runs under the id of its slot, so\n`decide` and `pick` still read `$aggregate.out`, and the compiler checks the alternative against those bindings.\n\n| Variant | `aggregate` runs | When the tie-break runs |\n|---|---|---|\n| `majority_and_spread` | the node as written | no majority, or scores more than 2 apart |\n| `majority_only` | `nodes/majority_only/` | only when the three judges pick three different candidates |\n| `always_tie_break` | `nodes/always_tie_break/` | on every case, with the three verdicts in view |\n\n`always_tie_break` is the upper bound on cost and a reference for accuracy: if it does not pick the winner more often\nthan the panel, the merge is not where the panel loses. Both alternatives share the helpers in `merge.py`.\n\n**Checks.** The columns of every row:\n\n- `winner`: the built-in `expected` check on the winner a support lead picked.\n- `settled_by_panel`: a code check in `checks.py`, passes when the winner came from the merged verdict and not from the\n  tie-break. It is the share of cases the merge saves a call on.\n\nCost and latency come with every series; read them next to `settled_by_panel`.\n\n**Reading the result.** `majority_only` passes when its `winner` rate is at most 0.05 below `majority_and_spread`. A pass\nwith a higher `settled_by_panel` means the spread rule costs more than it catches. Look at the `contest: close` cases\nfirst: they are the ones the spread rule sends to the tie-break.\n",
    "files": {
      "spec": "experiments/panel_merge_rule/experiment.yaml",
      "notes": "experiments/panel_merge_rule/experiment.md"
    }
  },
  {
    "experiment_id": "panel_single_judge",
    "description": "A single DeepSeek judge answers at least 1.5 s faster at the median than the three-judge panel, picks the expected winner at most 0.1 less often and fails no more runs",
    "flow_id": "judge_panel",
    "subject": {
      "kind": "flow",
      "flow_id": "winner_pick",
      "local_flow": true,
      "from_node": null,
      "to_node": null
    },
    "failure_mode": "panel_wrong_winner",
    "question": "compare",
    "variants": [
      "panel",
      "single_judge"
    ],
    "baseline": "panel",
    "candidate": "single_judge",
    "latest": null,
    "series_count": 0,
    "spent_usd": "0",
    "archived": false,
    "created": "2026-09-11T09:00:00Z",
    "last_activity": "2026-09-16T15:00:00Z",
    "activity_source": "files",
    "running": false,
    "attention": [],
    "question_detail": {
      "kind": "compare",
      "metric": "latency_p50_ms",
      "bound": null,
      "value": null,
      "variant": null,
      "baseline": "panel",
      "candidate": "single_judge",
      "direction": "lower_is_better",
      "margin": 1500,
      "relative": false,
      "guardrails": [
        {
          "metric": "winner",
          "direction": "higher_is_better",
          "margin": 0.1,
          "relative": false
        },
        {
          "metric": "success_rate",
          "direction": "higher_is_better",
          "margin": 0.05,
          "relative": false
        },
        {
          "metric": "infra_error_rate",
          "direction": "lower_is_better",
          "margin": 0.02,
          "relative": false
        }
      ]
    },
    "varies": {
      "what": "flow",
      "nodes": [
        "panel"
      ]
    },
    "slots": [
      {
        "node_id": "panel",
        "kind": "call",
        "written": "judge_panel",
        "files": [
          {
            "role": "node",
            "path": "experiments/panel_single_judge/flows/winner_pick/nodes/panel/panel.node.yaml"
          }
        ]
      }
    ],
    "agents": [],
    "flows": [
      {
        "flow_id": "single_judge",
        "description": "One judge instead of the panel: the tie-break inference scores the candidates blind, and the panel's own pick step turns its verdict into the winner",
        "file": "experiments/panel_single_judge/flows/single_judge/flow.yaml",
        "steps": [
          {
            "node_id": "judge",
            "kind": "llm",
            "agent": {
              "agent_id": "deepseek",
              "model": "openrouter:deepseek/deepseek-v4-flash-0731"
            },
            "description": "A single DeepSeek-family judge scores the drafts blind, as one panel judge does"
          },
          {
            "node_id": "pick",
            "kind": "code",
            "agent": null,
            "description": "The panel's pick step: takes the winning draft from the single verdict, with no tie-break and no spread between judges"
          }
        ]
      },
      {
        "flow_id": "winner_pick",
        "description": "The winning reply draft from one slot: the panel node calls the judging pattern a variant picks, the project judge panel as written",
        "file": "experiments/panel_single_judge/flows/winner_pick/flow.yaml",
        "steps": [
          {
            "node_id": "panel",
            "kind": "call",
            "agent": null,
            "description": "The slot of the experiment: calls a judging pattern with the case summary, the drafts and the chunks, as written the project judge panel"
          }
        ]
      }
    ],
    "alternatives": [],
    "prompts": [],
    "cases": {
      "dataset_id": "judge_panel_cases",
      "flow_id": "judge_panel",
      "tags": {},
      "selected": 8,
      "total": 8,
      "splits": {
        "dev": 3,
        "holdout": 5
      }
    },
    "variant_details": [
      {
        "variant_id": "panel",
        "role": "baseline",
        "changes": [],
        "assignments": []
      },
      {
        "variant_id": "single_judge",
        "role": "candidate",
        "changes": [
          {
            "node_id": "panel",
            "what": "flow",
            "value": "single_judge"
          }
        ],
        "assignments": []
      }
    ],
    "checks": [
      {
        "check_id": "winner",
        "kind": "binary",
        "source": {
          "kind": "builtin",
          "use": "expected",
          "fields": [
            "winner"
          ],
          "ref": null,
          "inference": null,
          "agent": null,
          "validated_by": null
        }
      }
    ],
    "metrics": [
      {
        "metric": "latency_p50_ms",
        "role": "primary",
        "direction": "lower_is_better",
        "unit": "ms",
        "margin": 1500,
        "relative": false
      },
      {
        "metric": "winner",
        "role": "guardrail",
        "direction": "higher_is_better",
        "unit": "rate",
        "margin": 0.1,
        "relative": false
      },
      {
        "metric": "success_rate",
        "role": "guardrail",
        "direction": "higher_is_better",
        "unit": "rate",
        "margin": 0.05,
        "relative": false
      },
      {
        "metric": "infra_error_rate",
        "role": "guardrail",
        "direction": "lower_is_better",
        "unit": "rate",
        "margin": 0.02,
        "relative": false
      },
      {
        "metric": "cost_usd",
        "role": "builtin",
        "direction": "lower_is_better",
        "unit": "usd",
        "margin": null,
        "relative": false
      },
      {
        "metric": "cost_of_pass",
        "role": "builtin",
        "direction": "lower_is_better",
        "unit": "usd",
        "margin": null,
        "relative": false
      },
      {
        "metric": "latency_p95_ms",
        "role": "builtin",
        "direction": "lower_is_better",
        "unit": "ms",
        "margin": null,
        "relative": false
      },
      {
        "metric": "schema_valid_first_try",
        "role": "builtin",
        "direction": "higher_is_better",
        "unit": "rate",
        "margin": null,
        "relative": false
      }
    ],
    "plan": {
      "cases": 8,
      "repeats": 3
    },
    "notes": "# One judge instead of the panel\n\n**Purpose:** checking a risky hypothesis (a project flow against a local flow in the same slot).\n\nThe panel runs three judges in parallel and waits for at least two of them to agree, then calls a tie-break when\nthey do not. The hypothesis is that on these cases a single judge picks the same winner, and the reply stage gets\nnoticeably faster. The risk is the reason the panel exists: one judge has its own blind spots and nobody to catch\nthem.\n\n**Subject.** A variant changes one factor, never the whole subject, so two judging patterns are compared through a\nslot. The subject is the local flow `winner_pick` (`flows/winner_pick/`): one `call` node, `panel`, that passes the\ncase summary, the drafts and the chunks on and returns what it gets back. As written, `panel` calls the project flow\n`judge_panel`. The dataset `judge_panel_cases` belongs to `judge_panel`, and `winner_pick` takes the same input type, so\nthe same cases run on both variants.\n\n**Variants.** The factor is the flow called at the slot (`varies: what: flow, nodes: [panel]`).\n\n| Variant | `panel` calls | What runs |\n|---|---|---|\n| `panel` | `judge_panel` (as written) | three judges, the merge and the tie-break |\n| `single_judge` | the local flow `single_judge` | one judge, then the panel's own `pick` step |\n\n`single_judge` keeps the input and output types of `judge_panel` (`PanelRequest` to `PanelOutcome`), which a flow\nfactor requires: the `judge` step is the project's `tie_break` inference with the `deepseek` agent, and the `pick` step\nis the panel's own `pick` function, so the winner is chosen by the same rule. A Qwen single judge is not a variant\nhere: it would change the pattern and the agent at once. If the single judge wins, compare its agents in an agent\nexperiment on the adopted flow.\n\n**Reading the result.** The primary metric is the median latency, lower is better: `single_judge` has to be faster by\nmore than 1500 ms. Three guardrails keep the win honest:\n\n- `winner` may drop by at most 0.1: a single judge that is fast and wrong is not an improvement.\n- `success_rate` may drop by at most 0.05: a single judge has no quorum to fall back on.\n- `infra_error_rate` may grow by at most 0.02, absolute: a faster provider that fails more often is not faster.\n\n**Caveat.** Eight cases, three repeats. A pass here is a reason to run the comparison on the full reply set, not to\nremove the panel.\n",
    "files": {
      "spec": "experiments/panel_single_judge/experiment.yaml",
      "notes": "experiments/panel_single_judge/experiment.md"
    }
  },
  {
    "experiment_id": "reply_look",
    "description": "A quick look at the polished reply on the regression cases after a change to the revision prompt: each case with its checks, cost and trace, no verdict",
    "flow_id": "support_case",
    "subject": {
      "kind": "range",
      "flow_id": "support_case",
      "local_flow": false,
      "from_node": "polish",
      "to_node": "polish"
    },
    "failure_mode": null,
    "question": "look",
    "variants": [
      "current"
    ],
    "baseline": null,
    "candidate": null,
    "latest": null,
    "series_count": 0,
    "spent_usd": "0",
    "archived": false,
    "created": "2026-09-08T09:00:00Z",
    "last_activity": "2026-09-10T09:00:00Z",
    "activity_source": "files",
    "running": false,
    "attention": [],
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
    "varies": null,
    "slots": [],
    "agents": [],
    "flows": [],
    "alternatives": [],
    "prompts": [],
    "cases": {
      "dataset_id": "support_case_cases",
      "flow_id": "support_case",
      "tags": {
        "regression": "yes"
      },
      "selected": 5,
      "total": 12,
      "splits": {
        "dev": 4,
        "holdout": 1
      }
    },
    "variant_details": [
      {
        "variant_id": "current",
        "role": "other",
        "changes": [],
        "assignments": [
          {
            "node_id": "polish__critique",
            "agent": {
              "agent_id": "mistral",
              "model": "openrouter:mistralai/mistral-nemo"
            },
            "overridden": false
          },
          {
            "node_id": "polish__revise",
            "agent": {
              "agent_id": "gpt",
              "model": "openrouter:openai/gpt-oss-20b"
            },
            "overridden": false
          }
        ]
      }
    ],
    "checks": [
      {
        "check_id": "promises",
        "kind": "binary",
        "source": {
          "kind": "code",
          "use": null,
          "fields": [],
          "ref": "lumen.code.support_case:reply_keeps_resolution",
          "inference": null,
          "agent": null,
          "validated_by": null
        }
      },
      {
        "check_id": "critique",
        "kind": "continuous",
        "source": {
          "kind": "judge",
          "use": null,
          "fields": [],
          "ref": null,
          "inference": "critique",
          "agent": {
            "agent_id": "deepseek",
            "model": "openrouter:deepseek/deepseek-v4-flash-0731"
          },
          "validated_by": "critique_planted_defects"
        }
      }
    ],
    "metrics": [
      {
        "metric": "promises",
        "role": "check",
        "direction": "higher_is_better",
        "unit": "rate",
        "margin": null,
        "relative": false
      },
      {
        "metric": "critique",
        "role": "check",
        "direction": "higher_is_better",
        "unit": "score",
        "margin": null,
        "relative": false
      },
      {
        "metric": "success_rate",
        "role": "builtin",
        "direction": "higher_is_better",
        "unit": "rate",
        "margin": null,
        "relative": false
      },
      {
        "metric": "cost_usd",
        "role": "builtin",
        "direction": "lower_is_better",
        "unit": "usd",
        "margin": null,
        "relative": false
      },
      {
        "metric": "cost_of_pass",
        "role": "builtin",
        "direction": "lower_is_better",
        "unit": "usd",
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
        "metric": "latency_p95_ms",
        "role": "builtin",
        "direction": "lower_is_better",
        "unit": "ms",
        "margin": null,
        "relative": false
      },
      {
        "metric": "schema_valid_first_try",
        "role": "builtin",
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
    "plan": {
      "cases": null,
      "repeats": 1
    },
    "notes": "# Quick look at the regression cases\n\n**Purpose:** a quick check after a change, and a watch on regressions.\n\nRun this after any edit to the revision prompt, its lamp-kind variants or the brand-voice fragments. It runs only the\n`polish` loop on the cases tagged `regression: yes`. Each of them once broke in production, and\n`metadata.regression_of` says how:\n\n- a replacement offered on an advice-only case\n- the store website mentioned in a marketplace chat\n- a refund offered for battery life that matches the specification\n- a replacement promised for a buzz that the dimmer causes\n- the policy cap named instead of the credit amount\n\nEach case already carries a panel-picked draft with the old mistake in it (`node_outputs.panel.winner`). The question\nis whether the current revision step removes it.\n\nThere is no verdict: `look` shows each case with the final reply, the `promises` check, the critic's score, cost and a\nlink to the trace. A failing case points at the step to open. Five cases say nothing about averages, so do not read an\nimprovement into the mean.\n",
    "files": {
      "spec": "experiments/reply_look/experiment.yaml",
      "notes": "experiments/reply_look/experiment.md"
    }
  },
  {
    "experiment_id": "reply_noninferior_mistral",
    "description": "mistral in the revision step of the polish loop is not worse than gpt by the critic's score, and a passing reply costs at most 20% more",
    "flow_id": "support_case",
    "subject": {
      "kind": "range",
      "flow_id": "support_case",
      "local_flow": false,
      "from_node": "polish",
      "to_node": "polish"
    },
    "failure_mode": "reply_quality",
    "question": "noninferior",
    "variants": [
      "gpt",
      "mistral"
    ],
    "baseline": "gpt",
    "candidate": "mistral",
    "latest": null,
    "series_count": 0,
    "spent_usd": "0",
    "archived": false,
    "created": "2026-09-08T10:00:00Z",
    "last_activity": "2026-09-19T18:00:00Z",
    "activity_source": "files",
    "running": false,
    "attention": [],
    "question_detail": {
      "kind": "noninferior",
      "metric": "critique",
      "bound": null,
      "value": null,
      "variant": null,
      "baseline": "gpt",
      "candidate": "mistral",
      "direction": "higher_is_better",
      "margin": 0.05,
      "relative": false,
      "guardrails": [
        {
          "metric": "cost_of_pass",
          "direction": "lower_is_better",
          "margin": 0.2,
          "relative": true
        }
      ]
    },
    "varies": {
      "what": "agent",
      "nodes": [
        "revise"
      ]
    },
    "slots": [
      {
        "node_id": "revise",
        "kind": "llm",
        "written": "gpt",
        "files": [
          {
            "role": "node",
            "path": "flows/support_case/nodes/polish/revise.node.yaml"
          },
          {
            "role": "inference",
            "path": "flows/support_case/nodes/polish/revise.inference.yaml"
          },
          {
            "role": "prompt",
            "path": "flows/support_case/nodes/polish/revise.prompt.md"
          }
        ]
      }
    ],
    "agents": [
      {
        "agent_id": "gpt",
        "file": "agents/gpt.yaml",
        "spec": {
          "apiVersion": "aqven/v1",
          "kind": "Agent",
          "description": "OpenAI-family reply author: draft, revision from critique and the judge panel tie-break",
          "model": "openrouter:openai/gpt-oss-20b",
          "fallback_models": null,
          "settings": {
            "temperature": 0.3,
            "top_p": null,
            "max_tokens": 6000,
            "seed": null,
            "provider_options": null
          },
          "output": {
            "mode": "prompted",
            "strict": false,
            "retries": 4,
            "on_error": "retry",
            "on_refusal": "fail",
            "on_truncated": "fail"
          },
          "instructions": null,
          "tools": null,
          "mcp_servers": null,
          "subagents": null,
          "approval": null,
          "limits": null
        },
        "instructions": null
      },
      {
        "agent_id": "mistral",
        "file": "agents/mistral.yaml",
        "spec": {
          "apiVersion": "aqven/v1",
          "kind": "Agent",
          "description": "Mistral-family model: reply draft and reply critique",
          "model": "openrouter:mistralai/mistral-nemo",
          "fallback_models": null,
          "settings": {
            "temperature": 0.2,
            "top_p": null,
            "max_tokens": 3000,
            "seed": null,
            "provider_options": null
          },
          "output": {
            "mode": "prompted",
            "strict": false,
            "retries": 2,
            "on_error": "retry",
            "on_refusal": "fail",
            "on_truncated": "fail"
          },
          "instructions": null,
          "tools": null,
          "mcp_servers": null,
          "subagents": null,
          "approval": null,
          "limits": null
        },
        "instructions": null
      }
    ],
    "flows": [],
    "alternatives": [],
    "prompts": [],
    "cases": {
      "dataset_id": "support_case_cases",
      "flow_id": "support_case",
      "tags": {},
      "selected": 12,
      "total": 12,
      "splits": {
        "dev": 6,
        "holdout": 6
      }
    },
    "variant_details": [
      {
        "variant_id": "gpt",
        "role": "baseline",
        "changes": [],
        "assignments": [
          {
            "node_id": "polish__critique",
            "agent": {
              "agent_id": "mistral",
              "model": "openrouter:mistralai/mistral-nemo"
            },
            "overridden": false
          },
          {
            "node_id": "polish__revise",
            "agent": {
              "agent_id": "gpt",
              "model": "openrouter:openai/gpt-oss-20b"
            },
            "overridden": false
          }
        ]
      },
      {
        "variant_id": "mistral",
        "role": "candidate",
        "changes": [
          {
            "node_id": "revise",
            "what": "agent",
            "value": "mistral"
          }
        ],
        "assignments": [
          {
            "node_id": "polish__critique",
            "agent": {
              "agent_id": "mistral",
              "model": "openrouter:mistralai/mistral-nemo"
            },
            "overridden": false
          },
          {
            "node_id": "polish__revise",
            "agent": {
              "agent_id": "mistral",
              "model": "openrouter:mistralai/mistral-nemo"
            },
            "overridden": true
          }
        ]
      }
    ],
    "checks": [
      {
        "check_id": "critique",
        "kind": "continuous",
        "source": {
          "kind": "judge",
          "use": null,
          "fields": [],
          "ref": null,
          "inference": "critique",
          "agent": {
            "agent_id": "deepseek",
            "model": "openrouter:deepseek/deepseek-v4-flash-0731"
          },
          "validated_by": "critique_planted_defects"
        }
      },
      {
        "check_id": "promises",
        "kind": "binary",
        "source": {
          "kind": "code",
          "use": null,
          "fields": [],
          "ref": "lumen.code.support_case:reply_keeps_resolution",
          "inference": null,
          "agent": null,
          "validated_by": null
        }
      }
    ],
    "metrics": [
      {
        "metric": "critique",
        "role": "primary",
        "direction": "higher_is_better",
        "unit": "score",
        "margin": 0.05,
        "relative": false
      },
      {
        "metric": "cost_of_pass",
        "role": "guardrail",
        "direction": "lower_is_better",
        "unit": "usd",
        "margin": 0.2,
        "relative": true
      },
      {
        "metric": "promises",
        "role": "check",
        "direction": "higher_is_better",
        "unit": "rate",
        "margin": null,
        "relative": false
      },
      {
        "metric": "success_rate",
        "role": "builtin",
        "direction": "higher_is_better",
        "unit": "rate",
        "margin": null,
        "relative": false
      },
      {
        "metric": "cost_usd",
        "role": "builtin",
        "direction": "lower_is_better",
        "unit": "usd",
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
        "metric": "latency_p95_ms",
        "role": "builtin",
        "direction": "lower_is_better",
        "unit": "ms",
        "margin": null,
        "relative": false
      },
      {
        "metric": "schema_valid_first_try",
        "role": "builtin",
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
    "plan": {
      "cases": 12,
      "repeats": 3
    },
    "notes": "# mistral in the revision step\n\n**Purpose:** choosing an agent (a paired comparison with a non-inferiority question).\n\nThe revision step `polish__revise` runs on gpt. mistral already writes one of the three drafts and costs less per\ntoken, so we want to know whether it can take over the revision without the reply getting worse.\n\n**Variants.** The factor is the agent on the `revise` node inside the loop (`varies: what: agent`, the node named by its\nown id). `gpt` is the flow as written, `mistral` puts the Mistral agent on `revise`.\n\n**What we measure.** Only the `polish` loop runs, on each case of `support_case_cases`. The steps before it come from\nthe case `node_outputs`: the parsed case (`triage`), the channel (`prepare`), the knowledge base chunks (`search_kb`),\nthe decision (`route`) and the draft the panel picked (`panel`). Both variants therefore revise the same draft for the\nsame decision, and any difference comes from the reviser.\n\n- `critique` is the primary metric: the DeepSeek critic's score of the final reply. The critic is a different family\n  from both variants. Its verdicts are measured against planted defects in `critique_planted_defects`, and that\n  experiment has to pass before this one counts as evidence.\n- `promises` is the same code check that runs on the revision step at run time. A variant that promises a refund,\n  a replacement or an amount the decision does not give fails it.\n- `citations_in_sources` is not repeated here. It is declared on the `revise` inference, and the series counts how\n  often it fails on the first attempt.\n\n**Reading the result.** mistral passes when its critic score is at most 0.05 below gpt's and a passing reply costs\nat most 20% more (`cost_of_pass`). Three repeats per case separate a steady difference from noise.\n\n**Caveat.** Inside the loop, the in-flow critic `polish__critique` is also mistral. With this variant the loop's own\nstop score becomes self-graded and may stop the loop early. The external DeepSeek check keeps the measurement\nindependent, but compare the iteration counts too.\n",
    "files": {
      "spec": "experiments/reply_noninferior_mistral/experiment.yaml",
      "notes": "experiments/reply_noninferior_mistral/experiment.md"
    }
  },
  {
    "experiment_id": "reply_overpromise_risk",
    "description": "The polish loop keeps the reply within the decision in more than 97% of attempts: a refund, a replacement or an amount the decision does not give stays a rare failure",
    "flow_id": "support_case",
    "subject": {
      "kind": "range",
      "flow_id": "support_case",
      "local_flow": false,
      "from_node": "polish",
      "to_node": "polish"
    },
    "failure_mode": "overpromise",
    "question": "threshold",
    "variants": [
      "gpt"
    ],
    "baseline": null,
    "candidate": null,
    "latest": null,
    "series_count": 0,
    "spent_usd": "0",
    "archived": false,
    "created": "2026-09-09T10:00:00Z",
    "last_activity": "2026-09-17T12:00:00Z",
    "activity_source": "files",
    "running": false,
    "attention": [],
    "question_detail": {
      "kind": "threshold",
      "metric": "promises",
      "bound": "above",
      "value": 0.97,
      "variant": null,
      "baseline": null,
      "candidate": null,
      "direction": "higher_is_better",
      "margin": 0.01,
      "relative": false,
      "guardrails": []
    },
    "varies": null,
    "slots": [],
    "agents": [],
    "flows": [],
    "alternatives": [],
    "prompts": [],
    "cases": {
      "dataset_id": "support_case_cases",
      "flow_id": "support_case",
      "tags": {},
      "selected": 12,
      "total": 12,
      "splits": {
        "dev": 6,
        "holdout": 6
      }
    },
    "variant_details": [
      {
        "variant_id": "gpt",
        "role": "other",
        "changes": [],
        "assignments": [
          {
            "node_id": "polish__critique",
            "agent": {
              "agent_id": "mistral",
              "model": "openrouter:mistralai/mistral-nemo"
            },
            "overridden": false
          },
          {
            "node_id": "polish__revise",
            "agent": {
              "agent_id": "gpt",
              "model": "openrouter:openai/gpt-oss-20b"
            },
            "overridden": false
          }
        ]
      }
    ],
    "checks": [
      {
        "check_id": "promises",
        "kind": "binary",
        "source": {
          "kind": "code",
          "use": null,
          "fields": [],
          "ref": "lumen.code.support_case:reply_keeps_resolution",
          "inference": null,
          "agent": null,
          "validated_by": null
        }
      },
      {
        "check_id": "customer_language",
        "kind": "binary",
        "source": {
          "kind": "builtin",
          "use": "language",
          "fields": [
            "$out.reply.text"
          ],
          "ref": null,
          "inference": null,
          "agent": null,
          "validated_by": null
        }
      }
    ],
    "metrics": [
      {
        "metric": "promises",
        "role": "primary",
        "direction": "higher_is_better",
        "unit": "rate",
        "margin": 0.01,
        "relative": false
      },
      {
        "metric": "customer_language",
        "role": "check",
        "direction": "higher_is_better",
        "unit": "rate",
        "margin": null,
        "relative": false
      },
      {
        "metric": "success_rate",
        "role": "builtin",
        "direction": "higher_is_better",
        "unit": "rate",
        "margin": null,
        "relative": false
      },
      {
        "metric": "cost_usd",
        "role": "builtin",
        "direction": "lower_is_better",
        "unit": "usd",
        "margin": null,
        "relative": false
      },
      {
        "metric": "cost_of_pass",
        "role": "builtin",
        "direction": "lower_is_better",
        "unit": "usd",
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
        "metric": "latency_p95_ms",
        "role": "builtin",
        "direction": "lower_is_better",
        "unit": "ms",
        "margin": null,
        "relative": false
      },
      {
        "metric": "schema_valid_first_try",
        "role": "builtin",
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
    "plan": {
      "cases": 12,
      "repeats": 20
    },
    "notes": "# How often the polished reply overpromises\n\n**Purpose:** a risk threshold. A reply that promises a refund, a replacement or an amount the decision does not give\nis the costliest mistake of the reply stage: support either honours a promise nobody approved or takes it back in\nfront of the customer.\n\n**Subject.** Only the `polish` loop runs, as the flow runs it. The steps before it come from the case `node_outputs`,\nso every attempt revises the same panel-picked draft for the same decision, and the risk measured belongs to the\nrevision step alone.\n\n**Cases.** All twelve cases of `support_case_cases`, every kind of decision. The five advice-only cases are where the\nrisk lives: any compensation in their reply is a failure. The credit cases catch the other half, an amount that is\nnot the credited one.\n\n**Checks.**\n\n- `promises` is the same code check that runs on the revision step at run time, and the metric of the question.\n- `customer_language` is the built-in `language` check against the reply locale. Every customer here writes in\n  English, so it fails only when the reviser drifts into another language. It is a canary with no threshold.\n\n**Why 20 repeats.** A failure rate of a few per cent does not show up in twelve attempts. Even with no failure at all,\nabout 200 attempts are needed before a series can confirm a rate above 0.97 with a margin of 0.01, and twenty repeats\nof each case give 240. Repeats of one case are correlated, so the effective sample is smaller than 240: a result of\n\"unclear\" calls for more cases, not more repeats.\n\n**Reading the result.** The risk is acceptable when the `promises` pass rate stays above 0.97 with a margin of 0.01.\nA confirmed result holds for these decisions and this reviser agent; re-run it after any edit to the revision prompt\nor its variants, and before `reply_noninferior_mistral` changes the reviser.\n",
    "files": {
      "spec": "experiments/reply_overpromise_risk/experiment.yaml",
      "notes": "experiments/reply_overpromise_risk/experiment.md"
    }
  },
  {
    "experiment_id": "reply_stage_budget",
    "description": "Writing the reply, three drafts and the judge panel from the case node_outputs, stays under one cent per case for each drafting line-up on long cases outside the regression set",
    "flow_id": "support_case",
    "subject": {
      "kind": "range",
      "flow_id": "support_case",
      "local_flow": false,
      "from_node": "drafts",
      "to_node": "panel"
    },
    "failure_mode": null,
    "question": "threshold",
    "variants": [
      "three_families",
      "mistral_only",
      "gemini_only"
    ],
    "baseline": null,
    "candidate": null,
    "latest": null,
    "series_count": 0,
    "spent_usd": "0",
    "archived": false,
    "created": "2026-09-09T11:00:00Z",
    "last_activity": "2026-09-13T13:00:00Z",
    "activity_source": "files",
    "running": false,
    "attention": [],
    "question_detail": {
      "kind": "threshold",
      "metric": "cost_usd",
      "bound": "below",
      "value": 0.01,
      "variant": null,
      "baseline": null,
      "candidate": null,
      "direction": "lower_is_better",
      "margin": 0,
      "relative": false,
      "guardrails": []
    },
    "varies": {
      "what": "agent",
      "nodes": [
        "gpt",
        "gemini",
        "mistral"
      ]
    },
    "slots": [
      {
        "node_id": "gpt",
        "kind": "llm",
        "written": "gpt",
        "files": [
          {
            "role": "node",
            "path": "flows/support_case/nodes/drafts/gpt.node.yaml"
          },
          {
            "role": "inference",
            "path": "flows/support_case/nodes/polish/revise.inference.yaml"
          },
          {
            "role": "prompt",
            "path": "flows/support_case/nodes/polish/revise.prompt.md"
          }
        ]
      },
      {
        "node_id": "gemini",
        "kind": "llm",
        "written": "gemini",
        "files": [
          {
            "role": "node",
            "path": "flows/support_case/nodes/drafts/gemini.node.yaml"
          },
          {
            "role": "inference",
            "path": "flows/support_case/nodes/polish/revise.inference.yaml"
          },
          {
            "role": "prompt",
            "path": "flows/support_case/nodes/polish/revise.prompt.md"
          }
        ]
      },
      {
        "node_id": "mistral",
        "kind": "llm",
        "written": "mistral",
        "files": [
          {
            "role": "node",
            "path": "flows/support_case/nodes/drafts/mistral.node.yaml"
          },
          {
            "role": "inference",
            "path": "flows/support_case/nodes/polish/revise.inference.yaml"
          },
          {
            "role": "prompt",
            "path": "flows/support_case/nodes/polish/revise.prompt.md"
          }
        ]
      }
    ],
    "agents": [
      {
        "agent_id": "gpt",
        "file": "agents/gpt.yaml",
        "spec": {
          "apiVersion": "aqven/v1",
          "kind": "Agent",
          "description": "OpenAI-family reply author: draft, revision from critique and the judge panel tie-break",
          "model": "openrouter:openai/gpt-oss-20b",
          "fallback_models": null,
          "settings": {
            "temperature": 0.3,
            "top_p": null,
            "max_tokens": 6000,
            "seed": null,
            "provider_options": null
          },
          "output": {
            "mode": "prompted",
            "strict": false,
            "retries": 4,
            "on_error": "retry",
            "on_refusal": "fail",
            "on_truncated": "fail"
          },
          "instructions": null,
          "tools": null,
          "mcp_servers": null,
          "subagents": null,
          "approval": null,
          "limits": null
        },
        "instructions": null
      },
      {
        "agent_id": "gemini",
        "file": "agents/gemini.yaml",
        "spec": {
          "apiVersion": "aqven/v1",
          "kind": "Agent",
          "description": "Multimodal case parsing, the attachment form and a Google-family reply draft",
          "model": "openrouter:google/gemini-2.5-flash-lite",
          "fallback_models": null,
          "settings": {
            "temperature": 0.2,
            "top_p": null,
            "max_tokens": 4000,
            "seed": null,
            "provider_options": null
          },
          "output": {
            "mode": "auto",
            "strict": false,
            "retries": 2,
            "on_error": "retry",
            "on_refusal": "fail",
            "on_truncated": "fail"
          },
          "instructions": null,
          "tools": null,
          "mcp_servers": null,
          "subagents": null,
          "approval": null,
          "limits": null
        },
        "instructions": null
      },
      {
        "agent_id": "mistral",
        "file": "agents/mistral.yaml",
        "spec": {
          "apiVersion": "aqven/v1",
          "kind": "Agent",
          "description": "Mistral-family model: reply draft and reply critique",
          "model": "openrouter:mistralai/mistral-nemo",
          "fallback_models": null,
          "settings": {
            "temperature": 0.2,
            "top_p": null,
            "max_tokens": 3000,
            "seed": null,
            "provider_options": null
          },
          "output": {
            "mode": "prompted",
            "strict": false,
            "retries": 2,
            "on_error": "retry",
            "on_refusal": "fail",
            "on_truncated": "fail"
          },
          "instructions": null,
          "tools": null,
          "mcp_servers": null,
          "subagents": null,
          "approval": null,
          "limits": null
        },
        "instructions": null
      }
    ],
    "flows": [],
    "alternatives": [],
    "prompts": [],
    "cases": {
      "dataset_id": "support_case_cases",
      "flow_id": "support_case",
      "tags": {
        "length": "long",
        "regression": "no"
      },
      "selected": 4,
      "total": 12,
      "splits": {
        "dev": 1,
        "holdout": 3
      }
    },
    "variant_details": [
      {
        "variant_id": "three_families",
        "role": "other",
        "changes": [],
        "assignments": [
          {
            "node_id": "drafts__gemini",
            "agent": {
              "agent_id": "gemini",
              "model": "openrouter:google/gemini-2.5-flash-lite"
            },
            "overridden": false
          },
          {
            "node_id": "drafts__gpt",
            "agent": {
              "agent_id": "gpt",
              "model": "openrouter:openai/gpt-oss-20b"
            },
            "overridden": false
          },
          {
            "node_id": "drafts__mistral",
            "agent": {
              "agent_id": "mistral",
              "model": "openrouter:mistralai/mistral-nemo"
            },
            "overridden": false
          }
        ]
      },
      {
        "variant_id": "mistral_only",
        "role": "other",
        "changes": [
          {
            "node_id": "gpt",
            "what": "agent",
            "value": "mistral"
          },
          {
            "node_id": "gemini",
            "what": "agent",
            "value": "mistral"
          }
        ],
        "assignments": [
          {
            "node_id": "drafts__gemini",
            "agent": {
              "agent_id": "mistral",
              "model": "openrouter:mistralai/mistral-nemo"
            },
            "overridden": true
          },
          {
            "node_id": "drafts__gpt",
            "agent": {
              "agent_id": "mistral",
              "model": "openrouter:mistralai/mistral-nemo"
            },
            "overridden": true
          },
          {
            "node_id": "drafts__mistral",
            "agent": {
              "agent_id": "mistral",
              "model": "openrouter:mistralai/mistral-nemo"
            },
            "overridden": false
          }
        ]
      },
      {
        "variant_id": "gemini_only",
        "role": "other",
        "changes": [
          {
            "node_id": "gpt",
            "what": "agent",
            "value": "gemini"
          },
          {
            "node_id": "mistral",
            "what": "agent",
            "value": "gemini"
          }
        ],
        "assignments": [
          {
            "node_id": "drafts__gemini",
            "agent": {
              "agent_id": "gemini",
              "model": "openrouter:google/gemini-2.5-flash-lite"
            },
            "overridden": false
          },
          {
            "node_id": "drafts__gpt",
            "agent": {
              "agent_id": "gemini",
              "model": "openrouter:google/gemini-2.5-flash-lite"
            },
            "overridden": true
          },
          {
            "node_id": "drafts__mistral",
            "agent": {
              "agent_id": "gemini",
              "model": "openrouter:google/gemini-2.5-flash-lite"
            },
            "overridden": true
          }
        ]
      }
    ],
    "checks": [],
    "metrics": [
      {
        "metric": "cost_usd",
        "role": "primary",
        "direction": "lower_is_better",
        "unit": "usd",
        "margin": 0,
        "relative": false
      },
      {
        "metric": "success_rate",
        "role": "builtin",
        "direction": "higher_is_better",
        "unit": "rate",
        "margin": null,
        "relative": false
      },
      {
        "metric": "cost_of_pass",
        "role": "builtin",
        "direction": "lower_is_better",
        "unit": "usd",
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
        "metric": "latency_p95_ms",
        "role": "builtin",
        "direction": "lower_is_better",
        "unit": "ms",
        "margin": null,
        "relative": false
      },
      {
        "metric": "schema_valid_first_try",
        "role": "builtin",
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
    "plan": {
      "cases": 4,
      "repeats": 3
    },
    "notes": null,
    "files": {
      "spec": "experiments/reply_stage_budget/experiment.yaml",
      "notes": null
    }
  }
]
