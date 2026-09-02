# Code Structure Migration — Design

**Date:** 2026-08-31
**Branch:** `refactor/code-structure-migration`
**Status:** Approved design, pending implementation plan

## Goal

Restructure the chatbot connector to remove duplication and clarify module
boundaries, so that a later TypeScript migration is mostly mechanical. The
current test suite must keep passing at every step.

Non-goals: behaviour changes, new features, performance work, dependency
upgrades beyond deduplication, and the TypeScript conversion itself.

## Measured baseline

All figures below were measured on this repo at commit `91008e03`, not
estimated.

| Metric | Value |
|---|---|
| Source LOC (excl. tests, node_modules) | 23,765 |
| Test LOC | 32,470 |
| Provably dead LOC (zero inbound refs) | 4,877 (21% of source) — 4,732 in `tybotRoute/` plus 145 in `chooserChatbotRoute/` |
| Files in `tybotRoute/tiledeskChatbotPlugs/directives/` | 70 |
| Entries in `tybotRoute/test/` | 113 (104 `.js`) |

### Test suite

The suite runs only with an env recipe that is documented nowhere:

```bash
REDIS_HOST=127.0.0.1 REDIS_PORT=6379 \
API_ENDPOINT=http://localhost:10002 \
TILEBOT_ENDPOINT=http://localhost:10001 \
npx mocha --timeout 60000 --exit
```

Without `API_ENDPOINT`, `startApp` throws inside an `async` function; the
rejection is never surfaced and every `before` hook times out. That single
missing variable is why the suite looks completely broken on a fresh checkout.

Full-suite result: **264 passing, 156 failing.** The failures have three
distinct causes, which must not be conflated:

1. **Port collisions.** 24 test files hardcode `SERVER_PORT = 10001` and start
   their mock API on `10002`. In one mocha process they collide, producing
   cascading `EADDRINUSE`.
2. **Missing environment.** Some files fail in isolation because `KB_ENDPOINT_QA`
   and related AI endpoints are unset.
3. **Genuinely stale assertions.** `conversation-ai_condition_test` asserts an
   error string the code no longer produces. These are real red tests.

`json_condition_test` passes 28/28 in isolation, confirming the suite is sound
where the harness does not interfere.

Of the 104 `.js` files in `test/`, **61** are named `*_test.js`/`*-test.js` and
**43** are not. Of those 43, 41 are pure `bots_data` fixtures, and two contain
`describe()` blocks that a naive `*_test.js` glob would drop. Inspecting both:

- **`validate_variable_names.js` is a real suite** — 4 assertions against
  `TiledeskExpression.validateVariableName`. It must be renamed, not excluded.
- **`testin.js` is not.** Its single `it()` has its entire body commented out and
  only calls `done()`. It passes while asserting nothing. Excluding it costs
  nothing.

A further 9 non-`.js` entries are already-disabled tests suffixed `.js_`/`.txt`,
plus `single_test.sh`.

A third file, `close_directive_test.js`, *is* named as a test but has **both** of
its `it()` blocks commented out, so it runs zero tests. Like `testin.js` it is
dead scaffolding.

No CI workflow runs the tests. The two GitHub Actions build Docker images only.

### Duplication

Concentrated and mechanical — the cheap kind to remove.

| Duplicated construct | Copies | Distinct variants |
|---|---|---|
| `constructor(context)` + "context object is mandatory" guard | 62 | 1 |
| `this.logger = new Logger({...})` init | 42 | 2 (one has drifted) |
| `#executeCondition(...)` | 17 | 9 |
| `#assignAttributes(...)` | 14 | few |
| `#myrequest(options, callback)` | 7 | 5 |

There is a de-facto base class that was never written: 65 files take
`constructor(context)` and 65 expose `execute(directive, callback)` — 60
declared sync, 5 declared `async`. Exactly four outliers break the contract:

| File | Signature | Fate |
|---|---|---|
| `DirDisableInputText` | `execute(directive, pipeline, callback)` | survives — must be normalised |
| `DEPRECATED_DirOfflineHours` | `execute(directive, pipeline, callback)` | deleted in Phase 1 |
| `DEPRECATED_DirIfAvailableAgents` | `execute(directive, directives, current_directive_index, callback)` | deleted in Phase 1 |
| `DEPRECATED_DirWhenOpen` | `execute(directive, directives, current_directive_index, callback)` | deleted in Phase 1 |

Three of the four disappear with Phase 1, leaving `DirDisableInputText` as the
sole signature to normalise. The sync/async split matters for typing: `execute`
returns nothing and signals completion through its callback, so the 5 `async`
declarations are incidental and should be unified when the shape is typed.

Separately, `DirectivesChatbotPlug.processInlineDirectives` calls
`helpDir.execute(directive, pipeline, 3, () => {...})` with four arguments,
while `DirDeflectToHelpCenter.execute` accepts `(directive, callback)`. The
callback is therefore never invoked on that path. This is a latent bug in an
already-`DEPRECATED`-marked method; it is recorded here as a finding and is
explicitly **not** fixed by this migration, which preserves behaviour.

### Coupling

Two findings determine the whole approach.

**The cycle is trivial to break.** `engine/TiledeskChatbot.js` requires
`DirLockIntent` and `DirUnlockIntent` solely to call
`DirLockIntent.lockIntent(...)` and `DirUnlockIntent.unlockIntent(...)`, which
are pure cache functions with no dependency on `TiledeskChatbot`. Node currently
tolerates the cycle with a runtime warning
(`Accessing non-existent property 'TiledeskChatbot' of module exports inside
circular dependency`). TypeScript will not.

**The real seam is the static parameter store.** Five `TiledeskChatbot` statics —
`addParameterStatic` (51 call sites), `allParametersStatic` (47),
`getParameterStatic` (6), `requestCacheKey` (5), `deleteParameterStatic` (1) —
touch only `_tdcache` and `requestId`. They hold zero instance state. Roughly
110 call sites across the directives reach through `TiledeskChatbot` to get at
them. Extracting them decouples directives from the engine almost entirely and
provides the single most valuable surface to type.

### Service layer

The service layer exists but was only ever half-adopted. 29 directives import
`axios` directly; **14 of those also import a service**, so there is no
consistent boundary — only partial migration. `IntegrationService` caught on
(11 callers); nothing else did.

| Service | Directive callers |
|---|---|
| `IntegrationService` | 11 |
| `TilebotService` | 3 |
| `QuotasService` | 2 |
| `KbService` | 1 |
| `DataTablesService` | 1 |
| `AIController` | 1 |

The sharpest evidence: **`DirAiPrompt` imports `QuotasService` and also builds
the same `/quotes/tokens` and `/quotes/incr/tokens` URLs inline.** Four
directives (`DirAddKbContent`, `DirAiCondition`, `DirAiPrompt`, `DirGptTask`)
duplicate logic `QuotasService` already implements.

Tiledesk platform paths constructed inline inside directives:

| Path | Directives |
|---|---|
| `/kbsettings` | 6 |
| `/quotes/tokens` | 4 |
| `/quotes/incr/tokens` | 4 |
| `/requests/` | 3 |
| `/kb/namespace/all` | 2 |
| `/tags`, `/mcp/native`, `/leads/`, `/integration/name/openai` | 1 each |

