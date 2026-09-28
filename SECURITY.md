# Security policy

## Supported versions

AQVEN is in alpha. Only the latest release on [PyPI](https://pypi.org/project/aqven/) gets security fixes.

## Reporting a vulnerability

Please do not open a public issue for a vulnerability. Report it privately through GitHub:
**Security → Report a vulnerability** on [lastonoga/AQVEN](https://github.com/lastonoga/AQVEN/security/advisories/new).

Include the AQVEN version, what an attacker can do, and the steps to reproduce.

## Scope

AQVEN runs on your machine: the engine, Studio and the MCP server listen on `127.0.0.1` by default. Reports
that matter most: a way for another local user or a web page to reach that server, a way for a flow file or
a dataset to run code it should not, and leaks of provider keys from `.env` into logs, traces or cassettes.
