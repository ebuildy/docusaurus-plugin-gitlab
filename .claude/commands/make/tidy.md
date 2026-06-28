---
name: "Make: Tidy"
description: Tidy go.mod / go.sum (runs `make tidy`)
category: Make
tags: [make, deps]
allowed-tools: Bash(make tidy:*)
---

Run `make tidy` to tidy `go.mod` / `go.sum` (`go mod tidy`).

Report the outcome concisely: confirm success and note any module additions/removals, or surface errors verbatim if it fails.
