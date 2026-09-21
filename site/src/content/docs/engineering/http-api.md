---
title: HTTP API
description: Use the local project server from another process through typed REST endpoints and run event streams.
---

`uv run {{CLI_COMMAND}} serve .` starts the AQVEN project server without opening Studio. `uv run {{CLI_COMMAND}} dev .` starts the same project backend and opens Studio. The server exposes REST under `/api`, an OpenAPI document at `/api/openapi.json`, and MCP at `/mcp/`.

## Main resources

| Resource | What it provides |
| --- | --- |
| `/api/project` | Project status and available local surfaces. |
| `/api/runs` | Start and list runs. |
| `/api/runs/{run_id}` | Run snapshot. |
| `/api/runs/{run_id}/events` | Server-sent run events. |
| `/api/runs/{run_id}/executions` | Node executions and details. |
| `/api/runs/{run_id}/resume` | Resume a human or approval wait. |
| `/api/runs/{run_id}/fork` | Create a related run from an execution address. |
| `/api/runs/{run_id}/cancel` | Cancel outstanding work. |
| `/api/files` | Project file metadata. |
| `/api/openapi.json` | Machine-readable API contract. |

## Start a run

A run request names a flow, a mode, and exactly one input source: inline input or a dataset item. It can also provide run context, a node range, boundary outputs for that range, a cassette, and scripted human answers. Let generated OpenAPI types define the exact request fields.

## Follow events

The events endpoint uses server-sent events. Each event has a sequence number so a client can reconnect with `Last-Event-ID` or `after_seq`. Treat the final `run_finished` event as the terminal event for a stream.

## Local boundary

The current server is a project-local surface. It is designed for the project backend, Studio, local Python clients, and the project MCP bridge. Read [Safety and Reliability](/engineering/safety-and-reliability/) before exposing it beyond that boundary.

The server's `/api/openapi.json` document is the raw contract for the exact endpoint schemas. Use [Python API](/engineering/python-api/) if your integration is Python.
