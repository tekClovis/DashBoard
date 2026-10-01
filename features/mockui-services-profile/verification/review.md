## Verification checklist

1. **PASS** — Services matches `20-services` and, with an expired GitHub connection, `21-services-reconnect` in dark and light at 1440 and 375. The expired alert reads "Your 3 GitHub widgets stopped updating…". The 3 is counted from real widgets on two real dashboards, with only `/api/connections` stubbed to REAUTH. While connections load, the status and action cells show skeletons. Evidence: [services-default--dark-1440.png](https://github.com/tekClovis/dashBoard/blob/feature/mockui-services-profile/features/mockui-services-profile/verification/services-default--dark-1440.png?raw=true), [services-default--dark-375.png](https://github.com/tekClovis/dashBoard/blob/feature/mockui-services-profile/features/mockui-services-profile/verification/services-default--dark-375.png?raw=true), [services-default--light-1440.png](https://github.com/tekClovis/dashBoard/blob/feature/mockui-services-profile/features/mockui-services-profile/verification/services-default--light-1440.png?raw=true), [services-default--light-375.png](https://github.com/tekClovis/dashBoard/blob/feature/mockui-services-profile/features/mockui-services-profile/verification/services-default--light-375.png?raw=true), [services-reauth--dark-1440.png](https://github.com/tekClovis/dashBoard/blob/feature/mockui-services-profile/features/mockui-services-profile/verification/services-reauth--dark-1440.png?raw=true), [services-reauth--dark-375.png](https://github.com/tekClovis/dashBoard/blob/feature/mockui-services-profile/features/mockui-services-profile/verification/services-reauth--dark-375.png?raw=true), [services-reauth--light-1440.png](https://github.com/tekClovis/dashBoard/blob/feature/mockui-services-profile/features/mockui-services-profile/verification/services-reauth--light-1440.png?raw=true), [services-reauth--light-375.png](https://github.com/tekClovis/dashBoard/blob/feature/mockui-services-profile/features/mockui-services-profile/verification/services-reauth--light-375.png?raw=true), [services-loading--dark-1440.png](https://github.com/tekClovis/dashBoard/blob/feature/mockui-services-profile/features/mockui-services-profile/verification/services-loading--dark-1440.png?raw=true), [services-loading--light-375.png](https://github.com/tekClovis/dashBoard/blob/feature/mockui-services-profile/features/mockui-services-profile/verification/services-loading--light-375.png?raw=true), [services-real--dark-1440.png](https://github.com/tekClovis/dashBoard/blob/feature/mockui-services-profile/features/mockui-services-profile/verification/services-real--dark-1440.png?raw=true), with references [ref-20-services--dark-1440.png](https://github.com/tekClovis/dashBoard/blob/feature/mockui-services-profile/features/mockui-services-profile/verification/ref-20-services--dark-1440.png?raw=true), [ref-21-services-reconnect--dark-1440.png](https://github.com/tekClovis/dashBoard/blob/feature/mockui-services-profile/features/mockui-services-profile/verification/ref-21-services-reconnect--dark-1440.png?raw=true) and [ref-mock-services-loading--dark-1440.png](https://github.com/tekClovis/dashBoard/blob/feature/mockui-services-profile/features/mockui-services-profile/verification/ref-mock-services-loading--dark-1440.png?raw=true).
2. **PASS** — Disconnect swaps the row to "Its widgets stop updating." with [Disconnect] [Cancel] and moves focus to Cancel. Cancel sent no DELETE, kept the row Connected and returned focus to Disconnect. Confirming sent exactly one `DELETE /api/connections/steam`, showed "Disconnecting…" until the refetch finished, and then showed Not connected with Connect Steam. Evidence: [disconnect-confirm--dark-1440.png](https://github.com/tekClovis/dashBoard/blob/feature/mockui-services-profile/features/mockui-services-profile/verification/disconnect-confirm--dark-1440.png?raw=true), [disconnect-cancelled--dark-1440.png](https://github.com/tekClovis/dashBoard/blob/feature/mockui-services-profile/features/mockui-services-profile/verification/disconnect-cancelled--dark-1440.png?raw=true), [disconnect-confirm-github-reauth--dark-1440.png](https://github.com/tekClovis/dashBoard/blob/feature/mockui-services-profile/features/mockui-services-profile/verification/disconnect-confirm-github-reauth--dark-1440.png?raw=true), [disconnect-confirm-github-reauth--light-375.png](https://github.com/tekClovis/dashBoard/blob/feature/mockui-services-profile/features/mockui-services-profile/verification/disconnect-confirm-github-reauth--light-375.png?raw=true), [disconnect-pending--dark-1440.png](https://github.com/tekClovis/dashBoard/blob/feature/mockui-services-profile/features/mockui-services-profile/verification/disconnect-pending--dark-1440.png?raw=true), [disconnect-done--dark-1440.png](https://github.com/tekClovis/dashBoard/blob/feature/mockui-services-profile/features/mockui-services-profile/verification/disconnect-done--dark-1440.png?raw=true), with reference [ref-mock-disconnect-confirm--dark-1440.png](https://github.com/tekClovis/dashBoard/blob/feature/mockui-services-profile/features/mockui-services-profile/verification/ref-mock-disconnect-confirm--dark-1440.png?raw=true).
3. **PASS** — All three cards (Account, Sign-in methods and Sessions) are backed by existing APIs (`/auth/me`, `/auth/identities/{p}`, `/oauth/{p}/start?intent=link`, `/auth/logout`, `/auth/logout-all`), so no card or action is omitted. The page matches `22-profile` in dark and light at 1440 and 375. The sole remaining method shows "Only sign-in method". `?error=IDENTITY_ALREADY_LINKED` shows the link-refused alert. Real Log out and Log out of all devices both land on /login, and `/auth/me` then returns 401. Evidence: [profile-github-linked--dark-1440.png](https://github.com/tekClovis/dashBoard/blob/feature/mockui-services-profile/features/mockui-services-profile/verification/profile-github-linked--dark-1440.png?raw=true), [profile-github-linked--dark-375.png](https://github.com/tekClovis/dashBoard/blob/feature/mockui-services-profile/features/mockui-services-profile/verification/profile-github-linked--dark-375.png?raw=true), [profile-github-linked--light-1440.png](https://github.com/tekClovis/dashBoard/blob/feature/mockui-services-profile/features/mockui-services-profile/verification/profile-github-linked--light-1440.png?raw=true), [profile-github-linked--light-375.png](https://github.com/tekClovis/dashBoard/blob/feature/mockui-services-profile/features/mockui-services-profile/verification/profile-github-linked--light-375.png?raw=true), [profile-real--dark-1440.png](https://github.com/tekClovis/dashBoard/blob/feature/mockui-services-profile/features/mockui-services-profile/verification/profile-real--dark-1440.png?raw=true), [profile-sole-method--dark-1440.png](https://github.com/tekClovis/dashBoard/blob/feature/mockui-services-profile/features/mockui-services-profile/verification/profile-sole-method--dark-1440.png?raw=true), [profile-link-refused--dark-1440.png](https://github.com/tekClovis/dashBoard/blob/feature/mockui-services-profile/features/mockui-services-profile/verification/profile-link-refused--dark-1440.png?raw=true), [profile-logout-result--dark-1440.png](https://github.com/tekClovis/dashBoard/blob/feature/mockui-services-profile/features/mockui-services-profile/verification/profile-logout-result--dark-1440.png?raw=true), [profile-logout-all-result--dark-1440.png](https://github.com/tekClovis/dashBoard/blob/feature/mockui-services-profile/features/mockui-services-profile/verification/profile-logout-all-result--dark-1440.png?raw=true), with references [ref-22-profile--dark-1440.png](https://github.com/tekClovis/dashBoard/blob/feature/mockui-services-profile/features/mockui-services-profile/verification/ref-22-profile--dark-1440.png?raw=true), [ref-mock-profile-sole--dark-1440.png](https://github.com/tekClovis/dashBoard/blob/feature/mockui-services-profile/features/mockui-services-profile/verification/ref-mock-profile-sole--dark-1440.png?raw=true) and [ref-mock-profile-link-refused--dark-1440.png](https://github.com/tekClovis/dashBoard/blob/feature/mockui-services-profile/features/mockui-services-profile/verification/ref-mock-profile-link-refused--dark-1440.png?raw=true).
4. **PASS** — In `web/`: `npm test` passed 29 files and 115 tests, `npx tsc --noEmit` exited 0, and `npm run lint` exited 0 with one warning in `src/api/client.ts`, a file this branch does not change.

## Screenshots

### disconnect-api-error--dark-1440.png

![disconnect-api-error--dark-1440.png](https://github.com/tekClovis/dashBoard/blob/feature/mockui-services-profile/features/mockui-services-profile/verification/disconnect-api-error--dark-1440.png?raw=true)

### disconnect-cancelled--dark-1440.png

![disconnect-cancelled--dark-1440.png](https://github.com/tekClovis/dashBoard/blob/feature/mockui-services-profile/features/mockui-services-profile/verification/disconnect-cancelled--dark-1440.png?raw=true)

### disconnect-confirm--dark-1440.png

![disconnect-confirm--dark-1440.png](https://github.com/tekClovis/dashBoard/blob/feature/mockui-services-profile/features/mockui-services-profile/verification/disconnect-confirm--dark-1440.png?raw=true)

### disconnect-confirm-github-reauth--dark-1440.png

![disconnect-confirm-github-reauth--dark-1440.png](https://github.com/tekClovis/dashBoard/blob/feature/mockui-services-profile/features/mockui-services-profile/verification/disconnect-confirm-github-reauth--dark-1440.png?raw=true)

### disconnect-confirm-github-reauth--dark-375.png

![disconnect-confirm-github-reauth--dark-375.png](https://github.com/tekClovis/dashBoard/blob/feature/mockui-services-profile/features/mockui-services-profile/verification/disconnect-confirm-github-reauth--dark-375.png?raw=true)

### disconnect-confirm-github-reauth--light-375.png

![disconnect-confirm-github-reauth--light-375.png](https://github.com/tekClovis/dashBoard/blob/feature/mockui-services-profile/features/mockui-services-profile/verification/disconnect-confirm-github-reauth--light-375.png?raw=true)

### disconnect-done--dark-1440.png

![disconnect-done--dark-1440.png](https://github.com/tekClovis/dashBoard/blob/feature/mockui-services-profile/features/mockui-services-profile/verification/disconnect-done--dark-1440.png?raw=true)

### disconnect-pending--dark-1440.png

![disconnect-pending--dark-1440.png](https://github.com/tekClovis/dashBoard/blob/feature/mockui-services-profile/features/mockui-services-profile/verification/disconnect-pending--dark-1440.png?raw=true)

### disconnect-settled-before-refetch--dark-1440.png

![disconnect-settled-before-refetch--dark-1440.png](https://github.com/tekClovis/dashBoard/blob/feature/mockui-services-profile/features/mockui-services-profile/verification/disconnect-settled-before-refetch--dark-1440.png?raw=true)

### profile-after-unlink--dark-1440.png

![profile-after-unlink--dark-1440.png](https://github.com/tekClovis/dashBoard/blob/feature/mockui-services-profile/features/mockui-services-profile/verification/profile-after-unlink--dark-1440.png?raw=true)

### profile-github-linked--dark-1440.png

![profile-github-linked--dark-1440.png](https://github.com/tekClovis/dashBoard/blob/feature/mockui-services-profile/features/mockui-services-profile/verification/profile-github-linked--dark-1440.png?raw=true)

### profile-github-linked--dark-375.png

![profile-github-linked--dark-375.png](https://github.com/tekClovis/dashBoard/blob/feature/mockui-services-profile/features/mockui-services-profile/verification/profile-github-linked--dark-375.png?raw=true)

### profile-github-linked--light-1440.png

![profile-github-linked--light-1440.png](https://github.com/tekClovis/dashBoard/blob/feature/mockui-services-profile/features/mockui-services-profile/verification/profile-github-linked--light-1440.png?raw=true)

### profile-github-linked--light-375.png

![profile-github-linked--light-375.png](https://github.com/tekClovis/dashBoard/blob/feature/mockui-services-profile/features/mockui-services-profile/verification/profile-github-linked--light-375.png?raw=true)

### profile-link-refused--dark-1440.png

![profile-link-refused--dark-1440.png](https://github.com/tekClovis/dashBoard/blob/feature/mockui-services-profile/features/mockui-services-profile/verification/profile-link-refused--dark-1440.png?raw=true)

### profile-link-refused--light-375.png

![profile-link-refused--light-375.png](https://github.com/tekClovis/dashBoard/blob/feature/mockui-services-profile/features/mockui-services-profile/verification/profile-link-refused--light-375.png?raw=true)

### profile-logout-all-result--dark-1440.png

![profile-logout-all-result--dark-1440.png](https://github.com/tekClovis/dashBoard/blob/feature/mockui-services-profile/features/mockui-services-profile/verification/profile-logout-all-result--dark-1440.png?raw=true)

### profile-logout-result--dark-1440.png

![profile-logout-result--dark-1440.png](https://github.com/tekClovis/dashBoard/blob/feature/mockui-services-profile/features/mockui-services-profile/verification/profile-logout-result--dark-1440.png?raw=true)

### profile-real--dark-1440.png

![profile-real--dark-1440.png](https://github.com/tekClovis/dashBoard/blob/feature/mockui-services-profile/features/mockui-services-profile/verification/profile-real--dark-1440.png?raw=true)

### profile-real--dark-375.png

![profile-real--dark-375.png](https://github.com/tekClovis/dashBoard/blob/feature/mockui-services-profile/features/mockui-services-profile/verification/profile-real--dark-375.png?raw=true)

### profile-real--light-1440.png

![profile-real--light-1440.png](https://github.com/tekClovis/dashBoard/blob/feature/mockui-services-profile/features/mockui-services-profile/verification/profile-real--light-1440.png?raw=true)

### profile-real--light-375.png

![profile-real--light-375.png](https://github.com/tekClovis/dashBoard/blob/feature/mockui-services-profile/features/mockui-services-profile/verification/profile-real--light-375.png?raw=true)

### profile-sole-method--dark-1440.png

![profile-sole-method--dark-1440.png](https://github.com/tekClovis/dashBoard/blob/feature/mockui-services-profile/features/mockui-services-profile/verification/profile-sole-method--dark-1440.png?raw=true)

### profile-sole-method--light-375.png

![profile-sole-method--light-375.png](https://github.com/tekClovis/dashBoard/blob/feature/mockui-services-profile/features/mockui-services-profile/verification/profile-sole-method--light-375.png?raw=true)

### profile-unconfirmed--dark-1440.png

![profile-unconfirmed--dark-1440.png](https://github.com/tekClovis/dashBoard/blob/feature/mockui-services-profile/features/mockui-services-profile/verification/profile-unconfirmed--dark-1440.png?raw=true)

### profile-unlink-refused--dark-1440.png

![profile-unlink-refused--dark-1440.png](https://github.com/tekClovis/dashBoard/blob/feature/mockui-services-profile/features/mockui-services-profile/verification/profile-unlink-refused--dark-1440.png?raw=true)

### ref-20-services--dark-1440.png

![ref-20-services--dark-1440.png](https://github.com/tekClovis/dashBoard/blob/feature/mockui-services-profile/features/mockui-services-profile/verification/ref-20-services--dark-1440.png?raw=true)

### ref-20-services--dark-375.png

![ref-20-services--dark-375.png](https://github.com/tekClovis/dashBoard/blob/feature/mockui-services-profile/features/mockui-services-profile/verification/ref-20-services--dark-375.png?raw=true)

### ref-20-services--light-1440.png

![ref-20-services--light-1440.png](https://github.com/tekClovis/dashBoard/blob/feature/mockui-services-profile/features/mockui-services-profile/verification/ref-20-services--light-1440.png?raw=true)

### ref-20-services--light-375.png

![ref-20-services--light-375.png](https://github.com/tekClovis/dashBoard/blob/feature/mockui-services-profile/features/mockui-services-profile/verification/ref-20-services--light-375.png?raw=true)

### ref-21-services-reconnect--dark-1440.png

![ref-21-services-reconnect--dark-1440.png](https://github.com/tekClovis/dashBoard/blob/feature/mockui-services-profile/features/mockui-services-profile/verification/ref-21-services-reconnect--dark-1440.png?raw=true)

### ref-21-services-reconnect--dark-375.png

![ref-21-services-reconnect--dark-375.png](https://github.com/tekClovis/dashBoard/blob/feature/mockui-services-profile/features/mockui-services-profile/verification/ref-21-services-reconnect--dark-375.png?raw=true)

### ref-21-services-reconnect--light-1440.png

![ref-21-services-reconnect--light-1440.png](https://github.com/tekClovis/dashBoard/blob/feature/mockui-services-profile/features/mockui-services-profile/verification/ref-21-services-reconnect--light-1440.png?raw=true)

### ref-21-services-reconnect--light-375.png

![ref-21-services-reconnect--light-375.png](https://github.com/tekClovis/dashBoard/blob/feature/mockui-services-profile/features/mockui-services-profile/verification/ref-21-services-reconnect--light-375.png?raw=true)

### ref-22-profile--dark-1440.png

![ref-22-profile--dark-1440.png](https://github.com/tekClovis/dashBoard/blob/feature/mockui-services-profile/features/mockui-services-profile/verification/ref-22-profile--dark-1440.png?raw=true)

### ref-22-profile--dark-375.png

![ref-22-profile--dark-375.png](https://github.com/tekClovis/dashBoard/blob/feature/mockui-services-profile/features/mockui-services-profile/verification/ref-22-profile--dark-375.png?raw=true)

### ref-22-profile--light-1440.png

![ref-22-profile--light-1440.png](https://github.com/tekClovis/dashBoard/blob/feature/mockui-services-profile/features/mockui-services-profile/verification/ref-22-profile--light-1440.png?raw=true)

### ref-22-profile--light-375.png

![ref-22-profile--light-375.png](https://github.com/tekClovis/dashBoard/blob/feature/mockui-services-profile/features/mockui-services-profile/verification/ref-22-profile--light-375.png?raw=true)

### ref-mock-disconnect-confirm--dark-1440.png

![ref-mock-disconnect-confirm--dark-1440.png](https://github.com/tekClovis/dashBoard/blob/feature/mockui-services-profile/features/mockui-services-profile/verification/ref-mock-disconnect-confirm--dark-1440.png?raw=true)

### ref-mock-profile-link-refused--dark-1440.png

![ref-mock-profile-link-refused--dark-1440.png](https://github.com/tekClovis/dashBoard/blob/feature/mockui-services-profile/features/mockui-services-profile/verification/ref-mock-profile-link-refused--dark-1440.png?raw=true)

### ref-mock-profile-sole--dark-1440.png

![ref-mock-profile-sole--dark-1440.png](https://github.com/tekClovis/dashBoard/blob/feature/mockui-services-profile/features/mockui-services-profile/verification/ref-mock-profile-sole--dark-1440.png?raw=true)

### ref-mock-services-loading--dark-1440.png

![ref-mock-services-loading--dark-1440.png](https://github.com/tekClovis/dashBoard/blob/feature/mockui-services-profile/features/mockui-services-profile/verification/ref-mock-services-loading--dark-1440.png?raw=true)

### services-default--dark-1440.png

![services-default--dark-1440.png](https://github.com/tekClovis/dashBoard/blob/feature/mockui-services-profile/features/mockui-services-profile/verification/services-default--dark-1440.png?raw=true)

### services-default--dark-375.png

![services-default--dark-375.png](https://github.com/tekClovis/dashBoard/blob/feature/mockui-services-profile/features/mockui-services-profile/verification/services-default--dark-375.png?raw=true)

### services-default--light-1440.png

![services-default--light-1440.png](https://github.com/tekClovis/dashBoard/blob/feature/mockui-services-profile/features/mockui-services-profile/verification/services-default--light-1440.png?raw=true)

### services-default--light-375.png

![services-default--light-375.png](https://github.com/tekClovis/dashBoard/blob/feature/mockui-services-profile/features/mockui-services-profile/verification/services-default--light-375.png?raw=true)

### services-fetch-error--dark-1440.png

![services-fetch-error--dark-1440.png](https://github.com/tekClovis/dashBoard/blob/feature/mockui-services-profile/features/mockui-services-profile/verification/services-fetch-error--dark-1440.png?raw=true)

### services-loading--dark-1440.png

![services-loading--dark-1440.png](https://github.com/tekClovis/dashBoard/blob/feature/mockui-services-profile/features/mockui-services-profile/verification/services-loading--dark-1440.png?raw=true)

### services-loading--dark-375.png

![services-loading--dark-375.png](https://github.com/tekClovis/dashBoard/blob/feature/mockui-services-profile/features/mockui-services-profile/verification/services-loading--dark-375.png?raw=true)

### services-loading--light-1440.png

![services-loading--light-1440.png](https://github.com/tekClovis/dashBoard/blob/feature/mockui-services-profile/features/mockui-services-profile/verification/services-loading--light-1440.png?raw=true)

### services-loading--light-375.png

![services-loading--light-375.png](https://github.com/tekClovis/dashBoard/blob/feature/mockui-services-profile/features/mockui-services-profile/verification/services-loading--light-375.png?raw=true)

### services-real--dark-1440.png

![services-real--dark-1440.png](https://github.com/tekClovis/dashBoard/blob/feature/mockui-services-profile/features/mockui-services-profile/verification/services-real--dark-1440.png?raw=true)

### services-real--dark-375.png

![services-real--dark-375.png](https://github.com/tekClovis/dashBoard/blob/feature/mockui-services-profile/features/mockui-services-profile/verification/services-real--dark-375.png?raw=true)

### services-real--light-1440.png

![services-real--light-1440.png](https://github.com/tekClovis/dashBoard/blob/feature/mockui-services-profile/features/mockui-services-profile/verification/services-real--light-1440.png?raw=true)

### services-real--light-375.png

![services-real--light-375.png](https://github.com/tekClovis/dashBoard/blob/feature/mockui-services-profile/features/mockui-services-profile/verification/services-real--light-375.png?raw=true)

### services-reauth--dark-1440.png

![services-reauth--dark-1440.png](https://github.com/tekClovis/dashBoard/blob/feature/mockui-services-profile/features/mockui-services-profile/verification/services-reauth--dark-1440.png?raw=true)

### services-reauth--dark-375.png

![services-reauth--dark-375.png](https://github.com/tekClovis/dashBoard/blob/feature/mockui-services-profile/features/mockui-services-profile/verification/services-reauth--dark-375.png?raw=true)

### services-reauth--light-1440.png

![services-reauth--light-1440.png](https://github.com/tekClovis/dashBoard/blob/feature/mockui-services-profile/features/mockui-services-profile/verification/services-reauth--light-1440.png?raw=true)

### services-reauth--light-375.png

![services-reauth--light-375.png](https://github.com/tekClovis/dashBoard/blob/feature/mockui-services-profile/features/mockui-services-profile/verification/services-reauth--light-375.png?raw=true)

