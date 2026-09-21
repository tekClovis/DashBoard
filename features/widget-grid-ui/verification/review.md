# widget-grid-ui review 7 (final gate)

Real Chrome (/usr/bin/google-chrome via playwright-core), mocked API/socket. Harnesses: review-harness.cjs, -2, -8 (race variations), -9 (repro C), -10 (dialog/validation/aria/mobile), -11 (mobile ordering). Rendered position measured in grid units from DOM rects and compared with the mock server's stored layout.

## (a) Optimistic-layout race (slow PATCH 1.5-2s)
| Scenario | Result | Evidence |
|---|---|---|
| R1 drag w3, delete w1 at 300ms | PASS (transient flash, see note 1) | settled + reload: stored w3 7,3 == UI 7,3; 1 PATCH, 2 GETs; no overlap |
| R2 add widget during PATCH | PASS | settled + reload: stored == UI (w3 7,3; new w10 0,6); 1 PATCH, 1 POST, 2 GETs |
| R3 two overlapping drags | PASS | 2 PATCH, 2 GETs; settled + reload stored == UI, no overlap |
| R4 drag then immediate keyboard Move | PASS | 2 PATCH; settled + reload stored == UI (w2 5,0; w3 7,3) |
| R5 delete during resize PATCH | PASS | stored == UI after settle and reload except note 2 |
No PATCH/GET storms (max 2 GETs per gesture). Extra invalidate GET never leaves render != stored after settle.

## (b) PATCH 500: PASS
`role=alert` "Could not save the layout." shown; grid reverts to stored positions (screenshot 64-B500.png).

## (c) Drag repro / resize / keyboard: PASS
4 stacked, drag 3rd onto 4th: 1 PATCH, 0 subscribe / 0 unsubscribe, rendered == stored, same after reload (65-C.png). Resize: 1 PATCH, 0 sub/unsub, rendered == stored after reload. Keyboard Move right/down: 1 PATCH each, 0 sub/unsub, rendered == stored after reload.

## (d) spec.md checklist
1. PASS - 4-step dialog, POST with x/y/w/h at nextSlot, widget appears immediately (06-12, 73, 53-add).
2. PASS - github (unconnected) button disabled, "Connect" link -> /services.
3. PASS - enum -> SELECT, integer -> number min=1 max=7 with "Must be at least 1 / at most 7", pattern -> text with "Must match ^[A-Za-z ]+$", Next disabled (70, 71).
4. PASS - drag/resize PATCH x/y/w/h; reload keeps position (02-04).
5. PASS - <768px: 0 react-grid-items, order by (y,x) verified with fixtures C(4,3) A(8,0) B(0,0) -> B, A, C (75-mobile-order.png); mouse drag on handle -> 0 PATCH (74-mobile).
6. PASS - skeleton before first data, JSON fallback after, Reconnect link href=/services on REAUTH_REQUIRED/NOT_CONNECTED (01, 16).
7. PASS - Configure prefilled (city Paris, refresh 60); with catalog delayed 3s shows Loading then prefilled (19, 20); catalog error shows alert (21); PATCH /widgets/w1 on Save.
8. PASS - Delete -> DELETE /widgets/w3, removed from grid (14).
9. PASS - Move up/down/left/right via menu items, keyboard-only reachable, persists via layout PATCH (17, 18).
10. PASS - aria-live="polite" on the content region (DIV.flex-1 overflow-auto), null on the card element and header.
Refresh bounds: 59 invalid, 60 ok, 86400 ok, 86401 invalid, 60.5 invalid, empty invalid (72).
Error + Retry: list fetch error shows "Could not load your widgets." + Retry; after Retry 3 items (22).

## (e) Static / tests
- `npm run lint`: exit 0 (warnings only, pre-existing files).
- `npm test`: server 113/113, web 46/46.
- `npm run build -w web`: OK. `tsc --noEmit` web and server: clean.
- server e2e (Docker): 7 files, 65/65 passed.

## Non-blocking notes (verdict unaffected)
1. Transient snap in R1: the delete's invalidate GET returns the pre-PATCH server layout while the layout PATCH is still pending, so w3 jumps from its dropped spot (723,220) to (10,10) and returns to 723,220 when PATCH settles (frame trace in run; ~PATCH duration, imperceptible at realistic latency). Fix if desired at web/src/api/widgets.ts (useDeleteWidget/useCreateWidget/useUpdateLayout onSettled): skip invalidate while `queryClient.isMutating() > 1`. Eventually consistent, no data loss.
2. Layout normalized on render but not persisted on load (e.g. R5 stored w3 0,3 while UI shows 0,0 after deleting w1). Known, out of scope.
3. Shell header overflows at 390px (406px scrollWidth). Out of scope (shell).
4. Load-error state appears after ~7s (query retries) before Retry shows.
5. Viewport resize across md remounts widgets (resubscribes); expected for breakpoint switch.

## Overall verdict: PASS
