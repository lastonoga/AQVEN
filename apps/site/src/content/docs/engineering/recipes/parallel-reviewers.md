---
title: Run Independent Reviewers in Parallel
description: Fan out fixed independent review steps, then join them under a named policy.
---

Use parallel for a known set of independent branches such as policy, quality, and safety review. Each child returns a typed result. Choose a join policy that states whether all results, a quorum, or failure behavior is required. Do not use parallel to repeat the same model opinion without an independent signal.

Read [Parallel and Map](/engineering/parallel-and-map/).