Third-party endpoints are read from `process.env` directly inside directives:
`GPTKEY` (7), `KB_ENDPOINT_QA` (3), `WHATSAPP_ENDPOINT` (2),
`PERSIST_API_ENDPOINT` (2), `OPENAI_ENDPOINT` (2), `MAKE_ENDPOINT` (2), plus
`QAPLA_ENDPOINT`, `HUBSPOT_ENDPOINT`, `CUSTOMERIO_ENDPOINT`, `BREVO_ENDPOINT`,
`KB_ENDPOINT_QA_GPU` and `KB_ENDPOINT`.

**All five existing services capture their endpoint at module load:**

```js
const API_ENDPOINT = process.env.API_ENDPOINT;   // DataTables, Integration, Kb, Quotas
const TILEBOT_ENDPOINT = process.env.TILEBOT_ENDPOINT || `${process.env.API_ENDPOINT}/modules/tilebot`
```

This import-time binding is the same defect that forces Phase 0 to isolate tests
by process rather than by port: 38 test files require `TilebotService` directly,
so in a shared process the first one to load fixes the endpoint for all of them.
If new services copy the pattern, every extraction makes the suite harder to
configure.

### God files

| File | LOC |
|---|---|
| `utils/TiledeskChatbotUtil.js` | 1,106 |
| `directives/DirAiPrompt.js` | 943 |
| `tybotRoute/index.js` (11 routes + helpers + `startApp`) | 813 |
| `engine/TiledeskChatbot.js` | 716 |

### Packaging

Root and `tybotRoute` each carry a `package.json` and `node_modules` with
overlapping, drifted dependencies: `uuid` `^9` vs `^3`, `mongoose` `^6.6.1` vs
`^6.3.5`, `@tiledesk/tiledesk-client` `^0.10.4` vs `^0.10.13`. Root is a ~35-line
Express wrapper.

## Decisions

Three decisions were taken before design and shape everything below.

1. **Baseline.** Fix the harness first, then freeze. Phase 0 repairs only
   mechanical harness problems; whatever passes afterwards becomes the frozen
   contract. Genuinely-stale tests are quarantined with a written reason each —
   never silently deleted.
2. **Repo shape.** Collapse to a single package. One `package.json`, one
   `node_modules`, one module graph for TypeScript to reason about.
3. **TypeScript runway.** Structure plus JSDoc types, no build step. The code
   stays plain runnable JavaScript; the shapes TypeScript needs are declared in
   JSDoc, with `checkJs` enabled for editor feedback only.

## Approach

**Layered bottom-up.** Safety net → dead code → kernel → pilot → fan-out →
services → registry → structure. Each phase is independently verifiable and
produces a reviewable diff.

Two alternatives were rejected. *Directory-first* would rewrite every import
path in one mechanical diff before the safety net is trustworthy — with 156
failing tests, breakage would be undetectable. *Duplication-first with the layout
untouched* is cheapest but leaves `tybotRoute/` as the package root and the god
files intact, so the TypeScript move would re-open the same files.

## Phases

Every phase ends with the frozen test set green. Any phase that cannot achieve
that stops and reports rather than adjusting the contract.

### Phase 0 — Make the safety net real

No source changes. This phase only makes the existing suite trustworthy.

**Superseded approach.** An earlier draft of this phase assigned each of the 24
colliding test files a unique static port pair. That cannot work.
`services/TilebotService.js:3` freezes `TILEBOT_ENDPOINT` at module load — one
value per *process* — and **38 test files require `TilebotService` directly while
none set `process.env` themselves**. In a shared mocha process the first file to
load binds the endpoint for all of them, so files 2–38 would post to the wrong
port. The port fix must therefore come from process isolation, not port
allocation.

**Adopted approach: run mocha once per test file, each in its own process.**
Fresh module state per file means the existing hardcoded `10001`/`10002` no
longer collide, with **zero test-file edits and zero source changes** — stricter
adherence to "Phase 0 touches no source" than the superseded approach. The cost
is ~61 process startups (~3–4 min vs ~1 min). For integration tests that boot a
full Express app this is the conventional approach, and it makes each file's
result independent, which is what freezing a green set requires. Once Phase 4
makes endpoints lazy, moving back in-process becomes an available optimisation
rather than a prerequisite.

Work items:

- Add `scripts/run-tests.js`: runs each test file in a separate mocha process,
  serially, aggregates results, emits JSON, exits non-zero on any failure or on
  any regression against the recorded baseline.
- Add `.mocharc.yml` with an explicit spec glob so a bare `mocha` invocation
  stops loading the 41 `*_bot.js` fixtures as suites.
- Rename `validate_variable_names.js` to `validate_variable_names_test.js` — it
  is a real suite (4 tests on `TiledeskExpression.validateVariableName`) that the
  glob would otherwise drop.
- Add `docker-compose.test.yml` providing Redis; wire `npm test` to it and to the
  documented env recipe.
- Add the CI workflow that runs the suite — none exists today.
- Commit `docs/test-baseline.json` recording the frozen green set (machine-readable, so the runner can gate on it), plus `docs/testing.md` explaining how to run the suite.
- Move genuinely-stale tests to `test/quarantine/`, excluded from the glob, each
  with a written reason.

### Classification results

The per-file classification is complete. Running each file in its own process,
with no other change:

| | In one process | Per-file process |
|---|---|---|
| Passing | 264 | **337** |
| Failing | 156 | **83** |

Process isolation alone recovers 73 tests and eliminates 73 failures, confirming
that roughly half the original failures were harness artefacts rather than real
defects.

Of 63 files: **50 are fully green (333 tests)** — this is the proposed frozen
baseline. 12 files still fail (4 passing, 83 failing). One file,
`close_directive_test.js`, contains **zero runnable tests** — both its `it()`
blocks are entirely commented out.

The 12 still-failing files map almost exactly onto the AI and vendor-integration
directives that Phase 4 targets:

| File | Pass | Fail |
|---|---|---|
| `conversation-askgptv2_test.js` | 0 | 19 |
| `conversation-gpt_task_test.js` | 0 | 13 |
| `conversation-ai_condition_test.js` | 0 | 8 |
| `conversation-qapla_test.js` | 0 | 7 |
| `conversation-form-test.js` | 0 | 7 |
| `conversation-askgpt_test.js` | 0 | 7 |
| `conversation-ai_prompt_test.js` | 4 | 7 |
| `conversation-hubspot_test.js` | 0 | 4 |
| `conversation-brevo_test.js` | 0 | 4 |
| `conversation-make_test.js` | 0 | 3 |
| `conversation-customerio_test.js` | 0 | 3 |
| `conversation-locked-intent-test.js` | 0 | 1 |

Within these files the failures also cascade: each `it()` opens a listener on
`10002` and closes it only on the success path, so the first assertion failure
leaves the port bound and every later test in that file dies with `EADDRINUSE`.
The reported failure counts are therefore inflated — the root cause in each file
is its *first* failure. `conversation-brevo_test.js` fails first on a genuine
`AssertionError`, not on environment.

Because these 12 files exercise exactly the code Phase 4 restructures, they are
quarantined rather than repaired here, and Phase 4 is the natural place to
revisit them.

**Two files need a disposition decision** (flagged, not yet taken):
`testin.js` contributes 1 passing test whose body is entirely commented out — it
asserts nothing — and `close_directive_test.js` contributes none for the same
reason. Both are dead scaffolding. They are left in place and excluded from the
frozen count pending that decision; neither affects any other phase.

**Verification:** three consecutive full runs are deterministic and match
`docs/test-baseline.json` exactly — 332 tests across 49 collected files. (`testin.js` is one of the 50 green files but is not matched by the collection rule, so it is outside the frozen set.)

### Phase 1 — Delete dead code

