---
title: Process Many Files with Map
description: Apply one typed child node to each item in a declared list with bounded concurrency and item-error policy.
---

Use a map node when input determines the number of items. Choose concurrency from provider or tool capacity, define `on_item_error`, and return a collection with a declared item type. Test an empty list, one item, a failed item, and a large representative batch.

Read [Parallel and Map](/engineering/parallel-and-map/).
