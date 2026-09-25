---
expect:
  series_id: "0199a1c4-7e2b-7c3d-9a10-3b4c5d6e7f80"
---
{
  "series_id": "{{input.series_id}}",
  "origin": {"kind": "experiment", "experiment_id": "judge_panel_agents"},
  "flow_id": "judge_panel",
  "dataset_id": "judge_panel_cases",
  "question": "compare",
  "on": "dev",
  "cases": 8,
  "repeats": 3,
  "variants": ["gpt_tie_break", "deepseek_tie_break"],
  "status": "cancelled",
  "progress": {"done": 41, "total": 48},
  "spend": {"usd": "0.91", "cap_usd": "1.00", "unpriced_attempts": 0},
  "verdict": null,
  "waits": 0,
  "started_at": "2026-09-25T09:12:40Z",
  "finished_at": "2026-09-25T09:41:05Z",
  "pause": null
}
