import type { components } from "@/api/schema"
import supportCaseDataset from "./support-case-cases.json"

type S = components["schemas"]

export type LiveGate = { readonly report: S["GateReport"] | null; readonly message: string }

export const EVAL_RUN_ID = "01a0b15f-a62b-7279-85ed-f8678ef16784"

export const liveEvals: readonly S["EvalSummary"][] = [
  {
    "eval_id": "reply_quality",
    "path": "evals/support_case/reply_quality.yaml",
    "file_hash": "sha256-5d04db55b055d09f488cf38c00f1143b7f11e8fa32800de7db548d24193eaff5",
    "description": "Качество ответа покупателю: оценка критика, те же проверки цитат и обещаний, что при исполнении, и стоимость; гейт релиза и оптимизация промта и вариантов GEPA",
    "inference": "revise",
    "agent": "gpt",
    "dataset": "reply_cases",
    "scorers": [
      "critique",
      "citations",
      "promises",
      "cost_usd"
    ],
    "has_gate": true,
    "has_optimization": true
  }
]

export const liveDatasets: readonly S["DatasetSummary"][] = [
  {
    dataset_id: "support_case_cases",
    flow_id: "support_case",
    path: "datasets/support_case_cases.yaml",
    file_hash: "sha256-demo-support-case-cases",
    cases: 3,
    splits: { train: 1, dev: 1, test: 1 },
    used_by: [],
  },
  {
    "dataset_id": "reply_cases",
    "flow_id": null,
    "path": "evals/support_case/reply_cases.yaml",
    "file_hash": "sha256-961c45ede752337892779fb1ef83ce078360d6db715a1606ad56fc267b646fa5",
    "cases": 3,
    "splits": {
      "train": 1,
      "dev": 1,
      "test": 1
    },
    "used_by": [
      "reply_quality"
    ]
  }
]

export const liveDatasetCases: Readonly<Record<string, readonly S["DatasetCase"][]>> = {
  support_case_cases: supportCaseDataset.cases,
  reply_cases: [
    { name: "bulb_app_offline_advice", inputs: { request: "Лампа не в сети" }, metadata: { split: "dev" } },
    { name: "lamp_crushed_box_reship", inputs: { request: "Разбитый торшер" }, metadata: { split: "test" } },
    { name: "strip_flicker_credit", inputs: { request: "Мерцающая лента" }, metadata: { split: "train" } },
  ],
}

