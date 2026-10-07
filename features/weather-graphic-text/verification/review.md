## weather-graphic-text: verification (third pass)

**Verdict: FAIL**

What was checked: branch `feature/weather-graphic-text` at 68bc597. This is the same commit as the second pass; the branch has no new commits. I built the web app from this worktree and served it with `vite preview` on :5199, with the dev API on :8080. I used the eight Paris `current_weather` widgets left by the second pass (4x3 default, 3x4, 2x4, 2x2, 3x2, 5x5, 4x2, 2x3). I measured them in the 1-point state on a fresh page load and in the 2-point state after the scheduled 10-minute refresh push. I compared them with `mock.html` states `trail=none|one|two|many`.

The results match the second pass. The text block still uses `@max-[260px]:sr-only`, which hides it based on width while the overflow is vertical. Its `mt-auto` still has no effect inside `WidgetFrame`'s `grid` body.

### Checklist

| # | Item | Result | Evidence |
|---|------|--------|----------|
| 1 | 0 or 1 trail points: no chart, current temperature and trend note as text | **FAIL** | No widget renders a chart (`chart: 0` in all 8). The text is not visible in 5 of the 8 sizes, though. At 2x4, 2x3 and 2x2 (225 px wide) "Now 15.3°C / Trend available after the next update" is `sr-only`: the 2x4 body is 230 px tall and shows blank space where the text should be. At 3x2 and 4x2 the text sits below the bottom edge of the panel (`trendTextBottomInsidePanel: false`). It is visible only at 4x3, 3x4 and 5x5. See [layout-metrics.txt](layout-metrics.txt) (1-point block) and [01-one-point-desktop.png](01-one-point-desktop.png). |
| 2 | 2 or more points: the graphic renders with a Now/Min/Max text caption | PASS | All 8 widgets have the Sparkline (`chart: 1`) and the caption `Now 15.2°Min 15.2°Max 15.3°`, which matches the 15.3 to 15.2 trail ([layout-metrics.txt](layout-metrics.txt), 2-point block; [02-two-points-desktop.png](02-two-points-desktop.png); [03-two-points-mobile.png](03-two-points-mobile.png)). The unit test asserts `Now 19.1°Min 17.6°Max 19.1°` ([weather-spec.txt](weather-spec.txt)). Visibility at short sizes is covered under item 3. |
| 3 | Text and graphic never render together, and nothing overflows at compact and normal sizes | **FAIL** | They never render together: `trendTextInDom` is false in every 2-point widget. But content overflows. With 1 point the body overflows at the default 4x3 (`scrollHeight 170 > clientHeight 162`), at 3x2 (`167 > 94`) and at 4x2 (`170 > 94`). With 2 points the caption is cut off at 4x3 (`254 > 162`, with the caption below the panel), 2x3, 2x2, 3x2 and 4x2, and at 3x4 the body overflows by 21 px. On mobile (375 px) every widget overflows (`271 > 223`). See [layout-metrics.txt](layout-metrics.txt), [01-one-point-desktop.png](01-one-point-desktop.png) (bottom middle, 4x2, is cut off under the stat) and [02-two-points-desktop.png](02-two-points-desktop.png) (top left, the default 4x3, shows the line but no caption). |
| 4 | weather.spec.tsx covers items 1-2; web tests, typecheck and lint pass | PASS | [weather-spec.txt](weather-spec.txt) (6/6), [web-tests.txt](web-tests.txt) (42 files, 309/309), [typecheck.txt](typecheck.txt) (`tsc --noEmit`, exit 0), [lint.txt](lint.txt) (exit 0, 1 warning in an untouched file) |

### Mock

| State | Result | Evidence |
|-------|--------|----------|
| `trail=none` / `trail=one` (text) | **FAIL** | The mock pins `.trend-text` to the bottom of the panel (`.trend { margin-top: auto }`) and shows it at every size ([mock-one-point.png](mock-one-point.png), [mock-zero-points.png](mock-zero-points.png)). The branch sits the text right under the stat, with an empty band below it at 3x4 and 5x5. It hides the text at widths of 260 px or less and pushes it out of the panel in short widgets ([01-one-point-desktop.png](01-one-point-desktop.png)). |
| `trail=two` / `trail=many` (graphic + caption) | PASS | The caption's content, order and mono style match the mock ([mock-two-points.png](mock-two-points.png), [mock-many-points.png](mock-many-points.png) vs [02-two-points-desktop.png](02-two-points-desktop.png)). |
| `w=error` (compact view under the error band) | PASS (unit test only) | I couldn't make the live server error. The evidence is the test `current_weather: compact still shows the trend text instead of a chart` in [weather-spec.txt](weather-spec.txt). |

### Notes

- Nothing changed since the second pass: HEAD is still 68bc597, and the diff against `main` touches only `weather.tsx` and `weather.spec.tsx`.
- To pass items 1 and 3, the visibility rule needs to depend on height, not width. One option is a container query on the panel's height; another is a class based on the grid `h`. The text block also needs a flex column or `align-content: end` to sit at the bottom as in the mock.
- The test `the trend text is visually hidden (still read) in the narrowest widgets` only checks the class string. It does not check layout.
- The 2-point clipping at short sizes probably also exists on `main`, because the Sparkline is not new. The caption this branch adds makes it worse. I did not build `main` to compare.
- The caption's "Now" uses `data.temperature`, while Min and Max use the trail values. These are the same today.
- `lint.txt` has one warning, `no-misused-spread` in `src/api/client.ts`. That file is not touched by this branch.
- `spec.md` and `mock.html` are not committed on this branch. I read them from the main checkout.
- The first two passes left two test users in the dev DB, `wgt-review-1791404503@example.com` and `wgt-review2-1791405067@example.com`. This pass used the second one (registration was rate-limited, so I reset its password), and then deleted both through `DELETE /api/users/me`. No `wgt-review%` users remain.

### Screenshots

**1 point, desktop: 4x3, 3x4, 2x4, 2x2 / 3x2 (top row); 5x5, 4x2, 2x3 (bottom row)**
![1 point desktop](https://github.com/tekClovis/dashBoard/blob/feature/weather-graphic-text/features/weather-graphic-text/verification/01-one-point-desktop.png?raw=true)

**2 points, desktop**
![2 points desktop](https://github.com/tekClovis/dashBoard/blob/feature/weather-graphic-text/features/weather-graphic-text/verification/02-two-points-desktop.png?raw=true)

**2 points, mobile (375 px)**
![2 points mobile](https://github.com/tekClovis/dashBoard/blob/feature/weather-graphic-text/features/weather-graphic-text/verification/03-two-points-mobile.png?raw=true)

**Mock: 0 points**
![mock 0 points](https://github.com/tekClovis/dashBoard/blob/feature/weather-graphic-text/features/weather-graphic-text/verification/mock-zero-points.png?raw=true)

**Mock: 1 point (text pinned to the bottom of the panel)**
![mock 1 point](https://github.com/tekClovis/dashBoard/blob/feature/weather-graphic-text/features/weather-graphic-text/verification/mock-one-point.png?raw=true)

**Mock: 2 points**
![mock 2 points](https://github.com/tekClovis/dashBoard/blob/feature/weather-graphic-text/features/weather-graphic-text/verification/mock-two-points.png?raw=true)

**Mock: 12 points**
![mock 12 points](https://github.com/tekClovis/dashBoard/blob/feature/weather-graphic-text/features/weather-graphic-text/verification/mock-many-points.png?raw=true)
