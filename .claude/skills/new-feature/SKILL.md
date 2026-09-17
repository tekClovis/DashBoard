---
name: new-feature
description: Interview a feature idea into a features/<name>/ folder with spec.md, an empty verification/ dir, and a clickable prototype mock. Use when defining a feature to build without putting it on a loop.
disable-model-invocation: true
---

Turn one feature idea into a spec'd, mocked feature folder. No loop/goal semantics here — that's `goal-writer`.

Follow `../CONVENTIONS.md` for project root, interview style, report-back format, and the `spec.md` template.

## 1. Name

Get a short kebab-case feature name. Ask only if the caller didn't supply one.

## 2. Gather what's missing

The caller may already have supplied scope and done-criteria (e.g. `feature-batch` intake). Use what's given; interview only for what's missing or too vague to be checkable:

1. What should this feature do? What's explicitly out of scope for this pass?
2. Reference design, existing pattern, or project skill to follow?
3. How is "done" verified — concrete pass/fail criteria a checker could score turn over turn?
4. Constraints — files not to touch, dependencies on in-progress work?

## 3. Write

- `features/<name>/spec.md` — use the `spec.md` template.
- `features/<name>/verification/` — empty directory.

## 4. Prototype

Invoke `functional-ui` for this feature.

## 5. Report

Report-back format. Do not mention `/goal` — that's `goal-writer`'s job.
