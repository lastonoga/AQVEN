---
title: Local Data and Project Changes
description: Understand source watching, local run data, secrets, and how Studio responds to project edits.
---

Studio reads the selected project and local backend data. Edit YAML, prompts, or Python in your editor; the project backend watches source files and refreshes its index. Run `uv run {{CLI_COMMAND}} check .` when an edit changes a contract.

Project secrets remain in supported environment or secret configuration, not workflow YAML. Run data, blobs, datasets, and local database state belong to the selected project environment. Start Studio through `uv run {{CLI_COMMAND}} dev .` so the UI and backend use the same project root.
