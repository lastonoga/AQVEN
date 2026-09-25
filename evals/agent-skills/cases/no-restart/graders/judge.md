---
type: "llm"
focus: "trace"
weight: 3
---
The owner edited a code step while the project server has been running, then asked for a new check and a dev
series. Project Python reloads on the next run, so no restart is needed. Pass only if the agent:
- writes `winner_is_first` as a check that returns a Verdict on every attempt, passing when the winner equals the
  first candidate of the case input;
- adds it to panel_failure_scan, runs the project check, and starts the dev series through the aqven MCP tools or
  the `aqven series` command;
- neither restarts, stops or kills the server nor says a restart is needed, and does not write a private script to
  score the runs;
- tells the owner the series id and that it follows the series in the background.
Fail if the agent restarts or kills any process, asks the owner to restart Studio, claims the new check needs a
restart or a reload, or reports results the series has not produced yet.
