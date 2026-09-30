# tests-service-clients findings

Bugs found in `server/src` while writing the specs. Not fixed; each is pinned by an `it.fails` test asserting the correct behaviour.

## #1 GitHub transport error text, access token included, is sent to the client

- Where: `server/src/services/github/github-api.ts:44`
- Code: ``throw new FetchError('UPSTREAM_ERROR', `GitHub request failed: ${err instanceof Error ? err.message : String(err)}`);``
- Why it is a bug: `TimerService.handleFailure` (`server/src/timer/timer.service.ts:125`, `:131`, `:143`) emits a thrown error's `message` to the client. Node's fetch quotes an invalid header value in its error text, so a stored token containing a character that is illegal in a header ends up verbatim in the widget error. Reproduced on Node v24.18.0 (no request leaves the machine, the header check throws first):

  ```
  $ node -e "fetch('https://api.github.com/x',{headers:{Authorization:'Bearer gho_SEC\nRET'}}).then(()=>console.log('resolved'),e=>console.log(process.version, e.name+': '+JSON.stringify(e.message)))"
  v24.18.0 TypeError: "Headers.append: \"Bearer gho_SEC\nRET\" is an invalid header value."
  ```

  `server/src/services/youtube/youtube-api.ts:69-71` already handles the same case with a fixed message.
- Correct behaviour: `UPSTREAM_ERROR` with a fixed message containing nothing of the transport error.
- Pin: `server/src/services/github/github-api.spec.ts:142`, `it.fails('keeps the access token out of a transport error message')`.
