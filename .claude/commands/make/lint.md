---
name: "Make: Lint"
description: Run golangci-lint over the codebase (runs `make lint`)
category: Make
tags: [make, lint]
allowed-tools: Bash(make lint:*)
---

Run `make lint` to run `golangci-lint` over the codebase.

Report the outcome concisely: confirm clean, or list the reported issues with their `file:line` locations if any are found.
