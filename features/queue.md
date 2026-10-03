# Feature queue

Worked by the factory loop below, started with the `/goal` command that `/feature-batch` printed. Merging stays with you.

## Factory loop

One row at a time, top to bottom, never two at once. `<f>` = the row's feature, `<root>` = this repo's root, `<wt>` = the path `git worktree list` shows for branch `feature/<f>`. Each sub-agent replies in one line and leaves the details in files, which keeps this context small.

1. **Claim**: first `to do` row → `building`, Branch = `feature/<f>`. If `<root>/features/<f>/spec.md` has a `Depends on: <g>` line, `<base>` = `feature/<g>`; if `<g>`'s row is `blocked`, set this row `blocked` and claim the next one. A `building` row left by an interrupted run resumes at step 3 if `feature/<f>` exists.
2. **Build**: `Agent` with `isolation: "worktree"`: "Run `git switch -c feature/<f> <base>` (no `<base>` if none). Implement to match `<root>/features/<f>/spec.md` and `<root>/features/<f>/mock.html`, nothing more, following the `superpowers:test-driven-development` skill when it's available. Run the `simplify` skill on your diff, then commit. Never merge or push. Reply `built`."
3. **Review**: a separate `Agent`, fresh context, no isolation; the builder never grades its own work. "Work in `<wt>` and don't edit code. Assume branch `feature/<f>` has at least one defect, and find it. The contract is the numbered checklist in `<root>/features/<f>/spec.md` plus every flow and state of `<root>/features/<f>/mock.html`. Only a contract miss is a FAIL; list anything else as notes. Recreate `features/<f>/verification/` empty, launch the app (with the project's run skill if it has one) and capture evidence there: with `agent-browser` when it's installed (`open <url>`, `snapshot -i`, `click @<ref>`, `screenshot <file>`), otherwise `chrome-headless-shell --screenshot=<file> <url>` for each state a URL reaches. Stop what you started. Write `features/<f>/verification/review.md` as the PR body: each checklist item PASS/FAIL with its evidence link, then the screenshots as images from `https://github.com/<owner>/<repo>/blob/feature/<f>/features/<f>/verification/<file>?raw=true`. Nothing else. Reply `PASS` or `FAIL`."
4. **FAIL**: a fresh `Agent`, no isolation: "In `<wt>`, fix every FAIL in `features/<f>/verification/review.md` (test first when `superpowers:test-driven-development` is available), then commit." Back to step 3. On the third FAIL, run step 5 with `gh pr create --draft` and set the row to `blocked` instead of `done`.
5. **PASS**: in `<wt>`, run `git add features/<f>/verification`, `git commit -m "<f>: verification evidence"`, `git push -u origin feature/<f>` and `gh pr create --title "<f>" --body-file features/<f>/verification/review.md` (add `--base <base>` when there is one). Row → `done`, PR = the URL. Next row.

Never merge. No commit or PR gets an AI co-author trailer or "Generated with" line.
Stop when no row is `to do` or `building`.

| Feature | Status | Branch | PR |
| --- | --- | --- | --- |
| tests-auth-oauth | done | feature/tests-auth-oauth | https://github.com/tekClovis/dashBoard/pull/15 |
| tests-dashboards | done | feature/tests-dashboards | https://github.com/tekClovis/dashBoard/pull/16 |
| tests-realtime | done | feature/tests-realtime | https://github.com/tekClovis/dashBoard/pull/17 |
| tests-service-clients | done | feature/tests-service-clients | https://github.com/tekClovis/dashBoard/pull/18 |
| tests-connections | blocked | feature/tests-connections | https://github.com/tekClovis/dashBoard/pull/19 |
| tests-core | done | feature/tests-core | https://github.com/tekClovis/dashBoard/pull/20 |
| fix-pinned-bugs | done | feature/fix-pinned-bugs | https://github.com/tekClovis/dashBoard/pull/21 |
| mockui-foundation | done | feature/mockui-foundation | https://github.com/tekClovis/dashBoard/pull/22 |
| mockui-shell | done | feature/mockui-shell | https://github.com/tekClovis/dashBoard/pull/23 |
| mockui-auth | done | feature/mockui-auth | https://github.com/tekClovis/dashBoard/pull/24 |
| mockui-widget-frame | done | feature/mockui-widget-frame | https://github.com/tekClovis/dashBoard/pull/29 |
| mockui-dashboard | blocked | feature/mockui-dashboard | https://github.com/tekClovis/dashBoard/pull/30 |
| mockui-add-widget | blocked |  |  |
| mockui-services-profile | done | feature/mockui-services-profile | https://github.com/tekClovis/dashBoard/pull/26 |
| mockui-admin | blocked | feature/mockui-admin | https://github.com/tekClovis/dashBoard/pull/27 |
