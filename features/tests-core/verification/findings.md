# tests-core findings

Bugs found in `server/src` while writing the specs. Not fixed; each is pinned by an `it.fails` test asserting the correct behaviour.

## #1 An empty `JWT_SECRET` passes boot validation

- Where: `server/src/core/config/env.validation.ts:17-18`
- What: `JWT_SECRET` is only `@IsString()`, so an empty value passes validation. `.env.example:4` ships `JWT_SECRET=`, and `docs/Architecture.md:383` (§11) says the server refuses to start without `JWT_SECRET`. With `JWT_SECRET=` the boot check passes and `JwtService.signSegment` (`server/src/auth/jwt.service.ts:58-59`) HMACs session tokens with an empty key.
- Pin: `server/src/core/config/env.validation.spec.ts:58`.

## #2 A malformed cookie escape answers 500 instead of 401

- Where: `server/src/core/http/cookies.ts:11`
- What: `decodeURIComponent` throws `URIError` on a malformed escape (`session=%E0%A4%A`). `JwtGuard.canActivate` (`server/src/auth/jwt.guard.ts:27`) does not catch it, and since it is not an `HttpException`, Nest answers 500 instead of 401. The same unguarded call also runs from `auth/auth.controller.ts:165`, `auth/oauth/oauth.guard.ts:66,118,126,198,199` and `timer/realtime.gateway.ts:163`.
- Pin: `server/src/core/http/cookies.spec.ts:43`.
