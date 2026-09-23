import type { ApiChatEvent } from "@/domain"

export const liveTurnEvents: readonly ApiChatEvent[] = [
  {
    seq: 1,
    at: "2026-09-17T21:55:49.907456Z",
    session_id: "01a0b15e-69af-71c7-a54d-213c4df2385e",
    turn_id: "01a0b15e-6a13-7571-9226-48395adeb839",
    type: "chat_turn_started",
    client_op_id: "studio-probe-1",
    text: "List the flow ids in this project with one Bash command, then answer in one short sentence.",
    backend: "claude",
    model: null
  },
  {
    seq: 2,
    at: "2026-09-17T21:55:49.907963Z",
    session_id: "01a0b15e-69af-71c7-a54d-213c4df2385e",
    turn_id: "01a0b15e-6a13-7571-9226-48395adeb839",
    type: "chat_status",
    state: "thinking"
  },
  {
    seq: 3,
    at: "2026-09-17T21:55:55.054073Z",
    session_id: "01a0b15e-69af-71c7-a54d-213c4df2385e",
    turn_id: "01a0b15e-6a13-7571-9226-48395adeb839",
    type: "chat_reasoning_delta",
    message_id: "msg_011Cf9kuCQDV9DanmasW9Ljx",
    part_index: 0,
    delta: "The user wants flow ids"
  },
  {
    seq: 4,
    at: "2026-09-17T21:55:55.054574Z",
    session_id: "01a0b15e-69af-71c7-a54d-213c4df2385e",
    turn_id: "01a0b15e-6a13-7571-9226-48395adeb839",
    type: "chat_reasoning_delta",
    message_id: "msg_011Cf9kuCQDV9DanmasW9Ljx",
    part_index: 0,
    delta: " listed using"
  },
  {
    seq: 41,
    at: "2026-09-17T21:56:03.410721Z",
    session_id: "01a0b15e-69af-71c7-a54d-213c4df2385e",
    turn_id: "01a0b15e-6a13-7571-9226-48395adeb839",
    type: "chat_tool_call_started",
    message_id: "msg_011Cf9kuCQDV9DanmasW9Ljx",
    tool_call_id: "toolu_012hvs5d2x1BUYDVBXx1dcbo",
    tool_name: "Bash",
    mcp_server: null
  },
  {
    seq: 42,
    at: "2026-09-17T21:56:03.410925Z",
    session_id: "01a0b15e-69af-71c7-a54d-213c4df2385e",
    turn_id: "01a0b15e-6a13-7571-9226-48395adeb839",
    type: "chat_status",
    state: "running_tool"
  },
  {
    seq: 43,
    at: "2026-09-17T21:56:03.411111Z",
    session_id: "01a0b15e-69af-71c7-a54d-213c4df2385e",
    turn_id: "01a0b15e-6a13-7571-9226-48395adeb839",
    type: "chat_tool_call_args_delta",
    tool_call_id: "toolu_012hvs5d2x1BUYDVBXx1dcbo",
    delta: "{\"command\": \"grep -H "
  },
  {
    seq: 44,
    at: "2026-09-17T21:56:03.411567Z",
    session_id: "01a0b15e-69af-71c7-a54d-213c4df2385e",
    turn_id: "01a0b15e-6a13-7571-9226-48395adeb839",
    type: "chat_tool_call_args_delta",
    tool_call_id: "toolu_012hvs5d2x1BUYDVBXx1dcbo",
    delta: "\\\"^id:\\\" flows\"}"
  },
  {
    seq: 61,
    at: "2026-09-17T21:56:04.260935Z",
    session_id: "01a0b15e-69af-71c7-a54d-213c4df2385e",
    turn_id: "01a0b15e-6a13-7571-9226-48395adeb839",
    type: "chat_command",
    tool_call_id: "toolu_012hvs5d2x1BUYDVBXx1dcbo",
    command: "grep -H \"^id:\" flows/*/flow.yaml",
    description: "Print flow ids",
    exit_code: null,
    output_preview: "(Bash completed with no output)",
    truncated: false
  },
  {
    seq: 62,
    at: "2026-09-17T21:56:04.261184Z",
    session_id: "01a0b15e-69af-71c7-a54d-213c4df2385e",
    turn_id: "01a0b15e-6a13-7571-9226-48395adeb839",
    type: "chat_tool_call_finished",
    tool_call_id: "toolu_012hvs5d2x1BUYDVBXx1dcbo",
    status: "ok",
    input: {
      command: "grep -H \"^id:\" flows/*/flow.yaml",
      description: "Print flow ids"
    },
    result_preview: "(Bash completed with no output)",
    truncated: false
  },
  {
    seq: 63,
    at: "2026-09-17T21:56:04.261316Z",
    session_id: "01a0b15e-69af-71c7-a54d-213c4df2385e",
    turn_id: "01a0b15e-6a13-7571-9226-48395adeb839",
    type: "chat_status",
    state: "thinking"
  },
  {
    seq: 167,
    at: "2026-09-17T21:56:16.072525Z",
    session_id: "01a0b15e-69af-71c7-a54d-213c4df2385e",
    turn_id: "01a0b15e-6a13-7571-9226-48395adeb839",
    type: "chat_status",
    state: "streaming"
  },
  {
    seq: 168,
    at: "2026-09-17T21:56:16.075011Z",
    session_id: "01a0b15e-69af-71c7-a54d-213c4df2385e",
    turn_id: "01a0b15e-6a13-7571-9226-48395adeb839",
    type: "chat_text_delta",
    message_id: "msg_011Cf9kvqCZ3yty6EeJeY9H9",
    part_index: 1,
    delta: "Two flows:"
  },
  {
    seq: 169,
    at: "2026-09-17T21:56:16.078906Z",
    session_id: "01a0b15e-69af-71c7-a54d-213c4df2385e",
    turn_id: "01a0b15e-6a13-7571-9226-48395adeb839",
    type: "chat_text_delta",
    message_id: "msg_011Cf9kvqCZ3yty6EeJeY9H9",
    part_index: 1,
    delta: " `judge_panel` and"
  },
  {
    seq: 170,
    at: "2026-09-17T21:56:16.080360Z",
    session_id: "01a0b15e-69af-71c7-a54d-213c4df2385e",
    turn_id: "01a0b15e-6a13-7571-9226-48395adeb839",
    type: "chat_text_delta",
    message_id: "msg_011Cf9kvqCZ3yty6EeJeY9H9",
    part_index: 1,
    delta: " `support_case` (ids"
  },
  {
    seq: 177,
    at: "2026-09-17T21:56:16.187606Z",
    session_id: "01a0b15e-69af-71c7-a54d-213c4df2385e",
    turn_id: "01a0b15e-6a13-7571-9226-48395adeb839",
    type: "chat_usage",
    usage: {
      model: "claude-haiku-4-5-20251001",
      tokens_in: 12,
      tokens_out: 1533,
      thinking_tokens: 0,
      cache_read_tokens: 149197,
      cache_write_tokens: 10941,
      cost_usd: "0.22300950000000003"
    }
  },
  {
    seq: 178,
    at: "2026-09-17T21:56:16.188164Z",
    session_id: "01a0b15e-69af-71c7-a54d-213c4df2385e",
    turn_id: "01a0b15e-6a13-7571-9226-48395adeb839",
    type: "chat_status",
    state: "idle"
  },
  {
    seq: 179,
    at: "2026-09-17T21:56:16.188441Z",
    session_id: "01a0b15e-69af-71c7-a54d-213c4df2385e",
    turn_id: "01a0b15e-6a13-7571-9226-48395adeb839",
    type: "chat_turn_finished",
    backend: "claude",
    model: null,
    stop_reason: "end_turn",
    duration_ms: 24845,
    usage: {
      model: "claude-haiku-4-5-20251001",
      tokens_in: 12,
      tokens_out: 1533,
      thinking_tokens: 0,
      cache_read_tokens: 149197,
      cache_write_tokens: 10941,
      cost_usd: "0.22300950000000003"
    }
  }
]
