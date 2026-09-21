---
title: Run a Dataset
description: Start one or many dataset cases and select a partial flow range when needed.
---

On **Datasets**, choose one case for focused reproduction or several cases for a batch. The dataset remains source-backed, and every started run records its dataset/case identity.

![Choose a dataset, search for cases, and select the cases to run.](/images/studio/dataset-controls.png)

For a partial flow range, select a start and end node. Studio validates that every chosen case supplies required inputs, context, and skipped upstream values. Add `node_outputs` fixtures where the preview reports a missing boundary. [Dataset Batches](/studio/dataset-batches/) covers progress and results.
