## Verification checklist

1. **PASS**: every colour token in `:root` and `.dark` equals the mocks/index.html TOKENS block (0 mismatches). Evidence: [token-diff.txt](https://github.com/tekClovis/dashBoard/blob/feature/mockui-foundation/features/mockui-foundation/verification/token-diff.txt)
2. **PASS**: `@theme inline` exposes success, warning, live, destructive-foreground; `.text-success` and `.bg-warning` are in the built CSS. Evidence: [theme-compile.txt](https://github.com/tekClovis/dashBoard/blob/feature/mockui-foundation/features/mockui-foundation/verification/theme-compile.txt)
3. **PASS**: body font-family starts with "Archivo Variable", `.font-mono` with "Martian Mono Variable"; both woff2 load 200 from http://localhost:5199, no cross-origin request. Evidence: [fonts.txt](https://github.com/tekClovis/dashBoard/blob/feature/mockui-foundation/features/mockui-foundation/verification/fonts.txt)
4. **PASS**: badge, card, table, skeleton, alert, sheet, lamp exist under `web/src/components/ui/`, each with a Vitest spec (alert 4 tones, lamp 7 states, sheet open/close + focus return on Close and Esc). Evidence: [npm-test.txt](https://github.com/tekClovis/dashBoard/blob/feature/mockui-foundation/features/mockui-foundation/verification/npm-test.txt), [overlay-flows.txt](https://github.com/tekClovis/dashBoard/blob/feature/mockui-foundation/features/mockui-foundation/verification/overlay-flows.txt)
5. **PASS**: `web/index.html` and `web/src/lib/theme.ts` unchanged and agree; toggling the theme switches every new token. Evidence: [theme-toggle.txt](https://github.com/tekClovis/dashBoard/blob/feature/mockui-foundation/features/mockui-foundation/verification/theme-toggle.txt)
6. **PASS**: `npm test` 100/100, `npx tsc --noEmit` exit 0, `npm run lint` exit 0. Evidence: [npm-test.txt](https://github.com/tekClovis/dashBoard/blob/feature/mockui-foundation/features/mockui-foundation/verification/npm-test.txt), [tsc.txt](https://github.com/tekClovis/dashBoard/blob/feature/mockui-foundation/features/mockui-foundation/verification/tsc.txt), [lint.txt](https://github.com/tekClovis/dashBoard/blob/feature/mockui-foundation/features/mockui-foundation/verification/lint.txt)

## Screenshots

### dark 1440

![mock-gallery--dark-1440](https://github.com/tekClovis/dashBoard/blob/feature/mockui-foundation/features/mockui-foundation/verification/mock-gallery--dark-1440.png?raw=true)
![app-gallery--dark-1440](https://github.com/tekClovis/dashBoard/blob/feature/mockui-foundation/features/mockui-foundation/verification/app-gallery--dark-1440.png?raw=true)
![app-table-loading--dark-1440](https://github.com/tekClovis/dashBoard/blob/feature/mockui-foundation/features/mockui-foundation/verification/app-table-loading--dark-1440.png?raw=true)
![app-table-error--dark-1440](https://github.com/tekClovis/dashBoard/blob/feature/mockui-foundation/features/mockui-foundation/verification/app-table-error--dark-1440.png?raw=true)
![mock-sheet-open--dark-1440](https://github.com/tekClovis/dashBoard/blob/feature/mockui-foundation/features/mockui-foundation/verification/mock-sheet-open--dark-1440.png?raw=true)
![app-sheet-open--dark-1440](https://github.com/tekClovis/dashBoard/blob/feature/mockui-foundation/features/mockui-foundation/verification/app-sheet-open--dark-1440.png?raw=true)
![mock-dialog-open--dark-1440](https://github.com/tekClovis/dashBoard/blob/feature/mockui-foundation/features/mockui-foundation/verification/mock-dialog-open--dark-1440.png?raw=true)
![app-dialog-open--dark-1440](https://github.com/tekClovis/dashBoard/blob/feature/mockui-foundation/features/mockui-foundation/verification/app-dialog-open--dark-1440.png?raw=true)
![app-menu-open--dark-1440](https://github.com/tekClovis/dashBoard/blob/feature/mockui-foundation/features/mockui-foundation/verification/app-menu-open--dark-1440.png?raw=true)
![ref-01-login--dark-1440](https://github.com/tekClovis/dashBoard/blob/feature/mockui-foundation/features/mockui-foundation/verification/ref-01-login--dark-1440.png?raw=true)
![app-login--dark-1440](https://github.com/tekClovis/dashBoard/blob/feature/mockui-foundation/features/mockui-foundation/verification/app-login--dark-1440.png?raw=true)

### dark 375

![mock-gallery--dark-375](https://github.com/tekClovis/dashBoard/blob/feature/mockui-foundation/features/mockui-foundation/verification/mock-gallery--dark-375.png?raw=true)
![app-gallery--dark-375](https://github.com/tekClovis/dashBoard/blob/feature/mockui-foundation/features/mockui-foundation/verification/app-gallery--dark-375.png?raw=true)
![app-table-loading--dark-375](https://github.com/tekClovis/dashBoard/blob/feature/mockui-foundation/features/mockui-foundation/verification/app-table-loading--dark-375.png?raw=true)
![app-table-error--dark-375](https://github.com/tekClovis/dashBoard/blob/feature/mockui-foundation/features/mockui-foundation/verification/app-table-error--dark-375.png?raw=true)
![mock-sheet-open--dark-375](https://github.com/tekClovis/dashBoard/blob/feature/mockui-foundation/features/mockui-foundation/verification/mock-sheet-open--dark-375.png?raw=true)
![app-sheet-open--dark-375](https://github.com/tekClovis/dashBoard/blob/feature/mockui-foundation/features/mockui-foundation/verification/app-sheet-open--dark-375.png?raw=true)
![mock-dialog-open--dark-375](https://github.com/tekClovis/dashBoard/blob/feature/mockui-foundation/features/mockui-foundation/verification/mock-dialog-open--dark-375.png?raw=true)
![app-dialog-open--dark-375](https://github.com/tekClovis/dashBoard/blob/feature/mockui-foundation/features/mockui-foundation/verification/app-dialog-open--dark-375.png?raw=true)
![app-menu-open--dark-375](https://github.com/tekClovis/dashBoard/blob/feature/mockui-foundation/features/mockui-foundation/verification/app-menu-open--dark-375.png?raw=true)
![ref-01-login--dark-375](https://github.com/tekClovis/dashBoard/blob/feature/mockui-foundation/features/mockui-foundation/verification/ref-01-login--dark-375.png?raw=true)
![app-login--dark-375](https://github.com/tekClovis/dashBoard/blob/feature/mockui-foundation/features/mockui-foundation/verification/app-login--dark-375.png?raw=true)

### light 1440

![mock-gallery--light-1440](https://github.com/tekClovis/dashBoard/blob/feature/mockui-foundation/features/mockui-foundation/verification/mock-gallery--light-1440.png?raw=true)
![app-gallery--light-1440](https://github.com/tekClovis/dashBoard/blob/feature/mockui-foundation/features/mockui-foundation/verification/app-gallery--light-1440.png?raw=true)
![app-table-loading--light-1440](https://github.com/tekClovis/dashBoard/blob/feature/mockui-foundation/features/mockui-foundation/verification/app-table-loading--light-1440.png?raw=true)
![app-table-error--light-1440](https://github.com/tekClovis/dashBoard/blob/feature/mockui-foundation/features/mockui-foundation/verification/app-table-error--light-1440.png?raw=true)
![mock-sheet-open--light-1440](https://github.com/tekClovis/dashBoard/blob/feature/mockui-foundation/features/mockui-foundation/verification/mock-sheet-open--light-1440.png?raw=true)
![app-sheet-open--light-1440](https://github.com/tekClovis/dashBoard/blob/feature/mockui-foundation/features/mockui-foundation/verification/app-sheet-open--light-1440.png?raw=true)
![mock-dialog-open--light-1440](https://github.com/tekClovis/dashBoard/blob/feature/mockui-foundation/features/mockui-foundation/verification/mock-dialog-open--light-1440.png?raw=true)
![app-dialog-open--light-1440](https://github.com/tekClovis/dashBoard/blob/feature/mockui-foundation/features/mockui-foundation/verification/app-dialog-open--light-1440.png?raw=true)
![app-menu-open--light-1440](https://github.com/tekClovis/dashBoard/blob/feature/mockui-foundation/features/mockui-foundation/verification/app-menu-open--light-1440.png?raw=true)
![ref-01-login--light-1440](https://github.com/tekClovis/dashBoard/blob/feature/mockui-foundation/features/mockui-foundation/verification/ref-01-login--light-1440.png?raw=true)
![app-login--light-1440](https://github.com/tekClovis/dashBoard/blob/feature/mockui-foundation/features/mockui-foundation/verification/app-login--light-1440.png?raw=true)

### light 375

![mock-gallery--light-375](https://github.com/tekClovis/dashBoard/blob/feature/mockui-foundation/features/mockui-foundation/verification/mock-gallery--light-375.png?raw=true)
![app-gallery--light-375](https://github.com/tekClovis/dashBoard/blob/feature/mockui-foundation/features/mockui-foundation/verification/app-gallery--light-375.png?raw=true)
![app-table-loading--light-375](https://github.com/tekClovis/dashBoard/blob/feature/mockui-foundation/features/mockui-foundation/verification/app-table-loading--light-375.png?raw=true)
![app-table-error--light-375](https://github.com/tekClovis/dashBoard/blob/feature/mockui-foundation/features/mockui-foundation/verification/app-table-error--light-375.png?raw=true)
![mock-sheet-open--light-375](https://github.com/tekClovis/dashBoard/blob/feature/mockui-foundation/features/mockui-foundation/verification/mock-sheet-open--light-375.png?raw=true)
![app-sheet-open--light-375](https://github.com/tekClovis/dashBoard/blob/feature/mockui-foundation/features/mockui-foundation/verification/app-sheet-open--light-375.png?raw=true)
![mock-dialog-open--light-375](https://github.com/tekClovis/dashBoard/blob/feature/mockui-foundation/features/mockui-foundation/verification/mock-dialog-open--light-375.png?raw=true)
![app-dialog-open--light-375](https://github.com/tekClovis/dashBoard/blob/feature/mockui-foundation/features/mockui-foundation/verification/app-dialog-open--light-375.png?raw=true)
![app-menu-open--light-375](https://github.com/tekClovis/dashBoard/blob/feature/mockui-foundation/features/mockui-foundation/verification/app-menu-open--light-375.png?raw=true)
![ref-01-login--light-375](https://github.com/tekClovis/dashBoard/blob/feature/mockui-foundation/features/mockui-foundation/verification/ref-01-login--light-375.png?raw=true)
![app-login--light-375](https://github.com/tekClovis/dashBoard/blob/feature/mockui-foundation/features/mockui-foundation/verification/app-login--light-375.png?raw=true)

