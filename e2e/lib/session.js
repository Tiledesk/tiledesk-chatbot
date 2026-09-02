'use strict';
/**
 * Getting a browser into the CDS as a logged-in user.
 *
 * The token never lives in this repository. It comes from the environment:
 *
 *   export TILEDESK_TOKEN='eyJhbGciOi...'
 *
 * or, if you would rather not have it in your shell history, from
 * `e2e/.auth/token` (that directory is gitignored).
 *
 * The dashboard and the CDS share an origin, so they share localStorage: the
 * app reads its token from there on boot. `authenticate()` writes it with
 * `addInitScript`, which runs before any page script on every navigation --
 * including the hash-route changes the CDS makes -- so the app is already
 * logged in the first time it looks.
 *
 * TOKEN_KEYS is a list rather than one name on purpose: the key differs between
 * dashboard versions, writing a few costs nothing, and `npm run discover` (see
 * discover.js) prints the keys the app actually reads on your install.
 */
const fs = require('fs');
const path = require('path');

const TOKEN_FILE = path.join(__dirname, '..', '.auth', 'token');

const TOKEN_KEYS = (process.env.TILEDESK_TOKEN_KEYS
  || 'tiledesk_token,token,jwt,JWT,tiledeskToken')
  .split(',').map((k) => k.trim()).filter(Boolean);

/** The token, or a message that says exactly how to supply one. */
function token() {
  const fromEnv = (process.env.TILEDESK_TOKEN || '').trim();
  if (fromEnv) return normalise(fromEnv);
  if (fs.existsSync(TOKEN_FILE)) {
    const fromFile = fs.readFileSync(TOKEN_FILE, 'utf8').trim();
    if (fromFile) return normalise(fromFile);
  }
  throw new Error(
    'No Tiledesk token. Supply one with\n'
    + "  export TILEDESK_TOKEN='<token>'\n"
    + `or by writing it to ${TOKEN_FILE} (gitignored).\n`
    + 'Copy it from the dashboard: devtools > Application > Local Storage > tiledesk_token.'
  );
}

/** The app stores the bare JWT; a token pasted out of a curl keeps its prefix. */
function normalise(raw) {
  return raw.replace(/^Bearer\s+/i, '').replace(/^"|"$/g, '').trim();
}

/**
 * Put the token in front of the app before it boots, on every navigation.
 * Call once per browser context, before the first `goto`.
 */
async function authenticate(context, value) {
  const jwt = value || token();
  await context.addInitScript(([keys, t]) => {
    for (const key of keys) {
      try {
        window.localStorage.setItem(key, t);
        window.sessionStorage.setItem(key, t);
      } catch (e) { /* storage disabled for this origin; nothing to do */ }
    }
  }, [TOKEN_KEYS, jwt]);
  return jwt;
}

/**
 * Open the blocks canvas and make sure we are actually in it.
 *
 * An expired or wrong token does not fail the navigation -- the app boots and
 * bounces to its sign-in route -- so a run with a bad token would otherwise
 * time out somewhere far away with a confusing message. Check it here.
 */
async function openCds(page, url) {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle').catch(() => { /* the CDS polls; fine */ });

  const landed = page.url();
  if (/#\/(login|signin|auth)/i.test(landed)) {
    throw new Error(
      `The token was not accepted: the app redirected to ${landed}.\n`
      + 'Either it has expired, or this install keeps it under a different\n'
      + `localStorage key than [${TOKEN_KEYS.join(', ')}]. Run \`npm run discover\`\n`
      + 'in e2e/ to print the keys this install uses, then set TILEDESK_TOKEN_KEYS.'
    );
  }
  return page;
}

module.exports = { token, authenticate, openCds, TOKEN_KEYS, TOKEN_FILE };
