import type { ApiChatSession, ApiChatStatus } from "@/domain"

export const liveChatStatus: ApiChatStatus = {
  "backend": "claude",
  "state": "logged_in",
  "method": "subscription",
  "account": "lastonoga@gmail.com",
  "detail": "lastonoga@gmail.com's Organization"
}

export const liveChatSessions: readonly ApiChatSession[] = [
  {
    "session_id": "01a0b15e-69af-71c7-a54d-213c4df2385e",
    "backend": "claude",
    "project_root": "/Users/kirunya/Projects/my/ai-workflows-automate/examples/lumen",
    "flow_id": null,
    "model": null,
    "permission_mode": "default",
    "created_at": "2026-09-17T21:55:49.808312Z",
    "last_seq": 284
  }
]
