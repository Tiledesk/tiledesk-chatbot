# Running the tests

## Quick start

```bash
docker compose -f docker-compose.test.yml up -d
npm test
```

`npm test` delegates to `tybotRoute/scripts/run-tests.js`, which runs every test
file in its own mocha process and compares the result against
`docs/test-baseline.json`. It exits non-zero on any regression.

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

## Quarantined tests

`tybotRoute/test/quarantine/` holds 12 files that failed before any migration
work began. See the README there for the reason per file. They are not
collected. Fixing them is Phase 4 work.