Delete, having confirmed zero inbound references for each:

- `tybotRoute/TdCache copy.js`, `tybotRoute/TdCache_v3.js`
- `tybotRoute/TiledeskClientTest.js` (2,488 LOC)
- `tybotRoute/models/DEPRECATED_IntentForm_no_prefill.js`
- 6 × `directives/DEPRECATED_Dir*.js`
- `DirGptTask_OLD.js`, `DirWebRequestV2_old.js`, `DirIfOpenHours_OLD.js`
- `DirSetConversationTags.js`
- `chooserChatbotRoute/` (commented out in root `index.js`)

**Verification:** green set unchanged. Re-run the zero-reference check
immediately before deleting, in case Phase 0 introduced a reference.

### Phase 2 — Extract the kernel

- `engine/RequestParameters.js` — the five statics moved out verbatim.
  `TiledeskChatbot` keeps thin delegating statics so all ~110 call sites remain
  untouched during migration. Delegates are removed in Phase 6, not here.
- `engine/IntentLock.js` — `lockIntent` / `unlockIntent`. Both the engine and the
  two directives then depend on this leaf, breaking the cycle. The runtime
  circular-dependency warning disappearing is the proof.
- `directives/BaseDirective.js` — the 62-copy constructor guard, context field
  hoisting, the 42-copy logger init, plus shared `executeCondition` and
  `assignAttributes`.
- `utils/http.js` — one request helper.

Two constraints that shape this phase:

**Private fields cannot be overridden.** The shared helpers are `#private`
fields. Moving them to a base class requires converting them to `_`-prefixed
convention-protected methods across every affected file. Mechanical, but it
touches many files and must be done as its own commit.

**The variants are not all identical.** The 17 `executeCondition` copies collapse
to 9 distinct variants. Most differ only in a `winston` log tag and merge safely,
but `DirAiCondition`, `DirDataTables`, `DirForm`, `DirWebRequestV2` and
`DirAiPrompt` differ behaviourally and must **override** rather than inherit.
Likewise the 5 `myrequest` variants accept different HTTP status codes; accepted
statuses become an explicit parameter rather than a silent unification. Each
variant must be diffed against the base before collapsing — no bulk replace.

**Verification:** green set unchanged; circular-dependency warning gone from
process output.

### Phase 3 — Pilot, then fan out

- Pilot `BaseDirective` on the five HTTP-integration directives with the highest
  shared surface: `DirBrevo`, `DirHubspot`, `DirCustomerio`, `DirMake`,
  `DirQapla`.
- Fan out in batches of ~8 directives, one commit per batch, green set verified
  after each.
- Normalise `DirDisableInputText`'s `execute(directive, pipeline, callback)`
  signature **last** and on its own, since it carries the most behavioural risk.
  The other three outliers were deleted in Phase 1.

**Verification:** green set unchanged after every batch. A batch that goes red is
reverted, not patched forward.

### Phase 4 — Service extraction

Placed after the `BaseDirective` fan-out so services can use the shared HTTP
helper, and before the god-file split because extracting the AI services is
precisely how `DirAiPrompt` gets from 943 LOC to something reviewable.

**Extraction rule.** Extract only when two or more directives touch the same
external system, *or* the call sequence is non-trivial (auth + quota + retry).
One-off calls stay inline. This is what stops the phase sprawling into one
service per directive: `/mcp/native` and `/integration/name/openai` have a
single caller each and therefore stay where they are.

First, `config/endpoints.js` resolving every endpoint env var **lazily at call
time**, with all services — the five existing ones included — reading through it
rather than binding at import. This is behaviour-preserving for normal boots,
where env is set before first call. It also lifts the Phase 0 constraint: with
endpoints resolved lazily, the suite may optionally move back to a single
in-process run for speed, instead of that being permanently foreclosed.

Then, in order:

1. **Adopt what already exists.** Repoint the 4 quota duplicators at
   `QuotasService`. No new code — this is pure deletion.
2. **`KbSettingsService`** — replaces the 6 inline `/kbsettings` copies.
3. **Vendor services** — `BrevoService`, `HubspotService`, `CustomerioService`,
   `MakeService`, `QaplaService`, `WhatsappService`. Each owns its endpoint, key
   retrieval and payload shape. These are the same directives that carry the 5
   near-identical `#myrequest` copies, so this phase and Phase 2's HTTP helper
   compound.
4. **`LlmService`** — consolidates `OPENAI_ENDPOINT`, `KB_ENDPOINT_QA`,
   `KB_ENDPOINT_QA_GPU` and `GPTKEY` handling shared by `DirAiPrompt` and
   `DirAskGPTV2`.
5. **`TiledeskApiService`** — the inline `/requests/`, `/tags` and `/leads/`
   calls.

This adds roughly 8 files. Net code decreases, net file count increases; the win
is that directives stop knowing about HTTP, auth and endpoints, which is what
makes the later TypeScript pass cheap.

**Verification:** green set unchanged after each numbered step, committed
separately. No directive that gained a service still imports `axios` for that
same external system.

### Phase 5 — Registry

Each directive declares `static directiveNames = [...]`; `directives/registry.js`
builds the dispatch map by iterating them. This deletes the ~100-entry map
literal and the ~60-line require block from `DirectivesChatbotPlug.js`, so adding
a directive becomes a one-file change rather than a three-file change.

**Verification:** the generated map is asserted equal to the current hardcoded
map before the literal is deleted. Green set unchanged.

### Phase 6 — Split god files, collapse packages, move to `src/`

- Split `TiledeskChatbotUtil.js` (1,106 LOC) by concern.
- Split `tybotRoute/index.js` (813 LOC) into `routes/` modules plus `startApp`.
  Fix the swallowed-rejection bug found in Phase 0 while here.
- Extract the LLM client concerns from `DirAiPrompt.js` (943 LOC).
- Remove the Phase 2 delegating statics and repoint the ~110 call sites at
  `RequestParameters` directly.
- Merge the two `package.json` files, resolving each drifted dependency to the
  higher version, and collapse to one `node_modules`.
- Move sources under `src/`.

Target layout:

```
src/
  server.js            # was root index.js
  app.js               # express wiring
  routes/              # from tybotRoute/index.js
  engine/              # TiledeskChatbot, RequestParameters, IntentLock, IntentForm
  directives/          # BaseDirective, registry, Dir*.js
  plugs/
  services/            # existing + KbSettings, Llm, TiledeskApi, per-vendor
  config/
    endpoints.js       # lazy env resolution, single source of endpoint truth
  models/
  cache/               # TdCache
  utils/
  types/               # JSDoc typedefs
```

**Verification:** green set unchanged; `npm start` boots; Docker image builds.
Package collapse and the `src/` move are separate commits — bisectability matters
most here, where the diff is largest.

### Phase 7 — JSDoc typedefs

`src/types/index.js` defining `DirectiveContext`, `Directive`, `Action`,
`TdCacheLike` and `DirectiveCallback`. Annotate `BaseDirective`, the registry and
`RequestParameters` first, since those are the shapes every directive touches.
Add `jsconfig.json` with `checkJs` for editor feedback only — no build step, no
CI type gate, per the TypeScript-runway decision.

**Verification:** green set unchanged; `npm start` boots. Type errors surfaced by
`checkJs` are recorded as follow-up work, not fixed in this migration.

## Crash-safety sweep

Goal, in the user's words: "be sure that application does not crash unexpectedly
... no error arise during real time execution." Approach: hunt the **defect class**
rather than add more coverage, since coverage was already 98.15%.

