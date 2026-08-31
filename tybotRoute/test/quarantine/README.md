# Quarantined tests

These files fail today, before any migration work. They are quarantined so the
baseline is a clean contract — **not** because the failures are acceptable.

They are excluded by the runner because `scripts/run-tests.js` reads `test/`
non-recursively.

Every file here exercises the AI or vendor-integration directives that Phase 4
of the migration restructures. Phase 4 is the point at which they are revisited.

Note on the counts: within each file, every `it()` binds port 10002 and releases
it only on the success path. The first assertion failure therefore leaves the
port bound and every later test in that file dies with `EADDRINUSE`. The failure
counts below are inflated; the real defect in each file is its *first* failure.

| File | Pass | Fail | First failure |
|---|---|---|---|
| conversation-askgptv2_test.js | 0 | 19 | needs AI mock endpoints (`KB_ENDPOINT_QA`) |
| conversation-gpt_task_test.js | 0 | 13 | needs AI mock endpoints |
| conversation-ai_condition_test.js | 0 | 8 | stale assertion: expects `"Error: AiCondition Error: 'question' attribute is undefined"` |
| conversation-qapla_test.js | 0 | 7 | needs `QAPLA_ENDPOINT` mock |
| conversation-form-test.js | 0 | 7 | assertion failure |
| conversation-askgpt_test.js | 0 | 7 | needs `GPTKEY` / AI mock endpoints |
| conversation-ai_prompt_test.js | 4 | 7 | partially green; needs AI mock endpoints |
| conversation-hubspot_test.js | 0 | 4 | needs `HUBSPOT_ENDPOINT` mock |
| conversation-brevo_test.js | 0 | 4 | genuine AssertionError, not environment |
| conversation-make_test.js | 0 | 3 | needs `MAKE_ENDPOINT` mock |
| conversation-customerio_test.js | 0 | 3 | needs `CUSTOMERIO_ENDPOINT` mock |
| conversation-locked-intent-test.js | 0 | 1 | assertion failure |
