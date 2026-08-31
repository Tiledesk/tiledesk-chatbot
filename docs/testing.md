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

`API_ENDPOINT` is mandatory. Without it `startApp` throws inside an `async`
function, the rejection is never surfaced, and every `before` hook times out —
which makes the suite look completely broken rather than misconfigured.

## The baseline

`docs/test-baseline.json` maps each test file to the number of tests that must
pass: **332 tests across 49 files**. It is a contract, not a snapshot. Raise it
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

`tybotRoute/test/quarantine/` holds 12 files that failed before any migration
work began. See the README there for the reason per file. They are not
collected. Fixing them is Phase 4 work.
