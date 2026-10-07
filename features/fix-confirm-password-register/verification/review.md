# fix-confirm-password-register: verification (second pass)

Verdict: **PASS**

Branch `feature/fix-confirm-password-register` (`f9f3c37`, `39d8443`). It changes only `web/src/routes/RegisterPage.tsx` and `web/src/routes/RegisterPage.spec.tsx`.

## Checklist

| # | Item | Result | Evidence |
|---|------|--------|----------|
| 1 | Password-type input labelled "Confirm your password" directly under the password field, `autoComplete="new-password"` | PASS | [01-empty.png](01-empty.png). DOM check in a live browser: `{id:"confirm",type:"password",ac:"new-password",label:"Confirm your password"}` is the next input after `#password`. Unit test "has a new-password confirm field directly under the password field" is in [register-tests.txt](register-tests.txt). |
| 2 | Valid email and password with a different confirm: "Passwords do not match." on confirm, `aria-invalid`, confirm focused, no request | PASS | [02-mismatch.png](02-mismatch.png). Live check: `active=confirm`, `aria-invalid=true`, `aria-describedby=confirm-err`, text "Passwords do not match.", 0 fetch calls. Unit test "blocks submit and focuses the confirm field when it differs" is in [register-tests.txt](register-tests.txt). |
| 3 | Matching passwords that meet every rule register as before, and the body has only email and password | PASS | [06-sent.png](06-sent.png). The one request captured live was `/api/auth/register` with body `{"email":"verify-…@example.com","password":"correct-horse-1!"}`. The email-in-use path still works: [07-email-in-use.png](07-email-in-use.png). Unit test "registers with only email and password when the passwords match" checks that the keys are exactly `['email','password']`. |
| 4 | Empty confirm with a filled password counts as a mismatch | PASS | [03-empty-confirm.png](03-empty-confirm.png). Live check: `active=confirm`, `aria-invalid=true`, "Passwords do not match.", 0 requests. Unit test "blocks submit and focuses the confirm field when it is empty" is in [register-tests.txt](register-tests.txt). |
| 5 | Existing RegisterPage tests pass, new tests cover items 2 to 4, web typecheck and lint pass | PASS | RegisterPage spec: 10/10 in [register-tests.txt](register-tests.txt). Full web suite is green: [web-tests.txt](web-tests.txt). `tsc --noEmit` exits 0: [web-typecheck.txt](web-typecheck.txt). `oxlint` exits 0: [web-lint.txt](web-lint.txt). |

Mock states (`register=` Empty, Validation, Confirm differs, Confirm empty, Email in use, Check your email) were all reached in the running app:
- Confirm differs: [02-mismatch.png](02-mismatch.png) next to the mock in [mock-mismatch.png](mock-mismatch.png).
- Confirm empty: [03-empty-confirm.png](03-empty-confirm.png) next to the mock in [mock-emptyconfirm.png](mock-emptyconfirm.png).
- Validation: [04-validation.png](04-validation.png) next to the mock in [mock-errors.png](mock-errors.png).
- Fix from the previous FAIL: with an invalid email and a different confirm, the app shows only the email error and focuses the email field, as the mock's submit handler does: [05-invalid-email-and-mismatch.png](05-invalid-email-and-mismatch.png).

## Notes (not contract failures)
- **Validation state:** with an invalid email and a weak password, the app also shows the existing password error "Meet every rule above." The mock's Validation state (and every shared prototype mock) leaves it out. This behaviour was already on `main`, and the spec rules out changing the password rules, so it is not counted against this feature.
- The confirm error copy ("Passwords do not match.") follows the spec. It differs from ResetPasswordPage ("The two passwords don't match.").
- **Theme:** the app renders in light theme by default and the mock in dark. Layout and states match.
- **Lint:** one existing warning in `src/api/client.ts` (`no-misused-spread`), unrelated to this feature.
- **Git:** `features/` is in `.gitignore`, so this folder has to be force-added (`git add -f`) to be committed.

## Screenshots

![Empty](https://github.com/tekClovis/dashBoard/blob/feature/fix-confirm-password-register/features/fix-confirm-password-register/verification/01-empty.png?raw=true)
![Confirm differs](https://github.com/tekClovis/dashBoard/blob/feature/fix-confirm-password-register/features/fix-confirm-password-register/verification/02-mismatch.png?raw=true)
![Confirm empty](https://github.com/tekClovis/dashBoard/blob/feature/fix-confirm-password-register/features/fix-confirm-password-register/verification/03-empty-confirm.png?raw=true)
![Validation](https://github.com/tekClovis/dashBoard/blob/feature/fix-confirm-password-register/features/fix-confirm-password-register/verification/04-validation.png?raw=true)
![Invalid email + confirm differs](https://github.com/tekClovis/dashBoard/blob/feature/fix-confirm-password-register/features/fix-confirm-password-register/verification/05-invalid-email-and-mismatch.png?raw=true)
![Check your email](https://github.com/tekClovis/dashBoard/blob/feature/fix-confirm-password-register/features/fix-confirm-password-register/verification/06-sent.png?raw=true)
![Email in use](https://github.com/tekClovis/dashBoard/blob/feature/fix-confirm-password-register/features/fix-confirm-password-register/verification/07-email-in-use.png?raw=true)
![Mock: confirm differs](https://github.com/tekClovis/dashBoard/blob/feature/fix-confirm-password-register/features/fix-confirm-password-register/verification/mock-mismatch.png?raw=true)
![Mock: confirm empty](https://github.com/tekClovis/dashBoard/blob/feature/fix-confirm-password-register/features/fix-confirm-password-register/verification/mock-emptyconfirm.png?raw=true)
![Mock: validation](https://github.com/tekClovis/dashBoard/blob/feature/fix-confirm-password-register/features/fix-confirm-password-register/verification/mock-errors.png?raw=true)
