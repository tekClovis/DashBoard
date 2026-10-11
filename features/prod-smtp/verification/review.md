# Review: prod-smtp (second pass)

**Verdict: PASS**

Spec: `features/prod-smtp/spec.md` (UI: none). Branch `feature/prod-smtp`, commits `ed09490` and `c33345e`. The first pass failed on items 5 and 6 because no tests covered them. `c33345e` adds `server/src/core/mail/mail.delivery.spec.ts` and sets `requireTLS: !secure` when credentials are configured.

## Checklist

| # | Item | Result | Evidence |
|---|------|--------|----------|
| 1 | Only HOST/PORT/FROM set: createTransport gets `{ host, port, secure: false }` and no `auth` | PASS | `mail.service.spec.ts` › "passes only host, port and secure:false without credentials" (exact `toHaveBeenCalledWith`), and "does not force requireTLS without credentials (Mailpit default)": [unit-mail-env.txt](unit-mail-env.txt) |
| 2 | SMTP_USER+SMTP_PASS set: createTransport gets `auth: { user, pass }` | PASS | `mail.service.spec.ts` › "passes auth when SMTP_USER and SMTP_PASS are set": [unit-mail-env.txt](unit-mail-env.txt) |
| 3 | SMTP_SECURE='true' gives `secure: true`; 'false', other values or unset give `false` | PASS | `mail.service.spec.ts` › `it.each` covers 'true', 'false', 'TRUE', '1' and '', plus "defaults secure to false when SMTP_SECURE is unset": [unit-mail-env.txt](unit-mail-env.txt) |
| 4 | Env validation fails for SMTP_USER without SMTP_PASS, passes when all three are unset | PASS | `env.validation.spec.ts` › "rejects SMTP_USER without SMTP_PASS" and "accepts the optional SMTP credentials and leaves them unset by default": [unit-mail-env.txt](unit-mail-env.txt) |
| 5 | .env.example lists empty SMTP_USER=, SMTP_PASS=, SMTP_SECURE=; docker-compose.yml still defaults to Mailpit | PASS (fixed) | `mail.delivery.spec.ts` › ".env.example SMTP defaults": it parses the real `.env.example` and asserts the three keys are `''`. It also asserts `SMTP_HOST=mailpit`/`SMTP_PORT=1025`, that `docker-compose.yml` uses the `axllent/mailpit` image without overriding any `SMTP_USER/PASS/SECURE`, and that the shipped file passes `validate`: [unit-mail-env.txt](unit-mail-env.txt) |
| 6 | `docker-compose up` with the default .env still delivers the confirmation email to Mailpit | PASS (fixed) | `mail.delivery.spec.ts` › "delivers the confirmation email, unauthenticated and in plaintext, to the SMTP_HOST:SMTP_PORT target". It builds the config from the shipped `.env.example`, overriding only host and port to point at an in-process SMTP stub. It runs the real `MailService` and nodemailer, with no mock, and asserts that the stub receives `Subject: Confirm your email` and that no error is logged: [unit-mail-env.txt](unit-mail-env.txt). As a cross-check I ran the real `MailService` against a real `axllent/mailpit` container (v1.31.3), and the Mailpit API showed 1 message, "Confirm your email" to user@example.com: [mailpit-delivery.txt](mailpit-delivery.txt) |
| 7 | `npm test` and oxlint pass; GET /about.json unchanged | PASS | `npm test`: server 67 files / 751 tests and web 42 files / 323 tests, all passing ([npm-test.txt](npm-test.txt)). `npm run lint` exits 0, with warnings only and none in files this branch touches ([lint.txt](lint.txt)). Server `tsc --noEmit` is clean. `about.controller.spec.ts` passes ([about-unit.txt](about-unit.txt)), and the diff touches no catalog/about code. |

## Notes

- **requireTLS does not break the default Mailpit flow.** On the default path `SMTP_USER` is empty, so neither `auth` nor `requireTLS` is added. Real Mailpit's EHLO advertises no STARTTLS (`SIZE`, `ENHANCEDSTATUSCODES`, `8BITMIME`, `SMTPUTF8`), so nodemailer stays in plaintext and the delivery succeeds. See [mailpit-delivery.txt](mailpit-delivery.txt).
- **Side effect of requireTLS (not a contract miss):** if `SMTP_USER`/`SMTP_PASS` are set while still pointing at Mailpit or any relay without STARTTLS, sending fails with `Error upgrading connection with STARTTLS: 502 5.5.1 Command not implemented`. MailService logs this and does not throw. I reproduced it in [mailpit-delivery.txt](mailpit-delivery.txt). The spec's scope says "STARTTLS upgrade when the server offers it", and the branch makes the upgrade mandatory when credentials are present. That is stricter than the spec text, but it is the safe choice (no cleartext credentials), and no checklist item covers it. It is documented in the MailService doc comment and covered by "requires a STARTTLS upgrade before sending credentials over a non-implicit-TLS connection".
- **Item 6 coverage is an approximation.** The branch test uses an in-process SMTP stub, not a `docker compose up` stack with a Mailpit container. It proves that the shipped `.env` values produce an unauthenticated, plaintext delivery that MailService completes. The compose wiring (service name `mailpit`, no SMTP_* overrides) is checked statically. A testcontainers Mailpit e2e would be stronger, and the repo already uses testcontainers in `server/test/`.
- **Scope:** the constraints list "mail.service.ts, its spec, env.validation.ts (and its spec), .env.example". `mail.delivery.spec.ts` is a second, new spec file for MailService. I read that as within "its spec", but strictly it is a file outside the list.
- The cross-check script ran with `tsx`, which emits no decorator metadata. So it passed `SMTP_PORT` as a number rather than the string `'1025'`. The branch's vitest test validates the string form.
- No credentials, binaries or build output were committed. Both commit subjects follow `[C.NE][mail] <type>: ...`.
- Cleanup: the temporary Mailpit container (`prodsmtp-mailpit`) was stopped and removed.

## Screenshots

None. The spec declares `UI: none`.
