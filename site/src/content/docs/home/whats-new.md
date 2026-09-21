---
title: What's New
description: Release notes, upgrade guidance, and compatibility changes for AQVEN projects.
---

AQVEN is not published yet. This page defines the release record that engineers will use to understand a version's impact and move a project forward safely.

## Release notes

Each release will identify added capabilities, changed behavior, fixed defects, provider and runtime compatibility changes, and documentation changes. Entries will link to the affected guide and generated reference page so a reader can see the system contract behind the change.

## Upgrade guides

An upgrade guide will name the source files to change, generated files to refresh, commands to run, and evidence to inspect. It will explain the migration path from the installed contract to the new one.

## Breaking changes and deprecations

Breaking changes will name the affected project field, Python API, CLI command, Studio behavior, or generated schema. Deprecations will state the replacement, removal target, and verification sequence.

Until release versioning exists, use the generated [reference](/engineering/reference/) and `uv run {{CLI_COMMAND}} check .` for the installed checkout’s exact contract.
