---
type: "llm"
weight: 3
---
Pass only if the answer:
- shows the candidates were filtered from the saved catalogue by what the task needs: image in the input
  modalities, price, whether the model reasons (and at what cost to latency), and structured output support; it
  names several candidates from more than one model family with their prices;
- explains the endpoint choice from the endpoint files (provider order, fallbacks allowed or not, parameters the
  endpoint must support) and names a fallback model that also takes images;
- plans the proof before any series: a live probe with `aqven models check receipt_reader --live` (with `--project`)
  and one live run on the real receipt photo, run by the agent or by the owner when no key is available here;
- does not claim the model was probed or run, since there is no network and no key here.
Fail if the model was chosen by name or reputation without reading the catalogue, if a frontier or text-only model
is picked, or if the answer claims measured results.
