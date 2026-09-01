# Running the tests

## Quick start

Requires **Node 22** (the version CI uses; `node -v` should print `v22.x`) and
Docker.

```bash
npm install                       # or `npm ci`
docker compose -f docker-compose.test.yml up -d
npm test
```

`npm test` delegates to `tybotRoute/scripts/run-tests.js`, which runs every test
file in its own mocha process and compares the result against
`docs/test-baseline.json`. It exits non-zero on any failure or any regression.

## Booting the app end-to-end

The suite uses static bots and never connects to MongoDB, but the real app does:

```bash
docker compose -f docker-compose.test.yml up -d      # starts redis AND mongo
MONGODB_URI=mongodb://127.0.0.1:27017/tiledesk \
API_ENDPOINT=http://localhost:10002 \
CACHE_REDIS_HOST=127.0.0.1 CACHE_REDIS_PORT=6379 \
PORT=3000 npm start
```

`curl localhost:3000/` should answer `Hello Tilebot!`.

Two things that will trip you up:

- The root `index.js` reads **`CACHE_REDIS_HOST`/`CACHE_REDIS_PORT`**, not the
  `REDIS_HOST`/`REDIS_PORT` the tests use. Pass the wrong pair and the app boots
  with no cache instead of failing.
- Posting to `/ext/:botid` with a bot id that is not in MongoDB crashes on
  `Cannot read properties of null (reading 'language')` —
  `IntentsMachineFactory.getBackupMachine` has no null guard where its sibling
  `getIntentsMachine` does. Pre-existing; seed a bot before exercising that route.

