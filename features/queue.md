| Feature | Status | Branch | PR |
| --- | --- | --- | --- |
| auth-session | done | feature/auth-session | https://github.com/tekClovis/dashBoard/pull/1 |
| oauth-login | done | feature/oauth-login | https://github.com/tekClovis/dashBoard/pull/2 |
| connections-api | done | feature/connections-api | https://github.com/tekClovis/dashBoard/pull/3 |
| catalog-api | building | feature/catalog-api |  |
| dashboards-api | to do |  |  |
| timer-realtime | to do |  |  |
| frontend-shell | to do |  |  |
| widget-grid-ui | to do |  |  |
| admin-ui | to do |  |  |

## Factory loop

One row at a time, top to bottom. Never two at once.

1. Take the first `to do` row → status `building`, Branch cell = `feature/<name>`.
2. **Build.** `Agent` tool, `isolation: "worktree"`, branch `feature/<name>`. Give it only: `features/<name>/spec.md`, `features/<name>/mock.html`, and "implement to match both." It commits on the branch (`git checkout -b`, `git commit`). It must NOT merge, NOT push to main, NOT add any AI co-author or "Generated with" line.
3. **Review.** A SEPARATE `Agent` with fresh context — the builder never verifies its own work. Brief it: *"Assume this branch contains at least one defect. Your job is to find it."* Inputs: the branch diff, `spec.md` (its numbered checklist is the pass/fail contract), `mock.html` (built UI must match its flows and states). It reports each checklist item pass/fail with evidence, capturing screenshots via `chrome-headless-shell` into `features/<name>/verification/`.
4. **Fail → rebuild.** Fresh build `Agent` on the same branch with the reviewer's findings, then back to step 3. Repeat until it passes.
5. **Pass → PR.** `git push -u origin feature/<name>` then `gh pr create --title "<feature>" --body "<body>"`. Body = checklist items (pass/fail + evidence), then screenshots, nothing else. No AI co-author trailer, no "Generated with" line. Do NOT merge — that's the user's call.
6. Row → `done`, PR link in the PR cell. Next `to do` row.

**Stop condition:** no row is `to do` or `building`.

## Note on feature order and cross-dependencies

Several specs above declare a dependency on an earlier feature (e.g. `oauth-login` reuses `auth-session`'s cookie-signing helper; `dashboards-api` reads `catalog-api`'s validator; `widget-grid-ui` consumes `frontend-shell`'s hooks). The table order already reflects a dependency-respecting build order from `docs/Architecture.md`'s build-order section. Because each feature builds in an isolated worktree branched off `main`, a builder agent for a later row may not see an earlier row's branch if it hasn't been merged to `main` yet — each spec says to code against the documented contract (the dependency's own spec.md) and flag any mismatch for reconciliation when the PRs are eventually merged, rather than blocking the loop.
