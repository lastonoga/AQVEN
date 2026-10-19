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

## Where the design docs are

AQVEN's internal design documentation — `docs/` with DECISIONS.md, the ADRs, the roadmap and the source
specs — is deliberately local to the maintainers and is not shipped with this repository. When
[CLAUDE.md](CLAUDE.md) or a commit message points at `docs/...` or cites `ADR-NNNN`, it names that private
working history, not a file you can open here. What matters to users is published instead: the
[documentation site](https://aqvenstudio.com) describes current behavior and decisions, and user-facing
changes are carried in release notes and the changelog as releases ship. Questions about why something is
the way it is are exactly what [GitHub Discussions](https://github.com/lastonoga/AQVEN/discussions) is
for — ask there.

## License of contributions

AQVEN is source-available under the [AQVEN License 1.0.0](LICENSE). A contribution is licensed under the
same terms.
