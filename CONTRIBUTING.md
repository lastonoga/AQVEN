# Contributing to AQVEN

Thank you for looking. AQVEN is in alpha and changes quickly, so please open an
[issue](https://github.com/lastonoga/AQVEN/issues) before a larger change: it saves both of us a rewrite.

## Set up

You need [mise](https://mise.jdx.dev/); it installs the pinned Python, Node, uv and pnpm.

```bash
mise run install   # both workspaces, and the git hooks
mise run check     # what CI gates on: lint, every test suite, reference and skill checks
```

`mise run lint`, `mise run types` and `mise run test` run the parts separately.

## Rules the code follows

The full list is in [CLAUDE.md](CLAUDE.md); coding agents read the same file. In short:

- No comments in code; names explain themselves. The public API of `aqven` and `aqven-llm` is the exception:
  it has docstrings, and `uv run python tools/generate_reference.py` regenerates the API reference after a
  change to it.
- Flat code: guard clauses and lookup tables instead of nested `if`/`else`.
- Strict typing: pyright strict for the engine, strict TypeScript for Studio, no `Any` or `any`.
- Tests run offline, on cassettes and stand-in models.

## License of contributions

AQVEN is source-available under the [AQVEN License 1.0.0](LICENSE). A contribution is licensed under the
same terms.
