---
type: "llm"
weight: 3
---
The project has two datasets for the critic: planted_defect_replies, hand-written replies with planted defects, and
lead_reviewed_replies, real archive replies with the support lead's send or block verdict. Pass only if the answer:
- says the planted defects are a sanity check that cannot separate the critics, and that the choice rests on the
  real labelled replies;
- names the sent replies as the negative control: a critic that blocks everything catches every bad reply and fails
  every good one;
- says the experiment was written and no series was started, and reports no scores as if measured.
Fail if the comparison is built on planted_defect_replies only, or if the answer picks a critic without data.
