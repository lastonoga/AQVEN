---
title: The AQVEN Project Model
description: Treat project files as source of truth and understand how AQVEN discovers and connects entities.
---

An AQVEN project is a Python module directory with one `aqven.yaml`. YAML files describe entities; colocated Python files implement code references; Markdown files provide prompts and instructions. The loader maps paths to entity IDs, compiles references, and rejects unknown fields.

Generated files such as `types.py`, editor schemas, caches, and local runtime data are derived artifacts. Change YAML or Python source, then run the appropriate generator or check. [Source and Generated Files](/engineering/source-and-generated-files/) lists the boundary; [Names, IDs, and Paths](/engineering/names-ids-and-paths/) covers discovery rules.
