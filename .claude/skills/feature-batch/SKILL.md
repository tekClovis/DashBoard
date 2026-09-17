---
name: feature-batch
description: Queue several features into features/queue.md and hand back one /goal command that builds them all unattended — each in an isolated worktree, built by a sub-agent, checked by an adversarial reviewer, then opened as a PR. Use when batching multiple features for an overnight run.
disable-model-invocation: true
---

Register a batch of features and produce the single `/goal` command that runs the factory loop over all of them.

Follow `../CONVENTIONS.md`.

## 1. Intake — one message, whole batch

Ask the user once, for every feature in the batch: **name + one-line scope + one-line done-criteria**. Do not interview feature-by-feature here.

## 2. Ensure every feature exists

Per feature, in order:

- `features/<name>/` exists → reuse it.
- Otherwise invoke `goal-writer`, passing that feature's intake scope + done-criteria. `new-feature` only interviews for what's missing or not checkable.

Complete all folders before writing the queue.

## 3. Write the queue

Write `features/queue.md`. Create if missing; append rows if it exists — never drop existing rows.

```
| Feature | Status | Branch | PR |
| --- | --- | --- | --- |
| <name> | to do |  |  |
```

Status ∈ `to do` | `building` | `done`. New rows start `to do`. Below the table, embed section 4 verbatim.

## 4. Factory loop instructions to embed in queue.md

> ## Factory loop
>
> One row at a time, top to bottom. Never two at once.
>
> 1. Take the first `to do` row → status `building`, Branch cell = `feature/<name>`.
> 2. **Build.** `Agent` tool, `isolation: "worktree"`, branch `feature/<name>`. Give it only: `features/<name>/spec.md`, `features/<name>/mock.html`, and "implement to match both." Before committing, it runs the `simplify` skill on its own diff to cut bloat/over-engineering before Review sees it. It commits on the branch (`git checkout -b`, `git commit`). It must NOT merge, NOT push to main, NOT add any AI co-author or "Generated with" line.
> 3. **Review.** A SEPARATE `Agent` with fresh context — the builder never verifies its own work. Brief it: *"Assume this branch contains at least one defect. Your job is to find it."* Inputs: the branch diff, `spec.md` (its numbered checklist is the pass/fail contract), `mock.html` (built UI must match its flows and states). It reports each checklist item pass/fail with evidence, capturing screenshots via `chrome-headless-shell` into `features/<name>/verification/`.
> 4. **Fail → rebuild.** Fresh build `Agent` on the same branch with the reviewer's findings, then back to step 3. Repeat until it passes.
> 5. **Pass → PR.** `git push -u origin feature/<name>` then `gh pr create --title "<feature>" --body "<body>"`. Body = checklist items (pass/fail + evidence), then screenshots, nothing else. No AI co-author trailer, no "Generated with" line. Do NOT merge — that's the user's call.
> 6. Row → `done`, PR link in the PR cell. Next `to do` row.
>
> **Stop condition:** no row is `to do` or `building`.

## 5. Report

Report-back format. Next = `/goal features/queue.md`. Add one line: loop stops at open PRs, merging stays the user's call.
