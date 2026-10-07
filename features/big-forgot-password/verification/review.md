# Review: big-forgot-password

**Verdict: PASS.** All 11 checklist items pass, and so does every flow and state in `mock.html`. The FAIL from the last review is fixed by `53dc445`: "Use another email" now brings back an empty form with no error ([04](04-forgot-use-another-email.png), which matches the mock in [20](20-mock-use-another-email.png)). A unit test now checks the field value.

Setup:
- The branch ran as its own Docker stack (`fpverify`: server on :18080, Mailpit on :18025), with fresh Postgres and Redis and a throwaway env file. The user's running stack was left alone.
- The UI was driven with `agent-browser`.
- I then removed the stack, its volume, its image and the browser session.
- All evidence was captured again from scratch for this review.

## Checklist

| # | Item | Result | Evidence |
|---|---|---|---|
| 1 | The login page shows a "Forgot password?" link that opens `/forgot-password`; both pages work while logged out | PASS | [01](01-login-forgot-link.png), [02](02-forgot-form.png) (clicking the link goes to `/forgot-password`), [08](08-reset-form.png). The browser had no session |
| 2 | Existing, unknown and OAuth-only emails all get the same "If an account exists, we sent a link" message and the same 200 body | PASS | [03](03-forgot-sent-existing.png), [05](05-forgot-sent-unknown.png), [06](06-forgot-sent-oauth.png), [api-forgot.txt](api-forgot.txt) (`{"ok":true}` with HTTP 200 for all three) |
| 3 | A password account gets one mail with a working `/reset-password?token=` link; unknown and OAuth-only emails get no mail | PASS | [api-forgot.txt](api-forgot.txt) (1 / 0 / 0 messages), [07](07-mailpit-reset-email.png). The link from that mail was used for the reset in [08](08-reset-form.png) to [12](12-login-after-reset.png) |
| 4 | A 2nd request within 60 s, or a 6th within 24 h, sends no mail and still returns 200 | PASS | [api-forgot.txt](api-forgot.txt) (bob: 1 mail after 2 requests; carol: 5 mails after 6 requests, all 200, daily counter 6 with a TTL of about 24 h) |
| 5 | On `/reset-password`, a password that fails the pattern, or a confirmation that doesn't match, shows an inline error and sends no request | PASS | [09](09-reset-pattern-error.png), [10](10-reset-mismatch-error.png), [24](24-reset-mismatch-375.png). A wrapped `fetch` logged `[]` after both submits, and focus moved to the field with the error |
| 6 | A valid reset returns 200, goes to login with a success message, and the new password works while the old one fails | PASS | [api-reset.txt](api-reset.txt) (reset 200, old password 401, new password 200), [11](11-reset-valid-filled.png), [11a](11a-reset-updating.png), [12](12-login-after-reset.png), [13](13-login-old-password-fails.png), [14](14-login-new-password-ok.png) (lands on `/d/<id>`) |
| 7 | A reused, expired (over 1 h) or garbage token returns 400, and the page shows "Link invalid or expired" with a link back to `/forgot-password` | PASS | [api-reset.txt](api-reset.txt) (400 `INVALID_TOKEN` 3 times), [15](15-reset-reused-token.png), [16](16-reset-garbage-token.png), [17](17-reset-expired-token.png) (real token with `expiresAt` moved into the past; the browser saw `/api/auth/reset-password 400`), [18](18-reset-no-token.png). "Request a new link" goes to `/forgot-password` |
| 8 | After a reset, a session cookie from before it gets 401 on `/auth/me` | PASS | [api-reset.txt](api-reset.txt) (200 before the reset, 401 after; `tokenVersion` went from 0 to 1) |
| 9 | The DB stores only the token hash; the raw token appears only in the email | PASS | [api-forgot.txt](api-forgot.txt): the DB `tokenHash` equals sha256 of the raw token. The raw token was found in 0 lines of a full `pg_dump`, 0 server log lines and 0 Redis keys or values. TTL is 59 min |
| 10 | Unit tests cover the service (issue, expiry, reuse, tokenVersion bump) and both pages; e2e covers both endpoints, including enumeration and rate limits | PASS | [unit-server-feature-verbose.txt](unit-server-feature-verbose.txt) (`password-reset.service.spec.ts`, controller, mail), [unit-web-feature-verbose.txt](unit-web-feature-verbose.txt) (Forgot, Reset and Login pages), [e2e-password-reset-verbose.txt](e2e-password-reset-verbose.txt) (9/9: enumeration, hash only, 60 s limit, daily cap, reset, verify, garbage and expired tokens, pattern, other tokens) |
| 11 | Unit, e2e, typecheck and lint pass | PASS | [unit-server.txt](unit-server.txt) (724/724), [unit-web.txt](unit-web.txt) (290/290), [e2e.txt](e2e.txt) (139/139 in 14 files), [typecheck.txt](typecheck.txt) (server and web `tsc` exit 0), [lint.txt](lint.txt) (exit 0, 0 errors, no warnings in files this branch changed) |
| Mock | Every flow and state in `mock.html` | PASS | Login with the link [01](01-login-forgot-link.png). Forgot: empty [02](02-forgot-form.png), sending [03a](03a-forgot-submitting.png), sent [03](03-forgot-sent-existing.png), "Use another email" [04](04-forgot-use-another-email.png) compared with the mock [20](20-mock-use-another-email.png). Reset: empty [08](08-reset-form.png), pattern [09](09-reset-pattern-error.png), mismatch [10](10-reset-mismatch-error.png), updating [11a](11a-reset-updating.png), invalid [15](15-reset-reused-token.png) to [18](18-reset-no-token.png) compared with the mock [22](22-mock-reset-invalid.png). Login after the reset [12](12-login-after-reset.png) compared with the mock [21](21-mock-login-after-reset.png) |

