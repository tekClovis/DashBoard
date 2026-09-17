---
name: goal-writer
description: Turn a feature idea into a spec.md written as a runnable /goal, with its own verification folder and prototype mock. Use when the user wants to set up a feature to run as an autonomous loop instead of building it interactively.
disable-model-invocation: true
---

Turn a feature idea into a spec that can be handed to `/goal` and left to run unattended.

Follow `../CONVENTIONS.md`.

## 1. Define the feature

Invoke `new-feature`, passing through any scope/done-criteria the caller already supplied. It writes `features/<name>/spec.md`, `features/<name>/verification/`, and `features/<name>/mock.html`.

## 2. Make the spec runnable as a goal

Append to `features/<name>/spec.md`:

- **Verification**: score the work against the numbered checklist every turn; UI criteria are checked against `features/<name>/mock.html` (built result must match the prototype's flows and states); evidence via `chrome-headless-shell` into `features/<name>/verification/`.
- **Exit condition**: done only when every checklist item passes.
- Closing line: `Run this with /goal features/<name>/spec.md`.

## 3. Report

Report-back format. Next = `/goal features/<name>/spec.md`.
