---
type: "llm"
weight: 3
---
The experiment critique_by_subtlety asks whether the critic's recall falls as planted defects get subtler. Its only
check, `caught`, passes whenever the critic lowers the score below 0.85 or writes any blocking remark, whatever the
remark is about, and the question pools every case, clean ones included, into one threshold. Pass only if the
answer:
- says `caught` does not measure the claim: it counts a reply as caught even when the critic blocks it for a reason
  unrelated to the planted defect, so it measures "the critic objected", not "the critic found the defect";
- proposes a check tied to the defect each case was planted with, read from the case itself (its `defect` tag, or an
  expected output naming the defect), for example a blocking remark or rationale that names that defect;
- says recall at each subtlety level is read on the cases of that level alone, for example one experiment per level
  selected with `cases.tags` on `subtlety`, or the per-case rows grouped by the `subtlety` tag, and that the clean
  replies (`planted: no`) are a control, not part of recall.
Fail if the answer keeps `caught` as the measure of recall, or computes the per-level rates with its own script or
raw HTTP calls outside the engine.