Also checked, beyond the checklist ([api-reset.txt](api-reset.txt)):
- A reset sets `emailVerifiedAt` on an unverified account (erin: f before, t after).
- After a reset, the user has no unused reset tokens left.
- `ADA@Example.com` is normalized and delivered to ada ([api-forgot.txt](api-forgot.txt)).

## Prettier (asked for by the reviewer, not a checklist item)

[prettier.txt](prettier.txt): `prettier --check` with `server/.prettierrc` flags 17 of the 22 changed files (15 at `--print-width 100`). The repo does not follow Prettier as a rule:
- On `main`, 220 of 270 source files fail the same check (171 at width 100).
- Every changed file that already existed was already flagged on `main`.
- No script, lint step or CI job runs Prettier.
- `web/` has no Prettier config.

So this is a note, not a FAIL. The new files are still not Prettier-clean. The fix in `53dc445` is the clearest case: its `onClick={() => { ... }}` block is not indented the way Prettier or the nearby code would indent it:

```tsx
<Button type="button" variant="outline" className="w-full" onClick={() => {
    forgot.reset();
    setEmail('');
    setInvalid(false);
  }}>
```

## Notes (not contract misses)

- **Inputs stay editable while submitting.** In the mock, the inputs in the "Sending" and "Updating" states are `readonly`. In the build, only the button is disabled. Its label changes as in the mock ([03a](03a-forgot-submitting.png), [11a](11a-reset-updating.png)). This was a note in the last review too.
- **No feedback on a server 400 or a network error in the forgot form.** The client email regex accepts some addresses that `@IsEmail()` rejects, for example `ada@example.c`. The page shows nothing for `forgot.isError`, so the button just becomes clickable again.
- **The "Password updated" notice can come back after the reset.** It comes from router `location.state`, which Chrome kept when `/login` was opened again at the same URL in the same tab. In [13](13-login-old-password-fails.png) the notice is still there above "Email or password is incorrect".
- **A new request makes every earlier link stop working.** `issueToken` marks all earlier unused tokens as used, so only the newest email link works. The spec asks for this only after a successful reset.
- **The daily cap counts requests, not mails.** Requests blocked by the 60 s limit still increase `reset:request:daily:<email>`. Five quick clicks in one minute send one mail and use up the whole day. Anyone who knows the email can do this to block that person's resets for 24 h. This follows from the per-email limit in the spec.
- **Timing side channel.** For a password account, the request writes to the DB and sends mail over SMTP before it answers. Other emails get an answer right away. The status and body are the same, but the response time can show whether an account exists.
- **Open WebSocket connections survive a reset.** The realtime gateway checks `tokenVersion` only at the handshake (this was already the case), so a socket opened before the reset stays connected until it reconnects.

## Screenshots

