---
name: "Make: Build"
description: Build the plugin binary into ./bin (runs `make build`)
category: Make
tags: [make, build]
allowed-tools: Bash(make build:*)
---

Run `make build` to compile the `kubectl-notify` plugin binary into `./bin`.

Report the outcome concisely: confirm success and the artifact path, or surface the build errors verbatim if it fails.
