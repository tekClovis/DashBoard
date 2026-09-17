# loop/ shared conventions

Referenced by all four `loop/` skills. Read once; don't restate.

## Project root
Current working directory, or its git repo root.

## Interview style
One question at a time, wait for the answer. Give a recommended answer with each question. Skip any question answerable by exploring the codebase.

## Report-back format
One line: `Created: <path(s)>. Next: <command, or "none">.`

## spec.md template
```
## Scope
## Non-goals
## Verification checklist
## Constraints
```
Verification checklist = numbered, concrete, checkable criteria only ("looks good" is not checkable — push back and ask for something a checker could score turn over turn).

## PR body template
Checklist items (pass/fail + evidence link), then screenshots. Nothing else.

## Attribution
Never add an AI co-author trailer or "Generated with" line to any commit or PR this skill chain creates.

## Tooling
- Screenshots/visual evidence: always the `chrome-headless-shell` tool.
- Branch/commit/PR: `git` and `gh` via Bash — use actual subcommands (`git checkout -b <branch>`, `git push -u origin <branch>`, `gh pr create --title ... --body ...`), never "open a PR" left implicit.
- Sub-agent isolation: `Agent` tool with `isolation: "worktree"`.
