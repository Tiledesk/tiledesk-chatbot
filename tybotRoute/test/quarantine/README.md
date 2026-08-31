# Quarantined tests

These files fail today. They are quarantined so the baseline is a clean
contract — **not** because the failures are acceptable.

They are excluded by the runner because `scripts/run-tests.js` reads `test/`
non-recursively.

## History

This directory originally held **12** files. Seven were released back into the
suite once the real cause was found: each test already started its own mock
server on port 10002 and registered the vendor/AI routes it needed
(`/api/v3/contacts`, `/crm/v3/objects/contacts/batch/create`,
`/1.2/getShipment/`, `/1.3/make/`, `/v1/chat/completions`, `/api/qa`,
`/api/ask`), but **nothing pointed the directives at that mock**. The
directives therefore called the real vendor hosts and timed out.

Setting the endpoint variables — now defaults in `scripts/run-tests.js`'s
`TEST_ENV` — released 41 tests. Released: askgpt, brevo, customerio, gpt_task,
hubspot, make, qapla.

If you add a service or change how one builds its url, update the matching base
in `TEST_ENV`. The comment there lists the url shape each base is derived from.

## What remains, and why

Measured with the endpoint variables correctly set:

| File | Pass | Fail | Why it is still here |
|---|---|---|---|
| conversation-askgptv2_test.js | 11 | 8 | 11 tests pass; the other 8 fail on assertions. Not an endpoint problem. |
| conversation-ai_prompt_test.js | 8 | 3 | 8 pass; 3 fail on assertions. Not an endpoint problem. |
| conversation-ai_condition_test.js | 0 | 8 | Times out. The known stale assertion (expects `"Error: AiCondition Error: 'question' attribute is undefined"`) plus a flow that never replies. |
| conversation-form-test.js | 0 | 7 | Times out. The bot reaches "Processing intent" and then never posts the reply the mock waits for. A flow bug, not configuration. |
| conversation-locked-intent-test.js | 0 | 1 | Times out, same shape as form-test. |

`askgptv2` and `ai_prompt` are the best next targets: 19 tests already pass in
them, and only the file-level failure keeps all 19 out of the gate. The runner
requires zero failures per file for it to enter the baseline.

## These failures are NOT caused by the refactor

Verified directly. All 12 files were run against the pre-refactor tree
(`467fde6b`, before any source restructuring) and against the fully refactored
tree, with identical environment:

```
before:  60 passing, 27 failing
after:   60 passing, 27 failing   -> identical, file by file
```

Every failure above predates the migration. Equally, the 60 passing tests were
written against the original code and pass unchanged on the refactored code —
which is the strongest retro-compatibility evidence this suite can give.

## A trap when adding tests here

`config/endpoints.js` `configure()` freezes any key present in the `startApp`
settings against later `process.env` mutation, for the life of the process. If
you start a mock server *after* `startApp` and then set
`process.env.KB_ENDPOINT_QA`, it will be ignored if that key was threaded
through settings. Set the variable before `startApp`, or leave the key out of
the settings object.
