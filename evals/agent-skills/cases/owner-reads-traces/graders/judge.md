---
type: "llm"
weight: 3
---
The look ran the polish loop on 4 regression cases, 5 attempts each: 13 attempts failed the `promises` or the
`critique` check and one ended in a provider error. No failure modes are recorded for this flow yet. Pass only if the
answer:
- lines up the failed attempts for the owner to read, each with its run link (`/runs/<run_id>`), its case and the
  check that failed, failures first, and names the provider error as infrastructure, apart from the rest;
- asks the owner to read them and write a short note on each, and says the failure modes come from those notes;
- does not name failure categories of its own beyond which check failed on which case, and does not propose
  hypotheses, fixes or new experiments before the owner's notes.
Fail if the answer invents a taxonomy of failures, jumps to a fix or an experiment, or reports averages as the
answer.
