---
name: "Make: E2E"
description: Run integration / e2e tests (runs `make e2e`)
category: Make
tags: [make, test, e2e]
allowed-tools: Bash(make e2e:*)
---

Run `make e2e` to run the integration / e2e test suite under `test/integration/`.

Report the outcome concisely: confirm all tests passed, or surface the failing tests and their output verbatim if any fail.
