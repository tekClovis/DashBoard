---
name: functional-ui
description: Build/extend a clickable HTML prototype (no real backend) before a feature gets coded. Internal — invoked by new-feature, not for direct use.
disable-model-invocation: true
---

Create a clickable prototype so the feature can be visualized and self-verified before any real code is written.

Follow `../CONVENTIONS.md` for project root and report-back format.

## 1. Master prototype

- If `mocks/index.html` does NOT exist:
  - Check for `mocks/design-reference.md`. If it exists, use the site URL recorded there as the visual reference.
  - If neither exists, ask the user (one question, per interview style): "No mock or design reference exists yet — is there a reference site whose look you want this project's UI to follow?" Accept a URL or "no". Save the answer to `mocks/design-reference.md` (just the URL, or `none`) so this is asked once per project and every later feature mock reuses it.
  - Create `mocks/index.html` as a static clickable prototype (HTML/CSS/vanilla JS, no backend, no build step) of the whole app as it currently stands. Follow any existing design reference in the project (e.g. `design.functional.md`, brand/style files) and the reference site if one was given, and match current UI patterns.
- If it exists: leave it alone. Created once, never regenerated. If `mocks/design-reference.md` exists, keep following it for new feature mocks.

## 2. Feature-scoped mock

Create `features/<name>/mock.html`, derived from `mocks/index.html`: enough surrounding app for context, but the new/changed flow must click through end-to-end for every state in the feature's `spec.md`. No backend — fake state with local JS/localStorage.

## 3. Report

Report-back format. List `mocks/index.html` and `mocks/design-reference.md` only if newly created.
