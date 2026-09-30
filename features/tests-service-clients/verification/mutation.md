# Mutation spot-check (checklist item 93)

Three reviewer-chosen branches, one per covered file, flipped together (each spec only imports its own source file), then the three new specs were run. Raw output: [mutation-run.txt](mutation-run.txt) (exit 1, 6 failed / 78 passed / 1 expected fail).

| # | File:line | Original | Mutant | New tests that failed |
|---|-----------|----------|--------|-----------------------|
| 1 | `server/src/services/github/github-api.ts:57` | `res.headers.get('x-ratelimit-remaining') === '0'` | `!== '0'` | `github-api.spec.ts > githubGet > maps HTTP 403 with headers { 'x-ratelimit-remaining': '0' } to RATE_LIMITED`; `... { 'x-ratelimit-remaining': '12' } to UPSTREAM_ERROR`; `... {} to UPSTREAM_ERROR` |
| 2 | `server/src/services/youtube/youtube-api.ts:35` | `ctx.expiresAt.getTime() <= Date.now() + EXPIRY_SKEW_MS` | `<` | `youtube-api.spec.ts > youtubeClient > token refresh > with an expiry exactly 60 s ahead, sends the expected token` |
| 3 | `server/src/services/weather/open-meteo.ts:72` | `hit.country ? ... : hit.name` | `!hit.country ? ... : hit.name` | `open-meteo.spec.ts > Geocoder > takes the first of several results`; `open-meteo.spec.ts > Geocoder > names a result without a country by its name alone` |

All three mutants were killed.

Restore: the three source files were put back by hand; `git status --short` afterwards shows only `?? features/tests-service-clients/` (no source change), and the same three specs pass again on the restored sources: [mutation-restored-run.txt](mutation-restored-run.txt) (exit 0).
