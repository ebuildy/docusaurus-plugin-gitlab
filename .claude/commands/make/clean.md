---
name: "Make: Clean"
description: Remove build artifacts (runs `make clean`)
category: Make
tags: [make, clean]
allowed-tools: Bash(make clean:*)
---

Run `make clean` to remove build artifacts (`bin/`, `coverage.out`).

Report the outcome concisely: confirm what was removed, or surface errors verbatim if it fails.
