## Code: TypeScript — TSDoc

- `/** … */` directly above the declaration. First paragraph is the summary, one sentence ending with a period.
- Tags, in this order, only when they add something: `@param name - description`, `@returns description`, `@throws {@link ErrorType} when`, `@example`, `@deprecated reason and replacement`, `@see`.
- Never write types in tags: the signature has them. Hyphen after the param name.
- `@returns` describes meaning; omit it for `void` and for a getter whose name says it.
- Document exported functions, classes, interfaces, type aliases and their non-obvious members. An interface property gets a `/** … */` line only for units, ranges or invariants.
- Link symbols with `{@link Name}`.
- `//` comments explain why, never what.

```ts
/**
 * Retry a request with exponential backoff.
 * @param attempts - Total tries including the first; 1 disables retrying.
 * @throws {@link TimeoutError} when the last attempt times out.
 */
export async function withRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T>
```
## Project — arc42-lite

- `README.md`: one-line purpose, install, run, test (exact commands), and a link to the architecture doc.
- `docs/Architecture.md` (existing file, keep its name and numbered sections where they map), one file, the 12 arc42 sections numbered as below. A section with nothing to say is left out, not stubbed.
  1. **Introduction and goals**: what the system does, top 3 quality goals.
  2. **Constraints**: technical and organisational constraints that shaped it.
  3. **Context and scope**: external systems and users, as a Mermaid `flowchart` with the interfaces labelled.
  4. **Solution strategy**: the few key choices (stack, architecture style), one line each with the reason.
  5. **Building block view**: modules and their dependencies (level 1), then level 2 only for `big` modules.
  6. **Runtime view**: 1–3 key scenarios as numbered steps or a Mermaid `sequenceDiagram`.
  7. **Deployment view**: where and how it runs (containers, hosts, CI).
  8. **Crosscutting concepts**: error handling, logging, auth, persistence, config — one paragraph each that applies.
  9. **Architecture decisions**: table `decision | reason | rejected alternative`.
  10. **Quality requirements**: measurable targets for the goals of section 1.
  11. **Risks and technical debt**: known weak spots with `file` references.
  12. **Glossary**: domain terms used in code names, as a table.

## Not covered
- Prisma schema and SQL migrations (no code norm chosen).
- CSS (Tailwind) in web/src/index.css.
- features/*/spec.md and verification evidence (not source).
