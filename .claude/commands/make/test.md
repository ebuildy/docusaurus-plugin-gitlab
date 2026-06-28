---
name: "Make: Test"
description: Run unit tests with the race detector (runs `make test`)
category: Make
tags: [make, test]
allowed-tools: Bash(make test:*)
---

Run `make test` to run the unit test suite (`go test ./... -race -count=1`).

Report the outcome concisely: confirm all tests passed, or surface the failing tests and their output verbatim if any fail.
