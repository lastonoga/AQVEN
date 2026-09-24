# Local development

- Use one Lumen development stack per checkout: one aqven backend and one Studio Vite server. Before starting anything, check whether the existing stack is healthy and reuse it. Coordinate with any active task using the stack before restarting it.
- Subagents in this checkout share the same process table and servers. A new agent does not need a private backend or Vite instance. The development launcher holds an ownership socket so concurrent launcher commands cannot both start a stack.
- Start the stack from the repository root with `corepack pnpm dev`. It watches Python in `aqven`, `aqven-llm`, and `examples/lumen`, restarts the sole backend after Python edits, keeps aqven's project file watcher active, and uses Vite hot reload for Studio.
- Default addresses are `http://127.0.0.1:5200` for the backend and `http://127.0.0.1:5173` for Studio. `AQVEN_DEV_BACKEND_PORT`, `AQVEN_DEV_STUDIO_PORT`, and `AQVEN_DEV_DATA_DIR` override them. Keep the same data directory when replacing a running stack.
- For interactive development, do not start ad hoc `aqven studio`, `python -m lumen`, uvicorn, or another Vite instance for this project. If the stack must be replaced, stop its current processes first; never run two backend instances against the same project database.

# Change workflow

- Before implementing any requested change, inspect the affected project area and relevant rules or authoritative references, then show the proposed behavior or design to the user and wait for approval. For UI changes, share a visual card or layout preview first. Keep this step proportionate to the change, but do it for every request.
- After approval, implement and verify the change with relevant tests and a rendered UI check when applicable. Do not make the live app the user's first opportunity to review a visual design.

# Studio dialogs

- In the run dataset dialog, keep the "Current dataset file" and "Used for this run" tabs visible while the tab content scrolls. Show only the case recorded for the selected run in both tabs; show the full dataset case list on the flow's Cases tab.
- Leave a visible gap between a search field and the first result. Check spacing both at the top and after scrolling a long dialog.
