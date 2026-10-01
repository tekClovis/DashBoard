## Verification checklist

1. **PASS** — Desktop header (brand, nav with `aria-current="page"` on Dashboard, Live lamp + label, theme toggle, account avatar): [dark](https://github.com/tekClovis/dashBoard/blob/feature/mockui-shell/features/mockui-shell/verification/01-header-dark-1440.png?raw=true), [light](https://github.com/tekClovis/dashBoard/blob/feature/mockui-shell/features/mockui-shell/verification/01-header-light-1440.png?raw=true)
2. **PASS** — 375 px header: [dark](https://github.com/tekClovis/dashBoard/blob/feature/mockui-shell/features/mockui-shell/verification/02-header-dark-375.png?raw=true), [light](https://github.com/tekClovis/dashBoard/blob/feature/mockui-shell/features/mockui-shell/verification/02-header-light-375.png?raw=true); open sheet: [dark](https://github.com/tekClovis/dashBoard/blob/feature/mockui-shell/features/mockui-shell/verification/02-mobile-menu-dark-375.png?raw=true), [light](https://github.com/tekClovis/dashBoard/blob/feature/mockui-shell/features/mockui-shell/verification/02-mobile-menu-light-375.png?raw=true); Escape closed it and focus returned to "Open menu": [after Escape](https://github.com/tekClovis/dashBoard/blob/feature/mockui-shell/features/mockui-shell/verification/02-mobile-menu-escape-light-375.png?raw=true); sheet closes on widening to 1440 px: [widened](https://github.com/tekClovis/dashBoard/blob/feature/mockui-shell/features/mockui-shell/verification/02-sheet-closes-on-widen-dark-1440.png?raw=true); sheet theme toggle and nav link: [theme](https://github.com/tekClovis/dashBoard/blob/feature/mockui-shell/features/mockui-shell/verification/02-mobile-menu-theme-toggled-375.png?raw=true), [Services](https://github.com/tekClovis/dashBoard/blob/feature/mockui-shell/features/mockui-shell/verification/02-services-after-sheet-nav-light-375.png?raw=true)
3. **PASS** — Account menu shows the email, Profile and Log out: [menu](https://github.com/tekClovis/dashBoard/blob/feature/mockui-shell/features/mockui-shell/verification/03-account-menu-dark-1440.png?raw=true); Log out sent `POST /api/auth/logout` (200), opened /login, and `/api/auth/me` then returned 401: [account menu logout](https://github.com/tekClovis/dashBoard/blob/feature/mockui-shell/features/mockui-shell/verification/06-after-account-logout-dark-1440.png?raw=true), [sheet logout](https://github.com/tekClovis/dashBoard/blob/feature/mockui-shell/features/mockui-shell/verification/06-after-sheet-logout-light-375.png?raw=true)
4. **PASS** — Socket blocked with `agent-browser network route --abort` and `set offline on`; the shell went live → Reconnecting #1..#4 → Offline. Reconnecting: [dark 1440](https://github.com/tekClovis/dashBoard/blob/feature/mockui-shell/features/mockui-shell/verification/05-reconnecting-dark-1440.png?raw=true), [light 1440](https://github.com/tekClovis/dashBoard/blob/feature/mockui-shell/features/mockui-shell/verification/05-reconnecting-light-1440.png?raw=true), [dark 375](https://github.com/tekClovis/dashBoard/blob/feature/mockui-shell/features/mockui-shell/verification/05-reconnecting-dark-375.png?raw=true), [light 375](https://github.com/tekClovis/dashBoard/blob/feature/mockui-shell/features/mockui-shell/verification/05-reconnecting-light-375.png?raw=true). Offline + Retry: [dark 1440](https://github.com/tekClovis/dashBoard/blob/feature/mockui-shell/features/mockui-shell/verification/04-offline-dark-1440.png?raw=true), [light 1440](https://github.com/tekClovis/dashBoard/blob/feature/mockui-shell/features/mockui-shell/verification/04-offline-light-1440.png?raw=true), [dark 375](https://github.com/tekClovis/dashBoard/blob/feature/mockui-shell/features/mockui-shell/verification/04-offline-dark-375.png?raw=true), [light 375](https://github.com/tekClovis/dashBoard/blob/feature/mockui-shell/features/mockui-shell/verification/04-offline-light-375.png?raw=true). Retry now went back to Live: [after retry](https://github.com/tekClovis/dashBoard/blob/feature/mockui-shell/features/mockui-shell/verification/04-retry-back-to-live-light-1440.png?raw=true)
5. **PASS** — `web/src/realtime/SocketProvider.spec.tsx` covers live → reconnecting 1 → 2 → offline → live; `web/src/routes/AppShell.spec.tsx` checks the lamp state, label and banner for each step (included in the run under item 7)
6. **PASS** — No Admin link for a USER in the live app ([desktop](https://github.com/tekClovis/dashBoard/blob/feature/mockui-shell/features/mockui-shell/verification/01-header-dark-1440.png?raw=true), [sheet](https://github.com/tekClovis/dashBoard/blob/feature/mockui-shell/features/mockui-shell/verification/02-mobile-menu-dark-375.png?raw=true)); `AppShell.spec.tsx` "hides the Admin link for a USER" and "shows the Admin link for an ADMIN" pass
7. **PASS** — In `web/`: `npm test` 29 files / 107 tests passed; `npx tsc --noEmit` exit 0; `npm run lint` exit 0 (one warning in the untouched `src/api/client.ts`)

## Screenshots

### 01-header-dark-1440.png

![01-header-dark-1440.png](https://github.com/tekClovis/dashBoard/blob/feature/mockui-shell/features/mockui-shell/verification/01-header-dark-1440.png?raw=true)

### 01-header-light-1440.png

![01-header-light-1440.png](https://github.com/tekClovis/dashBoard/blob/feature/mockui-shell/features/mockui-shell/verification/01-header-light-1440.png?raw=true)

### 02-header-dark-375.png

![02-header-dark-375.png](https://github.com/tekClovis/dashBoard/blob/feature/mockui-shell/features/mockui-shell/verification/02-header-dark-375.png?raw=true)

### 02-header-light-375.png

![02-header-light-375.png](https://github.com/tekClovis/dashBoard/blob/feature/mockui-shell/features/mockui-shell/verification/02-header-light-375.png?raw=true)

### 02-mobile-menu-dark-375.png

![02-mobile-menu-dark-375.png](https://github.com/tekClovis/dashBoard/blob/feature/mockui-shell/features/mockui-shell/verification/02-mobile-menu-dark-375.png?raw=true)

### 02-mobile-menu-escape-light-375.png

![02-mobile-menu-escape-light-375.png](https://github.com/tekClovis/dashBoard/blob/feature/mockui-shell/features/mockui-shell/verification/02-mobile-menu-escape-light-375.png?raw=true)

### 02-mobile-menu-light-375.png

![02-mobile-menu-light-375.png](https://github.com/tekClovis/dashBoard/blob/feature/mockui-shell/features/mockui-shell/verification/02-mobile-menu-light-375.png?raw=true)

### 02-mobile-menu-theme-toggled-375.png

![02-mobile-menu-theme-toggled-375.png](https://github.com/tekClovis/dashBoard/blob/feature/mockui-shell/features/mockui-shell/verification/02-mobile-menu-theme-toggled-375.png?raw=true)

### 02-services-after-sheet-nav-light-375.png

![02-services-after-sheet-nav-light-375.png](https://github.com/tekClovis/dashBoard/blob/feature/mockui-shell/features/mockui-shell/verification/02-services-after-sheet-nav-light-375.png?raw=true)

### 02-sheet-closes-on-widen-dark-1440.png

![02-sheet-closes-on-widen-dark-1440.png](https://github.com/tekClovis/dashBoard/blob/feature/mockui-shell/features/mockui-shell/verification/02-sheet-closes-on-widen-dark-1440.png?raw=true)

### 03-account-menu-dark-1440.png

![03-account-menu-dark-1440.png](https://github.com/tekClovis/dashBoard/blob/feature/mockui-shell/features/mockui-shell/verification/03-account-menu-dark-1440.png?raw=true)

### 04-offline-dark-1440.png

![04-offline-dark-1440.png](https://github.com/tekClovis/dashBoard/blob/feature/mockui-shell/features/mockui-shell/verification/04-offline-dark-1440.png?raw=true)

### 04-offline-dark-375.png

![04-offline-dark-375.png](https://github.com/tekClovis/dashBoard/blob/feature/mockui-shell/features/mockui-shell/verification/04-offline-dark-375.png?raw=true)

### 04-offline-light-1440.png

![04-offline-light-1440.png](https://github.com/tekClovis/dashBoard/blob/feature/mockui-shell/features/mockui-shell/verification/04-offline-light-1440.png?raw=true)

### 04-offline-light-375.png

![04-offline-light-375.png](https://github.com/tekClovis/dashBoard/blob/feature/mockui-shell/features/mockui-shell/verification/04-offline-light-375.png?raw=true)

### 04-retry-back-to-live-light-1440.png

![04-retry-back-to-live-light-1440.png](https://github.com/tekClovis/dashBoard/blob/feature/mockui-shell/features/mockui-shell/verification/04-retry-back-to-live-light-1440.png?raw=true)

### 05-reconnecting-dark-1440.png

![05-reconnecting-dark-1440.png](https://github.com/tekClovis/dashBoard/blob/feature/mockui-shell/features/mockui-shell/verification/05-reconnecting-dark-1440.png?raw=true)

### 05-reconnecting-dark-375.png

![05-reconnecting-dark-375.png](https://github.com/tekClovis/dashBoard/blob/feature/mockui-shell/features/mockui-shell/verification/05-reconnecting-dark-375.png?raw=true)

### 05-reconnecting-light-1440.png

![05-reconnecting-light-1440.png](https://github.com/tekClovis/dashBoard/blob/feature/mockui-shell/features/mockui-shell/verification/05-reconnecting-light-1440.png?raw=true)

### 05-reconnecting-light-375.png

![05-reconnecting-light-375.png](https://github.com/tekClovis/dashBoard/blob/feature/mockui-shell/features/mockui-shell/verification/05-reconnecting-light-375.png?raw=true)

### 06-after-account-logout-dark-1440.png

![06-after-account-logout-dark-1440.png](https://github.com/tekClovis/dashBoard/blob/feature/mockui-shell/features/mockui-shell/verification/06-after-account-logout-dark-1440.png?raw=true)

### 06-after-sheet-logout-light-375.png

![06-after-sheet-logout-light-375.png](https://github.com/tekClovis/dashBoard/blob/feature/mockui-shell/features/mockui-shell/verification/06-after-sheet-logout-light-375.png?raw=true)

