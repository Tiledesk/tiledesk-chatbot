/**
 * Entry point for the integration `tests` service.
 *
 * Runs every suite in this folder in one container, in order, and exits
 * non-zero if ANY of them fails. Added because control-api.js existed but was
 * not referenced by docker-compose.integration.yml, so its 11 tests never ran —
 * dead weight that reads like coverage.
 *
 * Each suite is spawned as its own process so one crashing cannot take the
 * others with it, and so a suite that leaves a listener open cannot hang the run.
 */
const { spawnSync } = require('child_process');
const path = require('path');

const SUITES = ['run.js', 'control-api.js', 'ai-and-vendors.js', 'full-flow-validation.js'];

let failed = 0;
for (const suite of SUITES) {
  console.log(`\n=== ${suite} ===`);
  const res = spawnSync(process.execPath, [path.join(__dirname, suite)], {
    stdio: 'inherit',
    env: process.env,
  });
  if (res.status !== 0) {
    failed++;
    console.log(`--- ${suite} FAILED (exit ${res.status}${res.signal ? `, ${res.signal}` : ''})`);
  }
}

console.log(`\n========================================`);
console.log(failed === 0 ? `all ${SUITES.length} suites passed` : `${failed} of ${SUITES.length} suites FAILED`);
process.exit(failed === 0 ? 0 : 1);
