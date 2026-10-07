## prettier-mails: verification

Spec: `features/prettier-mails/spec.md` (UI: none). Both emails sent by `MailService` (confirmation and password reset) were checked. Their actual output was captured by running `MailService` with an injected transport and a realistic 43-char base64url token. The output is saved as `*.rendered.html` and `*.rendered.txt`.

| # | Checklist item | Result | Evidence |
|---|---|---|---|
| 1 | Every email has an HTML body with a header, heading, CTA button and footer, using inline CSS only (no external stylesheet or remote images) | PASS | [mail-spec.txt](mail-spec.txt) (`expectBrandedHtml` asserts the header, `<h1>`, `<a href>` button and border-top footer, and rejects `<link>`, `<style>`, `<img>`, `<script>` and `url(`, for both emails); [confirm.rendered.html](confirm.rendered.html), [reset.rendered.html](reset.rendered.html) (0 matches for `<link`, `<style`, `<img`, `<script`, `url(` and remote assets) |
| 2 | Every email also has a plain-text body that contains the same link | PASS | [mail-spec.txt](mail-spec.txt) (`msg.text` contains the URL for both); [confirm.rendered.txt](confirm.rendered.txt), [reset.rendered.txt](reset.rendered.txt) |
| 3 | The button href equals the previous link, and the subjects are unchanged | PASS | [mail-spec.txt](mail-spec.txt) (`<a href="${url}"`, subjects `Confirm your email` and `Reset your password` checked with `toBe`); `auth.controller.ts` link building is untouched in the diff |
| 4 | Rendered HTML at 600px and 360px shows no horizontal overflow (screenshots) | PASS | [overflow.txt](overflow.txt) (`scrollWidth == innerWidth` for both emails at both widths); screenshots below |
| 5 | `mail.service.spec.ts` is updated and passes, and the server typecheck and lint pass | PASS | [mail-spec.txt](mail-spec.txt) (6/6); [server-unit-tests.txt](server-unit-tests.txt) (66 files, 728 tests passed); [typecheck.txt](typecheck.txt) (`tsc --noEmit`, exit 0); [lint.txt](lint.txt) (`oxlint`, exit 0, warnings only and none in `core/mail`) |

### Notes (not contract misses)
- The reset email's plain-text body says "Use the button below to choose a new one." The plain-text part has no button. The confirmation intro has no such wording.
- `href` is HTML-escaped (`&` becomes `&amp;`). It decodes to the same URL, so it is equivalent to the previous link. Real tokens are base64url and contain no characters that get escaped.
- `npx prettier --check src/core/mail/` reports style issues in `mail.service.ts`, `mail.template.ts` and the spec. Untouched files such as `auth.controller.ts` also fail the check, so this is not new. Lint passes.
- The CTA is a padded `display:inline-block` `<a>` and the card relies on `max-width`. Outlook desktop ignores both: the button would look like a link and the card would span the full width. Gmail and Apple Mail are fine.
- The typecheck needed `prisma generate` (gitignored `server/src/generated/`) in the fresh worktree first. This is about the environment, not the branch.
- Scope constraint respected: only `mail.service.ts`, its spec and the new `mail.template.ts` changed.

### Screenshots

Confirmation email at 600px:

![confirm 600](https://github.com/tekClovis/dashBoard/blob/feature/prettier-mails/features/prettier-mails/verification/confirm-600.png?raw=true)

Confirmation email at 360px:

![confirm 360](https://github.com/tekClovis/dashBoard/blob/feature/prettier-mails/features/prettier-mails/verification/confirm-360.png?raw=true)

Password reset email at 600px:

![reset 600](https://github.com/tekClovis/dashBoard/blob/feature/prettier-mails/features/prettier-mails/verification/reset-600.png?raw=true)

Password reset email at 360px:

![reset 360](https://github.com/tekClovis/dashBoard/blob/feature/prettier-mails/features/prettier-mails/verification/reset-360.png?raw=true)
