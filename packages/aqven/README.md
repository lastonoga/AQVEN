# aqven

Engineering layer for reliable AI workflows. Workflows are files in your repository: YAML next to the Python
they call, compiled to an IR, executed with checkpoints, and checked before they run.

`aqven` carries Studio, the local browser interface, inside the distribution. Installing the package is enough
to create a project and open it — no Node.js toolchain is required.

```bash
uv tool install aqven
aqven new my_project
cd my_project
uv run aqven dev
```

`aqven new` creates the project from a template, installs its environment and generates its models.
`aqven dev` starts the project server and opens Studio. `aqven check` verifies a project statically and
simulates every flow without network access or tokens.

Documentation: https://aqvenstudio.com
