# loop/ — the software factory loop

Take a feature from idea to an open pull request without babysitting the build. Inspired by the "software factory loop" level of loop engineering: plan features, put them on a queue, let sub-agents build and adversarially review each one, then hand you a PR to merge.

You do two things: **plan** the feature(s), and give **final merge approval**. Everything in between — writing the spec, building the mock, writing the code, reviewing it, opening the PR — runs unattended.

## The chain

```
feature-batch  →  goal-writer  →  new-feature  →  functional-ui
(batch entry)     (single-feature   (interview →    (clickable
                    entry)           spec.md)        HTML mock)
```

Only `feature-batch` and `goal-writer` are meant to be invoked directly (`disable-model-invocation: true` on all four keeps them from auto-triggering — you call them by name). `new-feature` and `functional-ui` are internal plumbing, always reached through one of the two entry points.

`CONVENTIONS.md` is not a skill — it's a shared reference (project-root detection, interview style, output templates, tooling, the no-attribution rule) that every skill here points to instead of restating.

## Skills

### `feature-batch` — plan a batch, run it overnight
Entry point when you have several features to build in one pass.
1. Asks once, for the whole batch: name + one-line scope + one-line done-criteria per feature.
2. For each feature, reuses its `features/<name>/` folder if it exists, otherwise runs `goal-writer` (which interviews only for whatever the batch intake didn't already answer).
3. Writes `features/queue.md`: a table (`Feature | Status | Branch | PR`) plus the embedded **factory loop instructions** — what `/goal` must do for each row: build in an isolated git worktree, adversarially review, open a PR, repeat until no row is `to do` or `building`.
4. Hands you: `/goal features/queue.md`.

### `goal-writer` — plan one feature, run it as a loop
Entry point for a single feature you want to build unattended.
1. Runs `new-feature` (interview → spec → mock).
2. Turns the spec into a runnable goal: adds a verification section (score against the checklist every turn, UI checked against the mock, evidence via `chrome-headless-shell`) and an exit condition.
3. Hands you: `/goal features/<name>/spec.md`.

### `new-feature` — interview a feature into a spec (internal)
Turns one idea into a folder: `features/<name>/spec.md` (Scope / Non-goals / Verification checklist / Constraints) and an empty `features/<name>/verification/`. Interviews one question at a time, skipping anything already supplied by the caller or derivable from the codebase. Pushes back on unverifiable "done" criteria ("looks good" isn't checkable). Then calls `functional-ui`.

### `functional-ui` — build the clickable prototype (internal)
Creates `mocks/index.html` once per project — a static, no-backend clickable prototype of the whole app — and, for every feature, `features/<name>/mock.html`: a scoped derivative where the new/changed flow actually clicks through. This mock is the thing the loop checks the real build against, and the thing you can click through yourself to confirm the plan is right *before* any code gets written.

## The factory loop (what `/goal features/queue.md` actually does)

Per row, one at a time:

1. `to do` → `building`, branch = `feature/<name>`.
2. **Build** — a sub-agent (`Agent`, `isolation: "worktree"`) implements the feature from `spec.md` + `mock.html` alone, runs the `simplify` skill on its own diff to cut bloat before Review sees it, then commits on the branch. Never merges, never pushes to main.
3. **Review** — a *separate* sub-agent, fresh context, told to assume a defect exists. Checks the diff against the spec's checklist and the mock. The builder never grades its own work.
4. **Fail** → back to a fresh build sub-agent with the review notes → review again.
5. **Pass** → push the branch, `gh pr create` (checklist + evidence + screenshots, nothing else, no AI attribution). Row → `done` with the PR link.
6. Stops when no row is `to do` or `building`.

You never see a failed attempt — only the final PR, ready to review and merge.

## Artifacts (written into the *target* project, not this repo)

| Path | Written by | Purpose |
| --- | --- | --- |
| `mocks/index.html` | `functional-ui` | Whole-app clickable prototype, created once |
| `features/<name>/spec.md` | `new-feature` | Scope, non-goals, verification checklist, constraints |
| `features/<name>/mock.html` | `functional-ui` | Scoped clickable prototype for this feature |
| `features/<name>/verification/` | filled during the loop | Screenshots/evidence from the review step |
| `features/queue.md` | `feature-batch` | Batch tracker + embedded factory loop instructions |

## Quick start

- One feature, run as a loop: `/goal-writer` → then run the `/goal` command it gives you.
- Several features, overnight: `/feature-batch` → then run `/goal features/queue.md`.
- Just want a spec, no loop: `/new-feature` directly.
