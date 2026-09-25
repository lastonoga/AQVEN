---
type: "llm"
weight: 3
---
In the support_case flow the draft nodes (gpt, mistral, gemini under drafts) never see the customer's raw message:
their `summary` input is `$triage.out.summary`, a summary of at most 600 characters written by the triage step, and
they also get the decision (`$route.out.resolution`) and the knowledge-base chunks. The experiment's subject
`draft_on_message` feeds the raw message and nothing else. Pass only if the answer:
- names this mismatch: the experiment tests an input production never sends, so its result says nothing about the
  production drafts;
- restates the owner's question in plain words, for example whether the reply production writes still answers the
  real request when a long message opens with a side topic, which depends on what the triage summary keeps as well
  as on the draft;
- proposes a subject that reproduces the production path (for example the support_case flow run through triage and
  the drafts, or the drafts fed triage summaries), and asks the owner to confirm before building it.
Fail if the answer keeps the raw-message subject and only tunes the check, the threshold or the plan, or if it
rewrites the experiment without first asking the owner.
