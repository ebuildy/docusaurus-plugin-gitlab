---
name: "Make: Install"
description: Install the binary to ~/bin as a kubectl plugin (runs `make install`)
category: Make
tags: [make, install]
allowed-tools: Bash(make install:*)
---

Run `make install` to build and install `kubectl-notify` into `~/bin` so `kubectl` can discover it as `kubectl notify`.

Report the outcome concisely: confirm the install path, or surface errors verbatim if it fails.
