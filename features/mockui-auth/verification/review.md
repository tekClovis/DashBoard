## Verification checklist

| # | Item | Result | Evidence |
|---|------|--------|----------|
| 1 | Login matches `01-login`; wrong credentials (real 401) matches `02-login-error`; dark+light, 1440+375 | PASS | [01-login--dark-1440](https://github.com/tekClovis/dashBoard/blob/feature/mockui-auth/features/mockui-auth/verification/01-login--dark-1440.png), [02-login-error--dark-1440](https://github.com/tekClovis/dashBoard/blob/feature/mockui-auth/features/mockui-auth/verification/02-login-error--dark-1440.png) (+ light/375 variants below). Inputs get destructive borders via `aria-invalid` as in `mock.html` (the master-mock reference screenshot shows neutral borders). |
| 2 | Register invalid input matches `03-register-validation`; rules checklist updates while typing; email-in-use shows destructive alert with "Log in instead", which carries the email to /login | PASS | [03-register-validation--dark-1440](https://github.com/tekClovis/dashBoard/blob/feature/mockui-auth/features/mockui-auth/verification/03-register-validation--dark-1440.png), [x-register-rules-none](https://github.com/tekClovis/dashBoard/blob/feature/mockui-auth/features/mockui-auth/verification/x-register-rules-none--dark-1440.png), [x-register-rules-partial](https://github.com/tekClovis/dashBoard/blob/feature/mockui-auth/features/mockui-auth/verification/x-register-rules-partial--dark-1440.png), [x-register-inuse](https://github.com/tekClovis/dashBoard/blob/feature/mockui-auth/features/mockui-auth/verification/x-register-inuse--dark-1440.png) (real 409), [x-login-after-login-instead](https://github.com/tekClovis/dashBoard/blob/feature/mockui-auth/features/mockui-auth/verification/x-login-after-login-instead--dark-1440.png) (email filled, password empty) |
| 3 | Successful register shows sent state matching `04-register-sent` | PASS | [04-register-sent--dark-1440](https://github.com/tekClovis/dashBoard/blob/feature/mockui-auth/features/mockui-auth/verification/04-register-sent--dark-1440.png) (real 201, focus on `#main`), [x-register-sent-resent](https://github.com/tekClovis/dashBoard/blob/feature/mockui-auth/features/mockui-auth/verification/x-register-sent-resent--dark-1440.png) |
| 4 | `/confirm` valid token matches `05-confirm-done`; invalid/expired matches `06-confirm-expired` | PASS | [05-confirm-done--dark-1440](https://github.com/tekClovis/dashBoard/blob/feature/mockui-auth/features/mockui-auth/verification/05-confirm-done--dark-1440.png) (real token from Mailpit), [06-confirm-expired--dark-1440](https://github.com/tekClovis/dashBoard/blob/feature/mockui-auth/features/mockui-auth/verification/06-confirm-expired--dark-1440.png), [x-confirm-resend-invalid](https://github.com/tekClovis/dashBoard/blob/feature/mockui-auth/features/mockui-auth/verification/x-confirm-resend-invalid--dark-1440.png), [x-confirm-resent](https://github.com/tekClovis/dashBoard/blob/feature/mockui-auth/features/mockui-auth/verification/x-confirm-resent--dark-1440.png), [x-confirm-notoken](https://github.com/tekClovis/dashBoard/blob/feature/mockui-auth/features/mockui-auth/verification/x-confirm-notoken--dark-1440.png) |
| 5 | Labels on all fields, errors linked via `aria-describedby`, alerts use `role="alert"` | PASS | DOM checks: login `#email`/`#password` → `login-err` (role=alert); register `email-err`, `password-rules password-err`, in-use `register-err` (role=alert); confirm `resend-email-err`; unconfirmed alert role=alert. [axe.txt](https://github.com/tekClovis/dashBoard/blob/feature/mockui-auth/features/mockui-auth/verification/axe.txt): 0 violations, both themes |
| 6 | Auth route tests pass; `npm test`, `npx tsc --noEmit`, `npm run lint` in `web/` pass | PASS | [npm-test.txt](https://github.com/tekClovis/dashBoard/blob/feature/mockui-auth/features/mockui-auth/verification/npm-test.txt) (32 files / 115 tests passed), [tsc.txt](https://github.com/tekClovis/dashBoard/blob/feature/mockui-auth/features/mockui-auth/verification/tsc.txt) (exit 0), [npm-lint.txt](https://github.com/tekClovis/dashBoard/blob/feature/mockui-auth/features/mockui-auth/verification/npm-lint.txt) (exit 0; 1 warning in untouched `src/api/client.ts`). No pre-existing auth route specs were modified. |
| 7 | Every flow and state of `mock.html` (incl. focus after submit) | PASS | Focus: invalid login → `#email` [x-login-invalid-input](https://github.com/tekClovis/dashBoard/blob/feature/mockui-auth/features/mockui-auth/verification/x-login-invalid-input--dark-1440.png); 401/403 → `#password`; register invalid → first bad field; register sent → `#main`; resend invalid → `#resend-email`. States: [x-login-link-required](https://github.com/tekClovis/dashBoard/blob/feature/mockui-auth/features/mockui-auth/verification/x-login-link-required--dark-1440.png) ("the provider" accepted), [x-login-unconfirmed](https://github.com/tekClovis/dashBoard/blob/feature/mockui-auth/features/mockui-auth/verification/x-login-unconfirmed--dark-1440.png) (real 403), [x-login-unconfirmed-resent](https://github.com/tekClovis/dashBoard/blob/feature/mockui-auth/features/mockui-auth/verification/x-login-unconfirmed-resent--dark-1440.png), [x-register-empty](https://github.com/tekClovis/dashBoard/blob/feature/mockui-auth/features/mockui-auth/verification/x-register-empty--dark-1440.png). Non-contract: [x-register-429](https://github.com/tekClovis/dashBoard/blob/feature/mockui-auth/features/mockui-auth/verification/x-register-429--dark-1440.png) shows the generic error; no horizontal scroll at 320 px |

## Screenshots

### 01-login--dark-1440

![01-login--dark-1440](https://github.com/tekClovis/dashBoard/blob/feature/mockui-auth/features/mockui-auth/verification/01-login--dark-1440.png?raw=true)

### 01-login--dark-375

![01-login--dark-375](https://github.com/tekClovis/dashBoard/blob/feature/mockui-auth/features/mockui-auth/verification/01-login--dark-375.png?raw=true)

### 01-login--light-1440

![01-login--light-1440](https://github.com/tekClovis/dashBoard/blob/feature/mockui-auth/features/mockui-auth/verification/01-login--light-1440.png?raw=true)

### 01-login--light-375

![01-login--light-375](https://github.com/tekClovis/dashBoard/blob/feature/mockui-auth/features/mockui-auth/verification/01-login--light-375.png?raw=true)

### 02-login-error--dark-1440

![02-login-error--dark-1440](https://github.com/tekClovis/dashBoard/blob/feature/mockui-auth/features/mockui-auth/verification/02-login-error--dark-1440.png?raw=true)

### 02-login-error--dark-375

![02-login-error--dark-375](https://github.com/tekClovis/dashBoard/blob/feature/mockui-auth/features/mockui-auth/verification/02-login-error--dark-375.png?raw=true)

### 02-login-error--light-1440

![02-login-error--light-1440](https://github.com/tekClovis/dashBoard/blob/feature/mockui-auth/features/mockui-auth/verification/02-login-error--light-1440.png?raw=true)

### 02-login-error--light-375

![02-login-error--light-375](https://github.com/tekClovis/dashBoard/blob/feature/mockui-auth/features/mockui-auth/verification/02-login-error--light-375.png?raw=true)

### 03-register-validation--dark-1440

![03-register-validation--dark-1440](https://github.com/tekClovis/dashBoard/blob/feature/mockui-auth/features/mockui-auth/verification/03-register-validation--dark-1440.png?raw=true)

### 03-register-validation--dark-375

![03-register-validation--dark-375](https://github.com/tekClovis/dashBoard/blob/feature/mockui-auth/features/mockui-auth/verification/03-register-validation--dark-375.png?raw=true)

### 03-register-validation--light-1440

![03-register-validation--light-1440](https://github.com/tekClovis/dashBoard/blob/feature/mockui-auth/features/mockui-auth/verification/03-register-validation--light-1440.png?raw=true)

### 03-register-validation--light-375

![03-register-validation--light-375](https://github.com/tekClovis/dashBoard/blob/feature/mockui-auth/features/mockui-auth/verification/03-register-validation--light-375.png?raw=true)

### 04-register-sent--dark-1440

![04-register-sent--dark-1440](https://github.com/tekClovis/dashBoard/blob/feature/mockui-auth/features/mockui-auth/verification/04-register-sent--dark-1440.png?raw=true)

### 04-register-sent--dark-375

![04-register-sent--dark-375](https://github.com/tekClovis/dashBoard/blob/feature/mockui-auth/features/mockui-auth/verification/04-register-sent--dark-375.png?raw=true)

### 04-register-sent--light-1440

![04-register-sent--light-1440](https://github.com/tekClovis/dashBoard/blob/feature/mockui-auth/features/mockui-auth/verification/04-register-sent--light-1440.png?raw=true)

### 04-register-sent--light-375

![04-register-sent--light-375](https://github.com/tekClovis/dashBoard/blob/feature/mockui-auth/features/mockui-auth/verification/04-register-sent--light-375.png?raw=true)

### 05-confirm-done--dark-1440

![05-confirm-done--dark-1440](https://github.com/tekClovis/dashBoard/blob/feature/mockui-auth/features/mockui-auth/verification/05-confirm-done--dark-1440.png?raw=true)

### 05-confirm-done--dark-375

![05-confirm-done--dark-375](https://github.com/tekClovis/dashBoard/blob/feature/mockui-auth/features/mockui-auth/verification/05-confirm-done--dark-375.png?raw=true)

### 05-confirm-done--light-1440

![05-confirm-done--light-1440](https://github.com/tekClovis/dashBoard/blob/feature/mockui-auth/features/mockui-auth/verification/05-confirm-done--light-1440.png?raw=true)

### 05-confirm-done--light-375

![05-confirm-done--light-375](https://github.com/tekClovis/dashBoard/blob/feature/mockui-auth/features/mockui-auth/verification/05-confirm-done--light-375.png?raw=true)

### 06-confirm-expired--dark-1440

![06-confirm-expired--dark-1440](https://github.com/tekClovis/dashBoard/blob/feature/mockui-auth/features/mockui-auth/verification/06-confirm-expired--dark-1440.png?raw=true)

### 06-confirm-expired--dark-375

![06-confirm-expired--dark-375](https://github.com/tekClovis/dashBoard/blob/feature/mockui-auth/features/mockui-auth/verification/06-confirm-expired--dark-375.png?raw=true)

### 06-confirm-expired--light-1440

![06-confirm-expired--light-1440](https://github.com/tekClovis/dashBoard/blob/feature/mockui-auth/features/mockui-auth/verification/06-confirm-expired--light-1440.png?raw=true)

### 06-confirm-expired--light-375

![06-confirm-expired--light-375](https://github.com/tekClovis/dashBoard/blob/feature/mockui-auth/features/mockui-auth/verification/06-confirm-expired--light-375.png?raw=true)

### x-confirm-notoken--dark-1440

![x-confirm-notoken--dark-1440](https://github.com/tekClovis/dashBoard/blob/feature/mockui-auth/features/mockui-auth/verification/x-confirm-notoken--dark-1440.png?raw=true)

### x-confirm-resend-invalid--dark-1440

![x-confirm-resend-invalid--dark-1440](https://github.com/tekClovis/dashBoard/blob/feature/mockui-auth/features/mockui-auth/verification/x-confirm-resend-invalid--dark-1440.png?raw=true)

### x-confirm-resent--dark-1440

![x-confirm-resent--dark-1440](https://github.com/tekClovis/dashBoard/blob/feature/mockui-auth/features/mockui-auth/verification/x-confirm-resent--dark-1440.png?raw=true)

### x-login-after-login-instead--dark-1440

![x-login-after-login-instead--dark-1440](https://github.com/tekClovis/dashBoard/blob/feature/mockui-auth/features/mockui-auth/verification/x-login-after-login-instead--dark-1440.png?raw=true)

### x-login-invalid-input--dark-1440

![x-login-invalid-input--dark-1440](https://github.com/tekClovis/dashBoard/blob/feature/mockui-auth/features/mockui-auth/verification/x-login-invalid-input--dark-1440.png?raw=true)

### x-login-link-required--dark-1440

![x-login-link-required--dark-1440](https://github.com/tekClovis/dashBoard/blob/feature/mockui-auth/features/mockui-auth/verification/x-login-link-required--dark-1440.png?raw=true)

### x-login-unconfirmed--dark-1440

![x-login-unconfirmed--dark-1440](https://github.com/tekClovis/dashBoard/blob/feature/mockui-auth/features/mockui-auth/verification/x-login-unconfirmed--dark-1440.png?raw=true)

### x-login-unconfirmed-resent--dark-1440

![x-login-unconfirmed-resent--dark-1440](https://github.com/tekClovis/dashBoard/blob/feature/mockui-auth/features/mockui-auth/verification/x-login-unconfirmed-resent--dark-1440.png?raw=true)

### x-register-429--dark-1440

![x-register-429--dark-1440](https://github.com/tekClovis/dashBoard/blob/feature/mockui-auth/features/mockui-auth/verification/x-register-429--dark-1440.png?raw=true)

### x-register-empty--dark-1440

![x-register-empty--dark-1440](https://github.com/tekClovis/dashBoard/blob/feature/mockui-auth/features/mockui-auth/verification/x-register-empty--dark-1440.png?raw=true)

### x-register-inuse--dark-1440

![x-register-inuse--dark-1440](https://github.com/tekClovis/dashBoard/blob/feature/mockui-auth/features/mockui-auth/verification/x-register-inuse--dark-1440.png?raw=true)

### x-register-rules-none--dark-1440

![x-register-rules-none--dark-1440](https://github.com/tekClovis/dashBoard/blob/feature/mockui-auth/features/mockui-auth/verification/x-register-rules-none--dark-1440.png?raw=true)

### x-register-rules-partial--dark-1440

![x-register-rules-partial--dark-1440](https://github.com/tekClovis/dashBoard/blob/feature/mockui-auth/features/mockui-auth/verification/x-register-rules-partial--dark-1440.png?raw=true)

### x-register-sent-resent--dark-1440

![x-register-sent-resent--dark-1440](https://github.com/tekClovis/dashBoard/blob/feature/mockui-auth/features/mockui-auth/verification/x-register-sent-resent--dark-1440.png?raw=true)