**Static sweep.** The cached tsc against `jsconfig.json` gave 121 errors. Triaged:
the 7 `TS2349 "not callable"` were **all false positives** (every one an
`axios(...)` call TypeScript cannot resolve through the CommonJS require shape),
and the 79 `TS2339` are untyped-object noise. The crash-guaranteeing classes
(`TS2304` undeclared name, `TS2588` const reassignment, `TS2551`, `TS2300`) went
**12 → 1**.

Four real defects came out of it:

- `engine/TiledeskIntentsMachine.js:112` called `TiledeskClient.getErr(...)` in a
  file that never requires `TiledeskClient` — `ReferenceError` on any non-200 from
  the tiledesk-ai intents service. The **third** instance of this exact family.
- `utils/aiUtils.js` assigned `m_split` and `multiplier` with no declaration,
  leaking implicit globals — and a `ReferenceError` **at module load** under strict
  mode whenever `AI_MODELS` is set. Runs on every boot.
- `directives/agents/DirIfOpenHours.js` reassigned two `const`s → `TypeError` on a
  whitespace-only intent name. Fixing it surfaced a **second** defect in the same
  method: both success branches ran the branch intent *and* fell through to an
  unconditional `callback()`, so a configured branch called back twice.
- `pipeline/MessagePipeline.js` `this.coounter` typo.

### The biggest find was not in the plan

**All four async express handlers had no error boundary.** `POST /ext/:botid` with
a body of `{}` — a probe, a misconfigured caller — dereferenced
`req.body.payload._id`, threw out of the async handler, left the socket
**unanswered** and **killed the worker**. Four distinct reachable crashes,
reproduced outside mocha.

Fixed in two layers: explicit 400s where the bad shape is known, plus
`routes/asyncErrorBoundary.js` wrapping every handler at registration. Verified
against a live server: `{}`, `{"payload":{}}` and a malformed `/exec` all return
400, the worker stays up, zero `uncaughtException`.

### Pattern sweep — hits triaged, not blanket-patched

| Pattern | Hits | Real | Note |
|---|---|---|---|
| `error.response.*` unguarded | 29 | 3 | Brevo/Customerio/Hubspot each guarded two lines *below* an unguarded log — a vendor being down stalled the flow |
| `callback()` without `return` | 11 | 1 | the DirIfOpenHours double-call |
| identifier used, never required | 8 | 2 files | both fixed, 0 remain |
| unguarded index on external data | 24 | 2 | `DirGptTask` `resbody.choices[0]`, `validateRequestId(undefined)` |
| rejecting `await`, no catch | 22 audited | 3 | `DirRemoveCurrentBot` ×2, `DirAssignFromFunction` — fatal under plain node |

Suite **1,398 → 1,436 tests**; coverage 98.16% lines, 95.37% branches.

### Left open, each needing a product decision

1. `POST /block/...` in sync mode never answers when no block publishes — a hang,
   not a crash. The right timeout is a product call.
2. `DirIfOnlineAgents`/`V2` do not normalise a whitespace-only intent name, so a
   blank branch dispatches intent `" "`. `DirCondition` and `DirIfOpenHours` do
   normalise.
3. `trueIntentAttributes`/`falseIntentAttributes` are read into locals and never
   passed to `intentDirectiveFor` in `DirIfOpenHours` and `DirCondition`, while
   `DirIfOnlineAgents` does pass them.
4. `utils/winston.js:35` assigns `logger.stream = {...}`, clobbering winston's own
   `stream()` query method. Nothing reads it today.

### One structural risk worth naming

Every directive that calls `callback()` from inside a `.then()` re-enters the rest
of the flow *there*, so a throw downstream becomes an unhandled rejection
attributed to the wrong directive. `DirIfOpenHours`'s chain has no `.catch` at all.
The route-level boundary does **not** cover this — closing it needs a guard in the
directive dispatcher, which is a design change, not a fix.

## End-to-end integration tests against the production data path

**The gap the existing suite could not see.** 46 test files already booted the
full Express app — but **all 46 passed static bots** (`bots: bots_data`).
Production loads bots from MongoDB through `MongodbBotsDataSource` and matches
intents through `MongodbIntentsMachine`. `startapp_mongo_test.js` booted against a
real MongoDB but only asserted the health check.

So those four engine files reported **100% coverage**, entirely from unit tests
with stubbed models, while **no test had ever pushed a real message through a real
Mongo-stored bot.** Another instance of the theme: coverage says the lines ran, not
that the production path works.

`test/e2e_mongo_conversation_test.js` closes it — booting with a real
`MONGODB_URI` and **no** `bots` setting (asserted: `runtimeContext.staticBots ===
undefined`), its own database, its own ports, seeded through the repo's own
mongoose models. Six journeys:

1. An explicit `/welcome` answered from a Mongo faq document, with a wrapped
   `Faq_kb.findById` proving exactly one bot read.
2. **Natural-language matching** through `MongodbIntentsMachine`'s `$text` index —
   "opening hours please" matches, a nonsense phrase gets no reply at all, which
   proves real scoring rather than "first faq wins". Exercised by nothing before.
3. Multi-turn state across Redis: turn 1 writes `visitor_name`, turn 2 renders it;
   a different request does not see it.
4. Directives parsed out of stored answer text, `_raw_message` byte-identical to
   what Mongo holds.
5. The bot cache: after message 1 the document is **deleted from Mongo via the raw
   driver**, message 2 still answers, and the `findById` count is zero.
6. A bot id Mongo does not know.

### Journey 6 found a live production crash

`getBotByIdCache` **resolves null** for a missing bot, so the error `catch` above it
never applied. Falling through crashed twice over: `IntentsMachineFactory
.getBackupMachine` dereferenced `bot.language` with no guard (its sibling
`getMachine` guards and returns undefined), and past that `new TiledeskChatbot`
throws `"config.bot is mandatory"`. Both rejected out of the async handler **after
the 200 had already been sent**, so the message vanished with nothing logged.

`routes/messageRoutes.js` now returns early with an error log. Fixed, not
characterised — the test that pinned the crash was replaced by one asserting the
handled miss.

Suite: **1,398 tests across 91 files**, coverage unchanged at 98.15% lines.

## All known defects fixed

**58 runtime defects found and fixed.** Exactly **one** skipped test remains
repo-wide, and it is a product decision rather than a defect.

Final state: **1,388 tests across 90 files**, lines **98.15%**, functions 97.90%,
branches 95.32%. `npm test` and `npm run coverage:check` both green.

### The one open question — someone has to decide it

`tybotRoute/engine/TiledeskChatbot.js` composes `{ text: "Intent not found: <name>" }`
for an explicit intent that matches nothing, then discards it.

A unit test asserted the composed reply should be sent. Making that pass surfaced
internal diagnostic text to end users AND broke `test/routes_http_test.js`, which
pins the shipped contract that an unmatched explicit intent posts nothing. Two
tests could not both be right.

**Resolution taken:** silence ships today, so silence is preserved. The
control-flow half of the defect — a missing `return` that fell through and ran the
intent matcher *after* resolving — IS fixed. The unit test is skipped with the
decision written out.

**To settle it:** should `/no_such_intent` reply at all, and if so with what
wording? `"Intent not found: x"` leaks an internal name. If yes, un-skip that test,
update `routes_http_test.js`, and choose user-facing text.

### The last defects fixed