> **Port 6379 must be free.** If something else already owns it (a local
> `redis-server`, another project's container) `docker compose up -d` fails with
> `Bind for 0.0.0.0:6379 failed: port is already allocated`, or — worse — appears
> to succeed while the tests talk to the wrong Redis. Check with
> `lsof -nP -iTCP:6379 -sTCP:LISTEN` and stop the other listener, or point the
> suite elsewhere with `REDIS_PORT`.

Skipping the install step is the most common fresh-checkout failure: without
the repo-root `node_modules` every file reports `ERR ... no mocha summary in
output` (`Cannot find module .../_mocha`) and the run exits non-zero.

There is a single package: one `package.json` and one `node_modules`, both at
the repo root. The runner still spawns mocha with `cwd=tybotRoute` so the tests'
relative requires (`require("..")`, `require("../utils/...")`) keep resolving,
but the `_mocha` binary and every dependency come from the root tree.

## Running one file

```bash
cd tybotRoute && node scripts/run-tests.js --only=filler_test.js
```

`--only=` accepts a bare basename or `test/<basename>`, runs that single file
through the same isolated-spawn path, skips the baseline gate, and still exits
non-zero if the file fails.

Doing it by hand requires the same two flags the runner uses:

```bash
cd tybotRoute && node ../node_modules/.bin/_mocha --no-config --no-package --timeout 20000 --exit test/filler_test.js
```

`--no-config --no-package` are **mandatory**. Mocha merges the `spec:` globs from
`.mocharc.yml` with positional arguments, so `_mocha test/filler_test.js` on its
own runs the *whole suite* in one process — the exact thing per-file isolation
exists to prevent.

## Other runner flags

| Flag | Effect |
|---|---|
| `--timeout=<ms>` | per-test mocha timeout (default 20000) |
| `--spawn-timeout=<ms>` | per-file process ceiling (default 300000); a file that exceeds it is killed and reported `ERR` |
| `--update-baseline` | regenerate `docs/test-baseline.json` (see below) |
| `--force` | with `--update-baseline` only, permit a deliberate shrink |
| `--only=<file>` | run exactly one collected file |

Unrecognised arguments are rejected with exit code 2 — `--timeout 20000` (space
form) is *not* accepted, use `--timeout=20000`.

## How a file is reported

| Mark | Meaning |
|---|---|
| `ok` | ran, all tests passed |
| `FAIL` | ran, at least one test failed — fails the run |
| `none` | ran cleanly and defined no tests (e.g. `close_directive_test.js`, whose `it()` blocks are commented out) — does not fail the run |
| `ERR` | produced no parseable mocha summary, was killed by the spawn timeout, or exited non-zero with no reported failures — fails the run |

A `FAIL` or `ERR` fails the run whether or not the file appears in the baseline.

## Why one process per file

The integration tests boot a full Express app. 24 files bind port 10001 and
their mock API on 10002, and `services/TilebotService.js` freezes
`TILEBOT_ENDPOINT` at module load — one value per process. In a shared mocha
process the first file to load fixes the endpoint for all 38 files that require
that service, and the port bindings collide. Running one file per process makes
each file independent.

Measured difference, with no other change:

| | One process | Per-file process |
|---|---|---|
| Passing | 264 | 337 |
| Failing | 156 | 83 |

## Environment

The runner defaults these; override by exporting them first.

| Variable | Default |
|---|---|
| `REDIS_HOST` | `127.0.0.1` |
| `REDIS_PORT` | `6379` |
| `API_ENDPOINT` | `http://localhost:10002` |
| `TILEBOT_ENDPOINT` | `http://localhost:10001` |
| `CHATBOT_TOKEN` | `XXX` |
| `BREVO_ENDPOINT` | `$API_ENDPOINT/api/v3` |
| `CUSTOMERIO_ENDPOINT` | `$API_ENDPOINT/api/v1` |
| `HUBSPOT_ENDPOINT` | `$API_ENDPOINT/crm/v3/` |
| `QAPLA_ENDPOINT` | `$API_ENDPOINT/1.2` |
| `MAKE_ENDPOINT` | `$API_ENDPOINT/1.3` |
| `OPENAI_ENDPOINT` | `$API_ENDPOINT/v1` |
| `KB_ENDPOINT`, `KB_ENDPOINT_QA`, `KB_ENDPOINT_QA_GPU` | `$API_ENDPOINT/api` |

The endpoint variables point the vendor and AI directives at the mock server each
test starts on port 10002. Without them those directives call the real vendor
hosts and time out — which is why seven test files sat quarantined. If you change
how a service builds its url, update the matching base in `TEST_ENV`.

`CHATBOT_TOKEN` is the bot token the tests put in the message envelope. Most
files hardcode `"XXX"`; two read it from the environment, and with it unset they
send `token: undefined`. The plain-text answer path then reaches
`ExtApi.fixToken(undefined)`, which throws inside the route's async handler, so
the reply is dropped **with nothing logged** and the test just times out. Any
non-empty value works; nothing in the suite verifies it.

`API_ENDPOINT` is mandatory. Without it `startApp` throws inside an `async`
function, the rejection is never surfaced, and every `before` hook times out —
which makes the suite look completely broken rather than misconfigured.

## The baseline

`docs/test-baseline.json` maps each test file to the number of tests that must
pass: **419 tests across 61 files**. It is a contract, not a snapshot. Raise it
when you add tests; never lower it to make a run go green.

Regenerate only when deliberately adding tests:

```bash
cd tybotRoute && node scripts/run-tests.js --update-baseline
```

Regeneration overwrites the contract, so it is guarded:

- it **refuses** to write a baseline with fewer files or fewer total tests than
  the current one, printing exactly what shrank; pass `--force` if the shrink is
  deliberate;
- it **never** writes an empty baseline, `--force` or not — an empty baseline
  makes every later run pass vacuously;
- it exits non-zero if any file was failing or errored during regeneration,
  because such a file is silently dropped from the new baseline.

The `npm run test:baseline` alias reads like "test the baseline"; it does not.
It *overwrites* `docs/test-baseline.json`.

## Quarantined tests

`tybotRoute/test/quarantine/` is **empty**: all 12 files that once sat there have
been released. Seven went back when the endpoint variables above were set, two
when `CHATBOT_TOKEN` was, and the last three once the product defects they were
actually reporting — in `DirAiPrompt`, `DirAiCondition` and the AiCondition bot
fixture — were fixed. The README there records what each wave turned out to be,
and is the place to document anything you have to park in future.

## Coverage

```bash
npm run test:coverage     # run the suite under V8 coverage, write coverage/
npm run coverage:check    # gate the result against docs/coverage-baseline.json
```

`test:coverage` goes through `tybotRoute/scripts/coverage.js`, not `c8 npm test`.
`npm test` is untouched by all of this: same command, same 61 files / 419 tests,
no c8 anywhere in its path, no extra work.

Reports land in `coverage/` (gitignored): `index.html` to browse, `coverage-summary.json`
for the gate, plus the text table on stdout.

### Why a wrapper instead of `c8 npm test`

Two things have to be true for the number to mean anything.

**The child processes have to be merged.** `run-tests.js` spawns one mocha process
per test file. c8 works by exporting `NODE_V8_COVERAGE`, which those children
inherit, so each writes its own V8 profile into `coverage/tmp` and all of them are
merged into one report. That much plain c8 does correctly.

**The merge has to not lie.** It does, out of the box. `@bcoe/v8-coverage`'s
`mergeFunctionCovs` groups function records by their *root range* and sums the
counts of everything in a group. A class that declares an instance field emits two
synthetic functions with an **identical** root range spanning the whole class body:

```
<static_initializer>            count 1    the static field ran at require time
<instance_members_initializer>  count 0    the class was never constructed
```

Merged, those two collapse into a single count-1 range covering every method in the
class. V8 emits no per-method records for such a class until it is actually
instantiated, so there is nothing left to carve the truth back out, and the file
reports 100%.

Measured here: `directives/ai/DirAiPrompt.js` reads **3.93%** from a single process
and **100%** after merging the 37 processes that require it.

`coverage.js` therefore drops the `<static_initializer>` record whenever it collides
with an `<instance_members_initializer>` over the same range, before handing the
profiles to `c8 report`. The count-0 sibling then survives the merge and the class
body reports honestly. The cost is that the one static-field line reads uncovered
though it ran — that errs *downwards*, which is the safe direction for a floor. A
class that *is* instantiated keeps a count>0 initialiser and is unaffected, and any
method that ran keeps its own count>0 record and carves itself back in.

Two files were affected at the time this was written (`DirAiPrompt.js`,
`DirAiCondition.js`), together worth about five points of fake coverage.

**If you ever change the coverage plumbing, sanity-check it against a file you know
is barely tested** rather than trusting the total. The three used here:

| File | Expected |
|---|---|
| `directives/ai/DirAiPrompt.js` | ~4% |
| `directives/ai/DirAiCondition.js` | ~4% |
| `directives/ai/DirAskGPTV2.js` | ~13% |

If any of them reports near 100%, the merge is broken again. Stop and fix it; do
not record the comfortable number.

### What is excluded, and why

Every exclusion is listed in `.c8rc.json` with its reason. Being badly covered is
not a reason — the AI directives, the Mongo data sources and the HTTP routes are the
actual gap and stay in the denominator where they are visible.

| Excluded | Why |
|---|---|
| `tybotRoute/test/**` | the tests are the instrument, not the subject |
| `tybotRoute/scripts/**` | the test runner and the coverage wrapper, same reason |
| `tybotRoute/types/**` | pure JSDoc typedefs, no runtime code to execute |
| `tybotRoute/routes/legacyHelpers.js` | dead code, moved verbatim, zero callers |
| `tybotRoute/logs/**`, `tybotRoute/uploads/**` | runtime output directories, not source |
| `node_modules` | c8's own default |

`all: true` is set, so a source file no test ever requires counts as 0% instead of
disappearing from the denominator. 144 source files are measured.

### The floor

`docs/coverage-baseline.json` records the measured figures and a floor per metric
and per area. `npm run coverage:check` fails if any of them slipped.

**The floor ratchets UP and is never lowered to make a run pass.** A red check means
something stopped being exercised — that is a bug in the change that caused it, not
in the number. `--update` refuses to write a lower floor; `--force` overrides it and
is for deliberate drops only (code deleted, area renamed), with the reason in the
commit message.

Floors sit one point below the measured figure. The per-file-process run is not
bit-identical between invocations (62.93 and 62.92 on two consecutive runs), so a
zero-headroom floor would flap on noise. That point is slack against nondeterminism,
not a coverage allowance.

When coverage improves, lock it in:

```bash
npm run test:coverage
node tybotRoute/scripts/coverage-check.js --update
```

The check prints a nudge when any floor drifts more than two points below actual.

The target is 98%, per area, honestly — reached by writing tests, one area at a
time, raising that area's floor as it lands. It is deliberately *not* the floor
today: a single global 98% would fail on day one and, once it did pass, would say
much less than it appears to.
