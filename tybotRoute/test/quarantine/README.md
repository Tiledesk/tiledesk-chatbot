# Quarantined tests

**This directory is empty.** All 12 files that once lived here have been
released back into the suite.

It is kept, with this README, as the documented place to park a test that is
genuinely red for a reason you cannot fix in the same change — and as a record
of what "quarantined" turned out to mean here, which was never "the product is
broken and we accept it".

Files here are excluded because `scripts/run-tests.js` reads `test/`
non-recursively. That is the whole mechanism.

## History

Three waves, none of which needed a test to be weakened.

### Wave 1 — seven files: nothing pointed the directives at the mock

Each test already started its own mock server on port 10002 and registered the
vendor/AI routes it needed (`/api/v3/contacts`,
`/crm/v3/objects/contacts/batch/create`, `/1.2/getShipment/`, `/1.3/make/`,
`/v1/chat/completions`, `/api/qa`, `/api/ask`) — but no endpoint variable
pointed the directives at it, so they called the real vendor hosts and timed
out. Setting those variables as defaults in `scripts/run-tests.js`'s `TEST_ENV`
released 41 tests: askgpt, brevo, customerio, gpt_task, hubspot, make, qapla.

If you add a service or change how one builds its url, update the matching base
in `TEST_ENV`. The comment there lists the url shape each base is derived from.

### Wave 2 — two files: `CHATBOT_TOKEN` was never set

`conversation-form-test.js` and `conversation-locked-intent-test.js` were the
only two files reading the bot token from `process.env.CHATBOT_TOKEN` instead
of hardcoding `"XXX"` like their ~20 siblings, so they sent
`token: undefined`. Both drive the plain-text answer path — legacy `answer:`
intents rather than designer actions — which is the only path that reaches
`ExtApi.sendSupportMessageExt` → `fixToken(token)`. `fixToken` does
`token.startsWith('JWT ')`, so it threw `TypeError` inside the route's async
handler, outside any `try`/`catch`: the reply was dropped, **nothing was
logged**, and the test timed out with no diagnostic. `CHATBOT_TOKEN` is now a
`TEST_ENV` default; no test file was touched.

### Wave 3 — three files: three real product defects

| File | What was actually wrong |
|---|---|
| `conversation-ai_prompt_test.js` | `buildEnabledTools()` read only `server.tools`, so every MCP server with a tool selection was sent to the LLM as `enabled_tools: []`. Support for the `enabled_tools` key existed (b4601b04) and was dropped by 0c2173e1. |
| `conversation-askgptv2_test.js` | Test-side: the pinecone reranking branch is behind the `PINECONE_RERANKING` flag, which the test never set. It had never passed since it was added. |
| `conversation-ai_condition_test.js` | Fixture was a copy of the AiPrompt bot — five blocks were `_tdActionType: "ai_prompt"`, so the tests ran DirAiPrompt while asserting `AiCondition` strings. Repairing the fixture exposed two defects: flowError carried a pasted wrong message on `/ask` failure, and the vllm branch's four error exits read undeclared `trueIntent`/`falseIntent` (ReferenceError). |

In each of the first and third rows a single failing test also poisoned the
rest of its file: the assertion threw inside a mock route, so the mock's
listener was never closed and every following test died on `EADDRINUSE`. One
real defect, seven or eight red tests.

## If you need to quarantine something again

Move the file here and add a row to a table in this README saying, concretely,
what fails and why it is not fixable in that change. "It fails" is not a
reason. A quarantined file is a debt with a name on it, not a resolution — and
on the evidence above, the reason is far more often a missing variable or a
stale fixture than anything intrinsic.

## A trap when adding tests

`config/endpoints.js` `configure()` freezes any key present in the `startApp`
settings against later `process.env` mutation, for the life of the process. If
you start a mock server *after* `startApp` and then set
`process.env.KB_ENDPOINT_QA`, it is ignored if that key was threaded through
settings. Set the variable before `startApp`, or leave the key out of the
settings object.

A related one, in the same family: a module-level
`const X = process.env.X === 'true'` is read **once, at require time**. A test
that needs such a flag must set it before the first `require` of the app —
`conversation-askgptv2_test.js` sets `PINECONE_RERANKING` on its first line for
exactly this reason.