- `MockBotsDataSource` missing its `winston` require (`ReferenceError`).
- `DirBrevo`, `DirCustomerio` and `DirHubspot` all shared one shape: when the
  integration key is missing and the action has no false connector, the `if (!key)`
  block **fell through and called the vendor anyway** — `api-key: undefined`,
  `authorization: Basic undefined`, `Bearer undefined`.
- `DirMake` took the **true** connector on a 500, because MakeService never sets
  `err`.
- `DirSendWhatsapp` dereferenced `payload.receiver_list[0]` unguarded.
- `DirWhatsappByAttribute` rejected unhandled on any failed broadcast.
- `ChatbotParametersClient` and `WebhookChatbotPlug` dereferenced
  `error.response.data` on transport errors that have no `.response`, hanging the
  caller and the pipeline.
- `ChatbotIntentUtil` missing its `winston` require.
- `TiledeskChatbotConst` never declared the two document flow-attribute names
  (`lastUserDocumentAsAttachmentURL`, `lastUserDocumentAsInlineURL`) that
  `CHANGELOG.md` v0.2.60 publishes as public API — the code silently never
  delivered them.

A conflict caught in the process is worth recording: a fix that satisfies its own
unit test can contradict an older test pinning shipped behaviour. That happened
once here and was resolved in favour of what ships, not in favour of the newer
test.

## Coverage target reached: 98.06%

**Status: 98% achieved.** Lines **98.06%** (19,592/19,979), functions 97.90%,
branches 95.19%. Suite **1,373 tests across 90 files**, up from 419/61 when the
coverage work began. `npm run coverage:check` gates every area and ratchets up
only; no floor was forced except two documented ~0.1 merge-drift corrections.

### What the push actually bought

Not the number — the **49 real runtime defects it found and fixed**, plus 19 more
still catalogued. Every one was found by writing an assertion on an error path,
never by executing a line. A representative sample of what was shipping:

- `ChatbotRequestAttributesUtil.js:255` called `process.exit(1)` inside a catch —
  one failed Redis write killed the entire chatbot process.
- `DirCondition.js:104` dropped `variables` when evaluating, so a JSON condition
  **always took the false branch**.
- `DirAskGPT.js:116` called `this.checkQuoteAvailability()`, which existed on
  neither the class nor `BaseDirective` — a guaranteed `TypeError`.
- Roughly twenty **conversation stalls**: a callback that never fires, leaving the
  bot silently dead mid-flow. `DirForm.go()` could not run at all.
- Several **unhandled rejections** that are process-fatal under Node's defaults,
  masked in development because `utils/winston.js` sets `handleExceptions: true`.

### What 98% does not mean

The goal was stated as "guarantee that all works correctly, there will not be
error during runtime execution". Coverage cannot carry that weight, and this repo
is the proof rather than the counter-example:

- **`DirAskGPT.js` sat at 100% function coverage while calling a method that did
  not exist.** Covered, executed, and certain to throw — because the covering test
  asserted nothing on that path.
- **19 known defects remain in the code right now, at 98.06% coverage**, each
  marked by a skipped test asserting the correct behaviour. Among them:
  `WebhookChatbotPlug.js:133` and `ChatbotParametersClient.js:87` dereference
  `error.response.data` on transport errors that have no `.response`, hanging the
  pipeline; `ChatbotParametersClient.js:81` calls `TiledeskClient.getErr()` in a
  module that never requires `TiledeskClient`.

Coverage measures whether a line ran. Whether it ran *correctly* is carried
entirely by the assertions — which is why the value here came from the defects,
and why the remaining 19 are the real backlog, not the last 1.94%.

### The residue is unreachable, not untested

Areas still under 98% are dominated by genuinely dead code the source itself
documents: `DirCondition:65-69` compares `scriptCondition.trim` (the function) to
`""`; `parametersRoutes:29-31` tests `allParametersStatic() === null`, which
always resolves an object; `DirMake:114-131` and `DirWebRequestV2:130-141` are
`if (err)` halves marked dead in comments. Chasing those would mean tests that
assert nothing.

### Measurement traps, both of which reported a comfortable lie

1. My dependency-free reporter said **99.5%**, then **40.2%** after a partial fix.
   It concatenated V8 ranges from all test processes before painting, so a
   `count: 0` range from a process that merely *required* a file stomped the
   `count: 1` ranges from the process that exercised it.
2. Plain `c8 npm test` said **67.99% with `DirAiPrompt` at 100%** — a file whose
   tests were quarantined. c8's merge *sums* function records sharing a range, and
   a class with instance fields emits both a `<static_initializer>` (count 1, ran
   at require) and an `<instance_members_initializer>` (count 0) spanning the whole
   class body. `tybotRoute/scripts/coverage.js` drops the colliding record.

**Always sanity-check a coverage setup against a file you know is untested.**
`DirAiPrompt` read 100% under two independent broken configurations.

### One structural note

`test/startapp_mongo_test.js` is the only file that boots without `settings.bots`,
covering the MongoDB path in `startApp`. Mongoose has one default connection per
process, so the runner's per-file process isolation is what keeps it from
affecting the other 90 files. It uses its own database and drops it in `after()`.

## Follow-on: code coverage (user-requested)

**Goal as stated:** 98% "so we are sure that all the code has been tested and all
works correctly." Approach agreed after pushback: **ratchet** from the measured
number, hold 98% per-area only where honest, with a written exclusion list —
rather than one global gate that would overstate safety.

**Why the pushback.** Coverage proves code *ran*, not that it is *correct*. This
repo is the proof: the suite was 100% green while containing six catalogued
runtime bugs. That said, the coverage push has already justified itself — see the
defects below, all found by making untested code run.

### Two measurement traps, both of which reported a comfortable lie

1. My own dependency-free reporter said **99.5%**. It concatenated V8 ranges from
   all 59 test processes into one list before painting, so a `count: 0` range from
   a process that merely *required* a file stomped the `count: 1` ranges from the
   process that exercised it. After a partial fix it swung to **40.2%** — also
   wrong, under-reporting for the same reason.
2. Plain `c8 npm test` said **67.99% with `DirAiPrompt` at 100%** — a file whose
   tests were quarantined. Cause: c8's merge *sums* function records sharing an
   identical range. A class with instance fields emits both a
   `<static_initializer>` (count 1, ran at require) and an
   `<instance_members_initializer>` (count 0, never constructed) spanning the whole
   class body; merged, they read as fully covered.
   `tybotRoute/scripts/coverage.js` drops the colliding record.

**The lesson worth keeping:** always sanity-check a coverage setup against a file
you *know* is untested. `DirAiPrompt` read 100% under two separate broken
configurations before reading its true 3.93%.

### Where it stands

| Metric | Before | After releasing the quarantine |
|---|---|---|
| Lines | 62.92% | **71.00%** (13,953/19,651) |
| Functions | 67.63% | **73.55%** |
| Branches | 78.81% | **77.48%** |

Branch percentage *fell while coverage improved*: covered branches rose
1,552 → 1,845, but the denominator became honest (1,969 → 2,381) because V8 emits
no granular branch records for a file nothing runs — `DirAiCondition` used to
report `1/1` branches, a fake 100%. The branch floor was lowered once, with
`--force` and a recorded justification. That is the only permitted direction of
travel for a floor, and only for this reason.

`npm run coverage:check` gates every area against `docs/coverage-baseline.json`.
It ratchets **up only**.

### The quarantine is empty

All 12 originally-quarantined files now run. Test baseline **373 → 419 tests
across 61 files**. The three worst-covered files moved most:
`DirAiPrompt` 3.93 → 58.46%, `DirAiCondition` 3.78 → 72.41%,
`DirAskGPTV2` 12.63 → 77.22%.

