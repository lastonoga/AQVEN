# One ballot or a pair of ballots

**Purpose:** choosing a pattern for a step (two flows compared in one slot).

In `support_case`, three cheap ballots vote on the intent. A cheaper design is one ballot; a sturdier one is two
ballots that read the case from opposite sides, the customer's words and the evidence, with the more confident one
kept. The hypothesis is that the pair gets the intent of a long message right more often than one ballot, without
more outputs failing their schema on the first try.

**Subject.** The local flow `intent_decision` (`flows/intent_decision/`) is a slot: one `call` node, `ballots`, that
passes the whole case on and returns the `IntentBallot` it gets back. As written it calls the local flow `single`.

**Variants.** The factor is the flow called at the slot (`varies: what: flow, nodes: [ballots]`).

| Variant | `ballots` calls | Steps |
|---|---|---|
| `single` | `single` (as written) | the product's `prepare` and `triage`, then one `ballot` with no perspective |
| `pair` | `pair` | the same `prepare` and `triage`, a `words` and an `evidence` ballot, then `settle` keeps the more confident |

Both flows take a `CaseRequest` and return an `IntentBallot`, the contract a flow factor checks, and both ballots run
on the `llama` agent, so the only difference is the pattern. A pair on another agent is a second factor: compare
agents in their own experiment once the pattern is chosen.

**Checks.** `intent` is the built-in `expected` check on the intent a support lead assigned in
`long_customer_messages`.

**Reading the result.** `pair` has to beat `single` on `intent` by more than 0.05, and `schema_valid_first_try` may drop
by at most 0.05: the pair makes two calls, and each can fail its schema.