01 Login with the "Forgot password?" link
![01](https://github.com/tekClovis/dashBoard/blob/feature/big-forgot-password/features/big-forgot-password/verification/01-login-forgot-link.png?raw=true)

02 Forgot form
![02](https://github.com/tekClovis/dashBoard/blob/feature/big-forgot-password/features/big-forgot-password/verification/02-forgot-form.png?raw=true)

03a Forgot form while sending
![03a](https://github.com/tekClovis/dashBoard/blob/feature/big-forgot-password/features/big-forgot-password/verification/03a-forgot-submitting.png?raw=true)

03 Sent message, existing account
![03](https://github.com/tekClovis/dashBoard/blob/feature/big-forgot-password/features/big-forgot-password/verification/03-forgot-sent-existing.png?raw=true)

04 After "Use another email": empty form, no error (fixed)
![04](https://github.com/tekClovis/dashBoard/blob/feature/big-forgot-password/features/big-forgot-password/verification/04-forgot-use-another-email.png?raw=true)

05 Sent message, unknown email
![05](https://github.com/tekClovis/dashBoard/blob/feature/big-forgot-password/features/big-forgot-password/verification/05-forgot-sent-unknown.png?raw=true)

06 Sent message, OAuth-only account
![06](https://github.com/tekClovis/dashBoard/blob/feature/big-forgot-password/features/big-forgot-password/verification/06-forgot-sent-oauth.png?raw=true)

07 Reset email in Mailpit
![07](https://github.com/tekClovis/dashBoard/blob/feature/big-forgot-password/features/big-forgot-password/verification/07-mailpit-reset-email.png?raw=true)

08 Reset form, opened from the email link
![08](https://github.com/tekClovis/dashBoard/blob/feature/big-forgot-password/features/big-forgot-password/verification/08-reset-form.png?raw=true)

09 Pattern error (no request sent)
![09](https://github.com/tekClovis/dashBoard/blob/feature/big-forgot-password/features/big-forgot-password/verification/09-reset-pattern-error.png?raw=true)

10 Mismatch error (no request sent)
![10](https://github.com/tekClovis/dashBoard/blob/feature/big-forgot-password/features/big-forgot-password/verification/10-reset-mismatch-error.png?raw=true)

11 Valid new password entered
![11](https://github.com/tekClovis/dashBoard/blob/feature/big-forgot-password/features/big-forgot-password/verification/11-reset-valid-filled.png?raw=true)

11a Reset form while updating
![11a](https://github.com/tekClovis/dashBoard/blob/feature/big-forgot-password/features/big-forgot-password/verification/11a-reset-updating.png?raw=true)

12 Login after the reset, with the success message
![12](https://github.com/tekClovis/dashBoard/blob/feature/big-forgot-password/features/big-forgot-password/verification/12-login-after-reset.png?raw=true)

13 Old password rejected
![13](https://github.com/tekClovis/dashBoard/blob/feature/big-forgot-password/features/big-forgot-password/verification/13-login-old-password-fails.png?raw=true)

14 New password logs in
![14](https://github.com/tekClovis/dashBoard/blob/feature/big-forgot-password/features/big-forgot-password/verification/14-login-new-password-ok.png?raw=true)

15 Reused token
![15](https://github.com/tekClovis/dashBoard/blob/feature/big-forgot-password/features/big-forgot-password/verification/15-reset-reused-token.png?raw=true)

16 Garbage token
![16](https://github.com/tekClovis/dashBoard/blob/feature/big-forgot-password/features/big-forgot-password/verification/16-reset-garbage-token.png?raw=true)

17 Expired token
![17](https://github.com/tekClovis/dashBoard/blob/feature/big-forgot-password/features/big-forgot-password/verification/17-reset-expired-token.png?raw=true)

18 No token
![18](https://github.com/tekClovis/dashBoard/blob/feature/big-forgot-password/features/big-forgot-password/verification/18-reset-no-token.png?raw=true)

19 Mock: forgot sent state
![19](https://github.com/tekClovis/dashBoard/blob/feature/big-forgot-password/features/big-forgot-password/verification/19-mock-forgot-sent.png?raw=true)

20 Mock: after "Use another email" (empty form)
![20](https://github.com/tekClovis/dashBoard/blob/feature/big-forgot-password/features/big-forgot-password/verification/20-mock-use-another-email.png?raw=true)

21 Mock: login after the reset
![21](https://github.com/tekClovis/dashBoard/blob/feature/big-forgot-password/features/big-forgot-password/verification/21-mock-login-after-reset.png?raw=true)

22 Mock: invalid or expired link
![22](https://github.com/tekClovis/dashBoard/blob/feature/big-forgot-password/features/big-forgot-password/verification/22-mock-reset-invalid.png?raw=true)

23 Sent message at 375 px
![23](https://github.com/tekClovis/dashBoard/blob/feature/big-forgot-password/features/big-forgot-password/verification/23-forgot-sent-375.png?raw=true)

24 Mismatch error at 375 px
![24](https://github.com/tekClovis/dashBoard/blob/feature/big-forgot-password/features/big-forgot-password/verification/24-reset-mismatch-375.png?raw=true)
