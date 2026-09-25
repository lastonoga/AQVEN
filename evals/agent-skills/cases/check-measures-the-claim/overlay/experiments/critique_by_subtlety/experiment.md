# Does the critic miss subtler defects?

**Question.** Does the critic's recall fall as a planted defect gets subtler?

**Subject.** The local flow `critic_alone`: the project's `critique` inference with the `deepseek` agent on a finished
reply, returning the critique as it is.

**Cases.** `graded_defect_replies`: two scenarios, each with a clean reply (`planted: no`) and three copies carrying
one planted defect at a growing level of subtlety (`subtlety`: `obvious`, `moderate`, `subtle`). The `defect` tag names
the defect: `wrong_amount` changes the credit amount, `unsupported_claim` adds a delivery time no chunk states.

**Check.** `caught`: the critique scores the reply below the approval threshold of 0.85 or has a blocking remark.
