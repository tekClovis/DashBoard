# frontend-shell review (tip 55c943f, second reviewer)

Commands: `npm run lint` 0 errors (warnings only, incl. web/src/api/client.ts:17 no-misused-spread); `npm test` server 113/113, web 24/24; `npm run build -w web` OK; `tsc --noEmit` clean in web/ and server/.
Browser: /usr/bin/google-chrome via playwright-core, built web/dist served with a stateful mock API (Postgres/Redis not used). Socket.io endpoint stubbed 404, so header shows "connecting…" (real connect not exercised in browser; covered by SocketProvider.spec).
Screenshots in this dir: 01..11-*.png, mock-reference.png.

## Logout loop fix: VERIFIED in real browser
Logout click -> /login, exactly 1 /api/auth/me call, 0 further over 2.5s; /d/d1 afterwards -> /login; logout-all same (08, 09, 11). queryClient.clear() + isError gating in RedirectIfAuthed/RootRedirect works; not test-only.

## Checklist
1 PASS  unauth /d/d1 -> /login (01); authed /login -> /d/d1 (07)
2 PASS  login -> shell; email + role shown on Profile (02, 05)
3 PASS  SocketProvider.tsx connects on shell mount, `connected` context, disconnect on unmount (spec + logout-flow asserts disconnect); browser connection not exercised
4 PASS  useWidgetData.spec covers subscribe/unsubscribe/cache write; code reviewed
5 PASS  Connect/Disconnect/badges match mock (03, 04); Connect = redirect to /api/oauth/*/start?intent=connect. Note: page uses useConnections only; useCatalog exists but is unused (spec wording mentions both) - minor
6 PASS  unlink hidden/disabled for sole method (ProfilePage.tsx soleLoginMethod), logout/logout-all work (05, 08, 11)
7 PASS  Admin link absent for USER, present for ADMIN; /admin as USER shows 403 text (06, 10)
8 PASS  grep refetchInterval: none in non-spec source

## Verdict: PASS (no blocking defect found; minor: useCatalog unused, lint warning client.ts:17)