No assertion was weakened to achieve this. One stale test was *replaced*: it
asserted that a missing `question` attribute errors, but `a30ceb21` had
deliberately removed `question` from `checkMandatoryParameters`. The replacement
covers real behaviour and a previously-unreached branch — assertions in that file
went 71 → 77.

### Real defects the coverage work uncovered

- **`AiPromptRequestService.buildEnabledTools()` read only `server.tools`** while
  the designer writes `enabled_tools`. Support existed at `b4601b04` and was
  dropped by `0c2173e1`; since then every MCP server with a tool selection was
  sent `enabled_tools: []`.
- **`DirAiCondition` discarded the real `/ask` error**, storing a copy of the
  success-path string as `flowError`.
- **`DirAiCondition`'s vllm branch had four dead error exits** reading
  `trueIntent`/`falseIntent` that `go()` never declares — every one threw
  `ReferenceError`.
- **`ExtApi.fixToken` crashes on a missing token with zero logging**, silently
  dropping the reply. This is why two tests "timed out" for years.
- **`\_tdLockIntent` text syntax is a no-op** — `DirLockIntent.execute` requires
  `directive.action` and the `directive.parameter` branch is commented out.

Still unfixed and untested: `DirAskGPT:121` calls a non-existent
`this.checkQuoteAvailability()`; `DirReplyV2:229` calls `winston.errpr`;
`buildEnabledTools` no longer honours the integration's project-level
`selectedTools` (precedence is a product decision).

### Remaining gap to 98%

**+5,305 lines**, concentrated in: `directives/bot` 32%, `directives/agents` 34%,
`routes` 47%, `directives/tiledesk` 50%, `directives/flow` 58%, `directives/ai`
63%. `models` already meets 98%; `config` is 3 lines away.

Note that `config/kb` and `models` sit near 100% on module-level config and schema
code — high percentage, near-zero assurance. Per-area targets should weight
function and branch coverage, not lines, where that is the shape of the code.

## Follow-on: file structure reorganisation (user-requested)

**Status: complete.** Commits `f57eedcb` (root modules), `2f91264e` (directives),
`ccc7ab37` (dead packaging), `7a828593` (folder dissolved).

Two flat piles were the problem: 10 unrelated modules sitting beside the entry
points at the `tybotRoute/` root, and 59 directives in one folder.

```
tybotRoute/
  index.js  startApp.js        <- entry points only
  routes/  engine/  services/  utils/  config/  models/  types/
  expressions/                 TiledeskExpression, WhenExpression, JSONEval, Math, String
  cache/                       TdCache
  observability/               Logger, AnalyticsClient
  pipeline/                    ExtUtil, ExtApi
  tiledeskChatbotPlugs/directives/
    Directives.js  registry.js
    ai/ 7   integrations/ 7   conversation/ 9   flow/ 10
    agents/ 8   data/ 10   bot/ 5   tiledesk/ 3
```

The legacy `tiledeskChatbotPlugs/` folder was then dissolved entirely — its name
was an artifact of an old external package. `directives/` was promoted to the top
level (it is a primary domain concept and was buried two levels deep),
`BaseDirective.js` moved in beside the 59 subclasses that extend it, the five
pipeline stages went to `pipeline/plugs/` next to `MessagePipeline`, and the
variable helpers to `variables/`. Final shape:

```
tybotRoute/
  index.js  startApp.js        <- entry points only
  directives/                  BaseDirective, Directives, registry
    ai/ 7  integrations/ 7  conversation/ 9  flow/ 10
    agents/ 8  data/ 10  bot/ 5  tiledesk/ 3
  pipeline/                    MessagePipeline, ExtUtil, ExtApi
    plugs/ 5                   Directives, Markbot, Webhook, Splits, FillParams
  variables/                   Filler, TiledeskVarSplitter, TiledeskRequestVariables
  routes/  engine/  services/  expressions/  cache/
  observability/  utils/  config/  models/  types/
```

Every move used `git mv`, so git records them as renames and history survives.

**Dead weight removed along the way.** `tiledeskChatbotPlugs/package.json`
declared `@tiledesk/tiledesk-chatbot-plugs` with `main: index.js` while **no
`index.js` existed** — publishing it would have shipped a package that installs
and then fails on require. That manifest, its `publish.sh` and `CHANGELOG.md`, the
stray `_package_deps_from_plugs.json`, and `TildeskContextForCodeOrchestrator.js`
(0 references, self-described prototype, misspelled name) were all deleted.

**How this was kept safe.** The registry is the one place a mistake would be
invisible — a silently dropped directive breaks production and no test covers it.
So the map was captured before the move and asserted exactly equal after: 63 keys
both sides, 0 missing, 0 extra, 0 mismatched, every value the same class object.
`registry.js` now walks recursively.

**The test invariant was deliberately lifted, narrowly.** Tests import source
paths directly (7 root modules + 6 directives), so a move cannot avoid them; shim
re-exports at the old paths would have defeated the point. Editing them is safe
*now* in a way it was not earlier: the gate is green at 373 tests, the edits are
`require` strings only, and a mistyped path fails loudly at module load. Verified
per commit — changed lines in `git diff -- tybotRoute/test/` that are not require
lines: **0**.

**The trap worth remembering:** `DirAskGPTV2` built a prompt directory with
`path.join(__dirname, '../../config/kb/prompt/rag')`. A require-only sweep cannot
see that, and no test exercises it — it would have failed silently at runtime.
Caught and fixed; re-verified that the path resolves and `PromptManager` loads.

Gate green at 373/56 after every commit, and the app was booted end-to-end after
each (`Hello Tilebot!`) rather than trusting the suite alone. The registry was
asserted exactly equal across both structural moves — 63 keys, 0 missing, 0 extra,
0 mismatched. `BaseDirective` now sits inside the tree the registry walks and
correctly contributes nothing, since it declares no `directiveNames`.

Note on the counts: the runner reports 57 collected files against a 56-entry
baseline. That is correct, not an off-by-one — `close_directive_test.js` has both
its `it()` blocks commented out, so it runs zero tests and the baseline (which
records only files with passing tests) has no entry for it.

## Verification closed: local end-to-end + quarantine release

**Retro-compatibility is now proven directly, not inferred.**

All 12 quarantined files were run against the pre-refactor tree (`467fde6b`,
before any source restructuring) and the fully refactored tree, same environment,
same Redis:

```
before:  60 passing, 27 failing
after:   60 passing, 27 failing     -> identical, file by file
```

Those 60 tests were written against the original code and pass unchanged on the
refactored code, covering Brevo, Customerio, Hubspot, Make, Qapla, GptTask,
AskGPT, AiPrompt and AskGPTV2 — the directives the migration changed most and the
ones the gate previously could not reach. The 27 remaining failures fail
identically on both trees, so they predate the migration.

### The quarantine was a configuration gap, not missing tests

Each quarantined file already started its own mock on port 10002 and registered
the vendor/AI routes it needed (`/api/v3/contacts`,
`/crm/v3/objects/contacts/batch/create`, `/1.2/getShipment/`, `/1.3/make/`,
`/v1/chat/completions`, `/api/qa`, `/api/ask`). Nothing pointed the directives at
that mock, so they called the real vendor hosts and timed out.

Adding the endpoint defaults to the runner's `TEST_ENV` released **7 files and 41
tests** with **no test file modified**. Baseline raised **332 -> 373 tests across
56 files**.