export const liveEvalRuns: readonly S["EvalRunRecord"][] = [
  {
    "eval_run_id": "01a0b15f-a62b-7279-85ed-f8678ef16784",
    "eval_id": "reply_quality",
    "dataset_id": "reply_cases",
    "inference": "revise",
    "agent": "gpt",
    "status": "failed",
    "spec_hash": "",
    "started_at": "2026-09-17T21:57:10.082214Z",
    "finished_at": "2026-09-17T21:57:10.827722Z",
    "repeats": 3,
    "seeds": [
      0,
      1,
      2
    ],
    "cases_total": 9,
    "cases_ok": 0,
    "cases_failed": 9,
    "dropped_cases": [
      "bulb_app_offline_advice",
      "lamp_crushed_box_reship",
      "strip_flicker_credit"
    ],
    "cost_usd": "0",
    "tokens_in": 0,
    "tokens_out": 0,
    "scorers": [
      {
        "scorer_id": "critique",
        "kind": "continuous",
        "n": 0,
        "mean": 0,
        "pass_rate": null,
        "minimum": 0,
        "maximum": 0
      },
      {
        "scorer_id": "citations",
        "kind": "binary",
        "n": 0,
        "mean": 0,
        "pass_rate": null,
        "minimum": 0,
        "maximum": 0
      },
      {
        "scorer_id": "promises",
        "kind": "binary",
        "n": 0,
        "mean": 0,
        "pass_rate": null,
        "minimum": 0,
        "maximum": 0
      },
      {
        "scorer_id": "cost_usd",
        "kind": "continuous",
        "n": 0,
        "mean": 0,
        "pass_rate": null,
        "minimum": 0,
        "maximum": 0
      }
    ],
    "baseline_run_id": null,
    "deltas": [],
    "gate": null,
    "notes": [
      "bulb_app_offline_advice#0: ScorerFailed: scorer citations: case did not produce an output",
      "bulb_app_offline_advice#0: ScorerFailed: scorer cost_usd: case did not produce an output",
      "bulb_app_offline_advice#0: ScorerFailed: scorer critique: case did not produce an output",
      "bulb_app_offline_advice#0: ScorerFailed: scorer promises: case did not produce an output",
      "bulb_app_offline_advice#1: ScorerFailed: scorer citations: case did not produce an output",
      "bulb_app_offline_advice#1: ScorerFailed: scorer cost_usd: case did not produce an output",
      "bulb_app_offline_advice#1: ScorerFailed: scorer critique: case did not produce an output",
      "bulb_app_offline_advice#1: ScorerFailed: scorer promises: case did not produce an output",
      "bulb_app_offline_advice#2: ScorerFailed: scorer citations: case did not produce an output",
      "bulb_app_offline_advice#2: ScorerFailed: scorer cost_usd: case did not produce an output",
      "bulb_app_offline_advice#2: ScorerFailed: scorer critique: case did not produce an output",
      "bulb_app_offline_advice#2: ScorerFailed: scorer promises: case did not produce an output",
      "lamp_crushed_box_reship#0: ScorerFailed: scorer citations: case did not produce an output",
      "lamp_crushed_box_reship#0: ScorerFailed: scorer cost_usd: case did not produce an output",
      "lamp_crushed_box_reship#0: ScorerFailed: scorer critique: case did not produce an output",
      "lamp_crushed_box_reship#0: ScorerFailed: scorer promises: case did not produce an output",
      "lamp_crushed_box_reship#1: ScorerFailed: scorer citations: case did not produce an output",
      "lamp_crushed_box_reship#1: ScorerFailed: scorer cost_usd: case did not produce an output",
      "lamp_crushed_box_reship#1: ScorerFailed: scorer critique: case did not produce an output",
      "lamp_crushed_box_reship#1: ScorerFailed: scorer promises: case did not produce an output",
      "lamp_crushed_box_reship#2: ScorerFailed: scorer citations: case did not produce an output",
      "lamp_crushed_box_reship#2: ScorerFailed: scorer cost_usd: case did not produce an output",
      "lamp_crushed_box_reship#2: ScorerFailed: scorer critique: case did not produce an output",
      "lamp_crushed_box_reship#2: ScorerFailed: scorer promises: case did not produce an output",
      "strip_flicker_credit#0: ScorerFailed: scorer citations: case did not produce an output",
      "strip_flicker_credit#0: ScorerFailed: scorer cost_usd: case did not produce an output",
      "strip_flicker_credit#0: ScorerFailed: scorer critique: case did not produce an output",
      "strip_flicker_credit#0: ScorerFailed: scorer promises: case did not produce an output",
      "strip_flicker_credit#1: ScorerFailed: scorer citations: case did not produce an output",
      "strip_flicker_credit#1: ScorerFailed: scorer cost_usd: case did not produce an output",
      "strip_flicker_credit#1: ScorerFailed: scorer critique: case did not produce an output",
      "strip_flicker_credit#1: ScorerFailed: scorer promises: case did not produce an output",
      "strip_flicker_credit#2: ScorerFailed: scorer citations: case did not produce an output",
      "strip_flicker_credit#2: ScorerFailed: scorer cost_usd: case did not produce an output",
      "strip_flicker_credit#2: ScorerFailed: scorer critique: case did not produce an output",
      "strip_flicker_credit#2: ScorerFailed: scorer promises: case did not produce an output",
      "gate statistics need numpy==2.5.3, scipy==1.18.1, statsmodels==0.15.0: install aqven[stats]"
    ],
    "error": null
  }
]

