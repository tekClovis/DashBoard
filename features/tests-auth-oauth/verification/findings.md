# tests-auth-oauth findings

Bugs found in `server/src` while writing the specs. Not fixed; each is pinned by an `it.fails` test asserting the correct behaviour.

## #1 Provider handshake failure on a valid login/link state is masked as `401 INVALID_STATE`

- Where: `server/src/auth/oauth/oauth.guard.ts:119-124` (fall-through to `:126-131`).
- What: `runPassport(...)` (line 121) is awaited inside the same bare `try { } catch { }` as `assertBoundState(...)` (line 120). When the state is valid but the provider round trip rejects (token-exchange error, or the `UnauthorizedException` raised for "no user" at line 88), the catch swallows it, the code falls through to `verifyConnectState` (line 128), which cannot verify a login/link state, and the guard throws `UnauthorizedException({ error: 'INVALID_STATE' })` (line 130).
- Effect: the real provider error is lost and reported as a state/CSRF failure. The connect path (line 132, outside any try) does propagate the same errors, so the two paths disagree.
- Pin: `server/src/auth/oauth/oauth.guard.spec.ts:234`, `it.fails('surfaces a provider handshake error on a login state instead of masking it as INVALID_STATE')`.

## #2 Login/link state is not bound to the callback's provider

- Where: `server/src/auth/oauth/oauth.guard.ts:120`, via `assertBoundState` in `server/src/auth/oauth/oauth-state.ts:81-90` and `verifyOAuthState` at `oauth-state.ts:58-60`.
- What: the signed state carries `provider`, but verification only checks that it is one of `github` / `google`; nothing compares it to `this.cfg.provider`. A state signed by the GitHub start leg is accepted by the Google callback (and the reverse), and `OAuthController.handleCallback` does not compare them either. The connect path does enforce this (`verifyConnectState(queryState, this.cfg.provider, ...)`, guard line 128).
- Effect: the cookie binding still holds, so this is a missing defence-in-depth check rather than a CSRF bypass, but `req.oauthState.provider` can disagree with the provider that actually authenticated the user.
- Pin: `server/src/auth/oauth/oauth.guard.spec.ts:346`, `it.fails('rejects a login state that was signed for another provider')`.