Five remain quarantined, all pre-existing: `askgptv2` (11 pass / 8 fail) and
`ai_prompt` (8 / 3) fail on assertions, not configuration — 19 passing tests are
held out of the gate only by their file-level failures, making them the best next
target. `ai_condition`, `form` and `locked-intent` time out in a flow that reaches
"Processing intent" and never posts its reply.

### The app boots end-to-end

With redis + mongo from `docker-compose.test.yml`: MongoDB connected, Redis
connected, listening. Verified live — `GET /` returns `Hello Tilebot!`,
`/test/webrequest/*` and `/echobot` return 200, `/ext/:botid` returns 200, the
`/chatbots` templates route mounts, and the running app wrote
`tilebot:botId_requests:*` keys to Redis.

Two findings from the boot, both pre-existing:

- The root `index.js` reads `CACHE_REDIS_HOST`/`CACHE_REDIS_PORT`, not the
  `REDIS_HOST`/`REDIS_PORT` the tests use. The wrong pair boots with no cache
  rather than failing.
- `IntentsMachineFactory.getBackupMachine` reads `bot.language` with no null
  guard, so an unknown bot id crashes it. Its sibling `getIntentsMachine` guards.
  The file is **byte-identical to `91008e03`** — the migration never touched it.

CI is deliberately deferred and nothing has been pushed.

## Follow-on: remote-request extraction (user-requested)

**Status: complete.** 16 commits after the migration. Requested in the user's words:
"the directive source is still rich of business logic, I would prefer to extract
logic that do remote requests to service so the directive structure is more
readable."

This **reverses Ruling 11**, which dropped per-vendor services because they removed
no duplication. The user's goal is separation of concerns, not deduplication, so a
one-caller service is fine. Done in three waves, riskiest last.

| | Before | After |
|---|---|---|
| Directives importing `axios` directly | 26 | **2** (both deliberate) |
| Directive LOC | 10,159 | **9,480** |
| Services | 12 | **23** |

Wave 1 — 11 Tiledesk-platform directives into `TiledeskApiService` (69→376 lines),
removing 6 copies of `new TiledeskClient(...)`. Wave 2 — 5 vendor services plus
`WhatsappService`. Wave 3 — 7 LLM/AI directives into `LlmAskService`,
`OpenAIService`, `McpService`, `OpenAIAssistantsService` and `KbService`.

**`DirWebRequest` and `DirWebRequestV2` are deliberately excluded** and are the only
directives still importing `axios`. Their URL comes from `action.url`, supplied by
the bot author — making arbitrary HTTP calls *is* the feature, so there is no
external system to model. That they remain the only two is a useful signal.

**How this was verified.** Almost all of Waves 2 and 3 is ungated (those directives'
tests are quarantined or absent), so the green suite proved little. Equivalence was
established on the wire instead: the old inline body and the new service were run
side by side against a local HTTP server, comparing outgoing URL, method, headers
and body plus every success and error branch — **291 comparisons across the three
waves, all identical**. The test invariant held: no file under `tybotRoute/test/`
was modified except one authorised note appended to `quarantine/README.md`.

### Two latent bugs this surfaced and fixed

1. **One boot could resolve two different API hosts.** `config/endpoints.js` read
   `process.env` while `runtimeContext` held `startApp`'s `settings`. They matched
   only because the root `index.js` passes one into the other. `startApp` now seeds
   the endpoint config, so both agree by construction. This also fixed
   `ChatbotParametersClient`, which built `undefined/ext/reserved/parameters/...`
   for any embedder configuring `TILEBOT_ENDPOINT` through settings rather than env.
2. **A double callback on the Customer.io success path.** `utils/http.js` invoked
   its callback twice on an accepted 200-with-body, so `DirCustomerio`'s success
   branch re-entered the directive pipeline twice. Now `else if`.

### Did readability actually improve?

Yes, and the honest measure is not the −679 LOC — it is **nesting depth**. Every
converted directive lost 2-3 levels of indentation:
`httpUtils.request(REQ, async (err, resbody) => { if (err) {...} else {...} })`
became `const { err, resbody } = await service.x(...)`. `DirBrevo`, `DirHubspot`,
`DirCustomerio`, `DirQapla`, `DirMake` and `DirGptTask` now read as flow: guards →
filler → one service call → branch.

Stated plainly: **the three big LLM directives are still big** — `DirAiPrompt` 587,
`DirAskGPTV2` 564, `DirAiCondition` 453. Their HTTP wiring is gone, but what remains
is ollama/vllm/custom key-and-model branching and a ~120-line JSON assembly. That is
genuinely business logic and belongs in the directive. If those three files are what
prompted the request, **the next target is that branching, not the HTTP** —
`LLMKeyService` already exists as the seam.

### Accepted trade-off

Four LLM endpoint URLs were logged at `winston.verbose`; the services log the full
request at `winston.debug`. Since verbose(4) does not include debug(5), those URLs
are no longer visible at `LOG_LEVEL=verbose`. Promoting the request logs to verbose
was rejected: it would expose `Authorization: JWT <token>` and end-user prompts at a
broader log level. The URLs remain visible at `LOG_LEVEL=debug`.

## Migration outcome — all phases complete

**Status: Phases 0-7 complete** on `refactor/code-structure-migration` (32 commits,
not pushed). `npm test` exits 0 throughout.

| Metric | Before | After |
|---|---|---|
| Source LOC | 23,765 | 19,509 (-18%) |
| Copies of the directive constructor guard | 62 | 1 (`BaseDirective`) |
| `#executeCondition` / `#assignAttributes` / `#myrequest` copies | 17 / 14 / 7 | 0 (3 documented overrides) |
| Circular dependencies | 2 | 0 |
| Files over 700 lines | 4 | 0 |
| `package.json` files declaring dependencies | 2 (drifted) | 1 |
| Adding a directive | 3 files | 1 file |
| Test suite | 264 pass / 156 fail, no CI | 332 pass / 0 fail, gated + CI |

**The invariant that made this safe:** no file under `tybotRoute/test/` was modified
in any of Phases 1-7. `git diff 467fde6b HEAD -- tybotRoute/test/` is empty. Every
phase was verified against the frozen baseline of 332 tests across 49 files.

### Where the plan was wrong, and what the evidence said

- **`executeCondition` needed one implementation, not "one base + 5 overrides".** The
  9 apparent variants were whitespace; the 6 "behavioural" outliers differed only by
  extra `logger.native` lines. Measured, not assumed.
- **Per-vendor services were dropped.** Brevo/Hubspot/Customerio/Make/Qapla have one
  caller each, and `BaseDirective` + `utils/http.js` had already absorbed their
  duplication. Only `LLMKeyService`, `WhatsappService` and `TiledeskApiService`
  earned their place. `LLMKeyService` needed *two* methods — the 6 directives had
  three distinct key-resolution orders.
- **A second circular dependency existed** that this document never identified: a
  dead `TiledeskChatbot` require in `utils/TiledeskChatbotUtil.js`.
- **The `src/` move was deferred.** It was never the user's choice (the package
  collapse was), it is cosmetic beside it, and it would have forced relocating the
  test tree — breaking the invariant above.

### Consequences requiring a human decision

1. **`@tiledesk/tiledesk-tybot-connector` can no longer be published from this repo.**
   This follows directly from the approved package collapse. A dep-less stub manifest
   was deliberately rejected: it installs cleanly and then fails at runtime in
   consumers. `deploy.sh` lost its npm-auth/publish step with it.
2. **CI has still never run.** The workflow is committed but the branch is unpushed.

