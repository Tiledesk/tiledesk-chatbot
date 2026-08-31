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
3. CI runs the suite on every push.
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