export const liveEvalCases: Readonly<Record<string, readonly S["CaseRecord"][]>> = {
  "01a0b15f-a62b-7279-85ed-f8678ef16784": [
    {
      "case_name": "bulb_app_offline_advice",
      "run_index": 0,
      "seed": 0,
      "status": "failed",
      "run_id": "01a0b15f-a3a3-7470-bc49-70833ec885c4",
      "output": {},
      "error": "no API key for provider openrouter (openrouter:openai/gpt-oss-20b): set OPENROUTER_API_KEY in the project .env or the environment",
      "cost_usd": "0",
      "tokens_in": 0,
      "tokens_out": 0,
      "latency_ms": 97,
      "scores": []
    },
    {
      "case_name": "bulb_app_offline_advice",
      "run_index": 1,
      "seed": 1,
      "status": "failed",
      "run_id": "01a0b15f-a408-70de-85ec-62d7b086cbd8",
      "output": {},
      "error": "no API key for provider openrouter (openrouter:openai/gpt-oss-20b): set OPENROUTER_API_KEY in the project .env or the environment",
      "cost_usd": "0",
      "tokens_in": 0,
      "tokens_out": 0,
      "latency_ms": 427,
      "scores": []
    },
    {
      "case_name": "bulb_app_offline_advice",
      "run_index": 2,
      "seed": 2,
      "status": "failed",
      "run_id": "01a0b15f-a41a-75b8-80a3-d98f48650ff9",
      "output": {},
      "error": "no API key for provider openrouter (openrouter:openai/gpt-oss-20b): set OPENROUTER_API_KEY in the project .env or the environment",
      "cost_usd": "0",
      "tokens_in": 0,
      "tokens_out": 0,
      "latency_ms": 100,
      "scores": []
    },
    {
      "case_name": "lamp_crushed_box_reship",
      "run_index": 0,
      "seed": 0,
      "status": "failed",
      "run_id": "01a0b15f-a46d-70e9-9006-8f4c8f0d78f7",
      "output": {},
      "error": "no API key for provider openrouter (openrouter:openai/gpt-oss-20b): set OPENROUTER_API_KEY in the project .env or the environment",
      "cost_usd": "0",
      "tokens_in": 0,
      "tokens_out": 0,
      "latency_ms": 460,
      "scores": []
    },
    {
      "case_name": "lamp_crushed_box_reship",
      "run_index": 1,
      "seed": 1,
      "status": "failed",
      "run_id": "01a0b15f-a59b-75c7-8c54-9eed2cf8918f",
      "output": {},
      "error": "no API key for provider openrouter (openrouter:openai/gpt-oss-20b): set OPENROUTER_API_KEY in the project .env or the environment",
      "cost_usd": "0",
      "tokens_in": 0,
      "tokens_out": 0,
      "latency_ms": 394,
      "scores": []
    },
    {
      "case_name": "lamp_crushed_box_reship",
      "run_index": 2,
      "seed": 2,
      "status": "failed",
      "run_id": "01a0b15f-a5c3-74d0-b2bb-25c0d7de6671",
      "output": {},
      "error": "no API key for provider openrouter (openrouter:openai/gpt-oss-20b): set OPENROUTER_API_KEY in the project .env or the environment",
      "cost_usd": "0",
      "tokens_in": 0,
      "tokens_out": 0,
      "latency_ms": 74,
      "scores": []
    },
    {
      "case_name": "strip_flicker_credit",
      "run_index": 0,
      "seed": 0,
      "status": "failed",
      "run_id": "01a0b15f-a368-72ee-b545-37793fec06a5",
      "output": {},
      "error": "no API key for provider openrouter (openrouter:openai/gpt-oss-20b): set OPENROUTER_API_KEY in the project .env or the environment",
      "cost_usd": "0",
      "tokens_in": 0,
      "tokens_out": 0,
      "latency_ms": 281,
      "scores": []
    },
    {
      "case_name": "strip_flicker_credit",
      "run_index": 1,
      "seed": 1,
      "status": "failed",
      "run_id": "01a0b15f-a37b-7296-80a2-b444ffa2819d",
      "output": {},
      "error": "no API key for provider openrouter (openrouter:openai/gpt-oss-20b): set OPENROUTER_API_KEY in the project .env or the environment",
      "cost_usd": "0",
      "tokens_in": 0,
      "tokens_out": 0,
      "latency_ms": 573,
      "scores": []
    },
    {
      "case_name": "strip_flicker_credit",
      "run_index": 2,
      "seed": 2,
      "status": "failed",
      "run_id": "01a0b15f-a392-73bd-90bf-f8a8887dd3aa",
      "output": {},
      "error": "no API key for provider openrouter (openrouter:openai/gpt-oss-20b): set OPENROUTER_API_KEY in the project .env or the environment",
      "cost_usd": "0",
      "tokens_in": 0,
      "tokens_out": 0,
      "latency_ms": 120,
      "scores": []
    }
  ]
}

export const liveEvalGates: Readonly<Record<string, LiveGate>> = {
  "01a0b15f-a62b-7279-85ed-f8678ef16784": {
    "report": null,
    "message": "eval run 01a0b15f-a62b-7279-85ed-f8678ef16784 has no gate report: it ran without a baseline"
  }
}