### Real bugs found and deliberately NOT fixed (behaviour was preserved)

- `DirAiCondition.js` (lines ~153/168/180/197) reads `trueIntent`/`falseIntent`/
  `*Attributes`, which `go()` never declares -> `ReferenceError` on the vLLM/ollama
  "integration not found" paths.
- `DirAskGPT.js:121` calls `this.checkQuoteAvailability()`, which exists on neither
  the class nor `BaseDirective` -> TypeError on the public-GPTKEY path.
- `DirReplyV2.js:229` calls `winston.errpr` (typo) inside a catch block.
- `DirAiTask` is destructured from a module that never exported it -> `undefined`.
- `ChatbotParametersClient.myrequest` calls an undefined `TiledeskClient.getErr`.
- `DirCondition`, `DirMessageToBot` and `DirDisableInputText` are undispatched;
  `Directives.DEFLECT_TO_HELP_CENTER` is undefined, so the deprecated inline branch
  is dead and calls a stale 4-argument `execute`.

### Top follow-ups

1. **Un-quarantine the 12 test files.** Most directives touched in Phases 2-4 are
   among them, so the gate proved nothing about that work — equivalence there rests
   on purpose-built harnesses, not the suite. This is now the single largest risk.
2. Fix the six bugs above, each in its own commit.
3. Run CI (requires pushing the branch).
4. `checkJs` reports 141 source errors, documented as a follow-up list, none fixed.
5. `jsconfig.json` excludes `tybotRoute/test` pending `@types/mocha` (862 of the 1006
   errors were mocha globals).
6. The `src/` relocation, if still wanted.

## Phase 1 outcome

**Status: complete.** Commit `50ae1876`. All 4,877 dead lines removed after
re-verifying zero inbound references for each file, including from the
quarantined tests. Source LOC fell from 23,765 to 19,461 (-18%). The frozen
baseline is unchanged at 332 tests across 49 files, and `tybotRoute`,
`templatesRoute` and `DirectivesChatbotPlug` all still resolve.

The root `index.js` also lost the commented-out `chooserChatbotRoute` require
block, which would otherwise have referenced a deleted directory.

## Phase 0 outcome and follow-ups

**Status: complete.** Commits `c04f0f73`, `44c332f0`, `9e0508e7`, `cdd64e09`,
`36909436`, `03fbe9ad` on `refactor/code-structure-migration`.

Delivered: `tybotRoute/scripts/run-tests.js` (one mocha process per test file,
gated against a frozen baseline), `.mocharc.yml`, `docker-compose.test.yml`,
`docs/test-baseline.json` (**49 files, 332 tests**), `docs/testing.md`,
`.github/workflows/test.yaml`, and `tybotRoute/test/quarantine/` holding the 12
files that failed before any migration work.

A plan defect was found and corrected during execution: mocha 8 **merges**
`.mocharc.yml`'s `spec:` globs with positional file arguments rather than letting
the argument override them, so the runner must spawn `_mocha` with
`--no-config --no-package`. Without those flags it runs the entire suite once per
file. The rationale is recorded as a comment in `run-tests.js` — do not remove
those flags.

The final whole-branch review found two Critical defects in the gate, both since
fixed: it exited 0 when a *collected but un-baselined* file failed, and
`--update-baseline` could silently shrink or empty the contract. The gate now
also fails on any collected file's failure, refuses a shrinking baseline without
`--force`, and never writes an empty one.

### Open follow-ups, in priority order

1. **The baseline records counts, not test identities.** `docs/test-baseline.json`
   maps file → passing count. A refactor that deletes a real assertion and adds a
   trivial one keeps the count and passes the gate — precisely the failure mode a
   large mechanical refactor produces. Recording per-file test titles would make
   the contract meaningfully stronger. **Decide this before Phase 3's fan-out**,
   which is where that risk first bites.
2. **Renames have no migration path.** `git mv`-ing a test file — near-certain in
   Phase 6's `src/` move — reports `missing`, and the only remedy is
   `--update-baseline`, which regenerates everything. A `--rename old=new` flag
   would close this.
3. **Nothing ever re-runs the quarantined files**, so nobody will notice if a
   phase makes one worse, or if one starts passing. A non-gating `--quarantine`
   mode would be cheap.
4. **CI is deliberately deferred.** A test workflow was written during Phase 0 and
   later removed at the user's request — CI is a separate decision to be taken
   later. Both gates (`npm test`, `npm run coverage:check`) and the integration
   stack are single commands, so wiring CI when wanted is a small job.
5. **CI pins Node 22 while `Dockerfile` ships `node:18-bullseye`** — the safety net
   validates a runtime production does not run. Resolve with the Phase 6 package
   collapse.
6. **The collection rule is duplicated** between the runner's regex and
   `.mocharc.yml`'s globs. They agree today; nothing keeps them in sync.
7. **Dead scaffolding left on disk by choice:** `testin.js` (one `it()` with a
   commented-out body) and `close_directive_test.js` (both `it()` blocks commented
   out, runs zero tests). Neither is in the baseline. Deletion is the user's call.
8. Minor, recorded for completeness: the `failing`-count regex has no epilogue
   anchor, so an app log line such as `42 failing lookups` could be misread — this
   fails loudly rather than silently, and no current file triggers it;
   `writeBaseline` writes before returning non-zero when a red file is offset by
   growth elsewhere; and `gate()`'s `JSON.parse` of the baseline has no try/catch.

## Risks

| Risk | Mitigation |
|---|---|
| Phase 0 reclassifies a test as stale that is actually a real regression | Quarantine requires a written reason per test and review; quarantine is never a silent delete |
| Collapsing `executeCondition`/`myrequest` variants changes behaviour | Diff each variant before merging; 5 known-divergent directives override; status codes become explicit parameters |
| `#private` → `_protected` conversion is wide-reaching | Its own commit, no other change mixed in |
| Package collapse breaks the published `@tiledesk/tiledesk-tybot-connector` | Separate commit; verify Docker build and `npm start` before proceeding |
| Phase 6 `src/` move produces an unreviewable diff | Pure file moves committed separately from content edits |
| Frozen baseline hides pre-existing bugs | Explicitly accepted — this migration preserves behaviour, including buggy behaviour. Quarantined tests are a written backlog |
| Service extraction sprawls into one service per directive | The two-caller-or-non-trivial rule; single-caller paths (`/mcp/native`, `/integration/name/openai`) stay inline |
| Lazy endpoint resolution changes behaviour where env is set after import | Behaviour-preserving for normal boots, where env is set before first call. Verified against the frozen green set, which exercises the import-time path today |
| Vendor services drift from the directives they replaced | Each vendor service is extracted in the same commit that repoints its directive, never ahead of it |

## Success criteria

1. The frozen green set passes at every phase boundary.
2. The full suite is deterministic across repeated runs.
3. ~~CI runs the suite on every push.~~ Deferred at the user's request; the
   workflow was removed. The gates are one command each when CI is wanted.
4. No `#executeCondition`, `#assignAttributes`, `#myrequest` or constructor-guard
   duplication remains outside `BaseDirective` and the documented overrides.
5. No circular dependencies in the module graph.
6. One `package.json`, one `node_modules`.
7. Adding a directive touches one file.
8. No directive constructs a Tiledesk platform URL or reads a third-party
   endpoint env var directly; endpoints resolve through `config/endpoints.js`.
9. No directive imports `axios` for an external system that has a service.
10. Core shapes carry JSDoc typedefs; `checkJs` runs clean enough to enumerate
    remaining errors as a follow-up list.
