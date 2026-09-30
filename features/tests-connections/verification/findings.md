# tests-connections findings

Bugs found in `server/src` while writing the specs. Not fixed; each is pinned by an `it.fails` test asserting the correct behaviour.

## #1 GitHub disconnect revokes with the login app's credentials, not the connect app's

- Where: `server/src/connections/provider-revoke.ts:16-17` (used at `:19` for the URL and `:22` for the Basic auth header).
- What: `revokeAtProvider('github', …)` always reads `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET`.
- Why it is wrong: connect tokens are issued to the connect OAuth app. `server/src/connections/strategies/github-connect.strategy.ts:24-26` prefers `GITHUB_CONNECT_CLIENT_ID` / `GITHUB_CONNECT_CLIENT_SECRET` and only falls back to the login pair. With a separate connect app configured, `DELETE https://api.github.com/applications/{login-id}/grant` is sent for a token that belongs to another app, so GitHub does not revoke the grant. The response status is never checked and the call is best-effort, so disconnect still returns `{ ok: true }`.
- Impact: after "disconnect", the `repo` / `security_events` grant stays live at GitHub whenever the connect app differs from the login app.
- Correct behaviour: resolve credentials the way the strategy does (connect pair first, login pair as fallback), as `googleConnectClient` already does for Google in `server/src/connections/strategies/google-connect.strategy.ts:17-22`.
- Pin: `server/src/connections/provider-revoke.spec.ts:52`, `it.fails('revokes the GitHub grant with the connect app credentials when they are configured')`.
