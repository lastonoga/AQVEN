---
type: "llm"
weight: 3
---
The reader is the head of support, outside the project. The journal holds a holdout result on real replies (the
critic now stops 72% of the real defective replies, up from 58%, +13 points, on 60 real defective replies out of 150
reviewed) and several synthetic results. Pass only if the answer:
- is two or three sentences (one short closing offer of details is fine);
- opens with the result on real replies: the share stopped now, the change against before in points (13 or 14 by
  rounding) and how many real replies it rests on (60 defective, or 150 in all);
- mentions synthetic or planted-defect results only after the real-data result, or not at all, and never mixes them
  into the real numbers;
- uses no internal names (experiment, prompt or check ids such as claims_first or critique_real_replies) without
  saying in plain words what they are.
Fail if the answer opens with a synthetic or dev result, gives shares without the change or without the count, or
reads like an engineering log.
