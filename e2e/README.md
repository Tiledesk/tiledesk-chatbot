# `e2e/` — walking the flow in a browser, against a real Tiledesk

The docker suite in [`integration/`](../integration) drives the connector with a
mock platform. This one drives **a deployed install through its own UI**: it
opens the CDS, opens the chat tester, and talks to the bot.

It was written against

```
https://stage.eks.tiledesk.com/cds/#/project/6933ef86aaadea0013802b5c/chatbot/6a984c524a821900143df493/blocks
```

which is the default target; every part of it is overridable (see *Pointing it
somewhere else*).

## The token

The suite needs a logged-in session and **the token never lives in this
repository**. Supply it either way:

```bash
export TILEDESK_TOKEN='eyJhbGciOi...'          # this shell only
# or
mkdir -p e2e/.auth && pbpaste > e2e/.auth/token # e2e/.auth/ is gitignored
```

To get it: sign in to the dashboard, then devtools → Application → Local Storage
→ the value under `tiledesk_token`. A `Bearer ` prefix and surrounding quotes are
stripped for you.

The token is written into `localStorage` before the app boots, on every
navigation, so the CDS is already logged in the first time it looks. If it is
rejected the suite says so immediately instead of timing out somewhere else.

## Running it

```bash
cd e2e
npm install
npx playwright install chromium     # once

npm test                            # everything
npm run test:flow                   # just the conversation walk
npm run test:canvas                 # just the layout check
npm run headed                      # watch it happen
npm run report                      # the HTML report of the last run
```

## What it does

**`tests/flow.spec.js` — the conversation walk.** One test per family, in one
browser, one conversation at a time. For each of the 54 blocks it types the
block's command into the tester and waits for a line that only that block says.
Blocks that ask something back are answered (`a_replyv2`, `a_voice`,
`d_capture_reply`, `d_form`, `b_lock`); the seven terminal blocks under
`/i_terminal` get a fresh conversation after them, because the bot will not
answer that one again.

**Nothing here is hand-written twice.** The commands, the menu contents, the
expected lines and which blocks are terminal are all read off
`examples/full-flow-validation-bot.json` — the file the bot was imported from —
by `lib/flow-map.js`. Print what it derived:

```bash
npm run map
```

If the deployed bot is older than that file, the walk fails on the difference.
That is the point: it is the check that what is deployed is what was designed.

**`tests/canvas.spec.js` — the layout check.** Opens the blocks canvas and
asserts the blocks landed in as many distinct places as there are blocks, and
that none sits on top of another. This is the browser-side half of
[`examples/layout-blocks.js`](../examples/layout-blocks.js).

## A pass means the block ran, not which way it went

A vendor or LLM block with nothing configured on the project answers from its
**false** connector. That is still the directive working, so the walk accepts
either branch and prints which one each block took:

```
  block                     took
  /g_brevo                  brevo: KO, status
  /h_ai_prompt              ai_prompt:
```

Read that list. A column of KOs is a project that needs its integrations, not a
broken connector — [`examples/README.md`](../examples/README.md) lists what each
block needs.

Two blocks say nothing fixed — `/e_helpcenter` (the answer is whatever the Help
Center returns) and `/f_event` (the event is fired silently). For those the walk
only proves the conversation survived them.

## First run on an install this has not seen

The tester is a widget and its markup is not a contract, so nothing here depends
on a class name: the conversation is found by looking for something to type into
next to something that accumulates text, and an assertion is "this line
appeared". That holds up well, but if the tester cannot be found at all:

```bash
npm run discover
```

It opens the CDS with your token and prints where the app landed, which storage
keys it uses, its frames, everything clickable, and what it found for the
composer and the transcript — plus screenshots in `.discovery/`. Then override
whichever guess was wrong:

| variable | what it overrides |
| --- | --- |
| `TILEDESK_TESTER_OPENER` | the control that opens the tester |
| `TILEDESK_TESTER_COMPOSER` | the box you type into |
| `TILEDESK_TOKEN_KEYS` | the localStorage keys the token is written to |
| `TILEDESK_CANVAS_BLOCK` | what one block looks like on the canvas |

No secret is ever printed: `discover` reports key names and lengths, never
values.

## Pointing it somewhere else

| variable | default |
| --- | --- |
| `TILEDESK_BASE_URL` | `https://stage.eks.tiledesk.com` |
| `TILEDESK_PROJECT_ID` | `6933ef86aaadea0013802b5c` |
| `TILEDESK_BOT_ID` | `6a984c524a821900143df493` |
| `TILEDESK_BOT_FILE` | `examples/full-flow-validation-bot.json` |
| `TILEDESK_REPLY_TIMEOUT` | `45000` ms |
| `TILEDESK_HEADFUL` | unset (headless) |

## What this is not

It talks to a **real** install. It creates real conversations, fires real
events, and hands real requests to human agents (`/i_agent`) — point it at
staging, or at a project you are happy to fill with test conversations.

It is also slower and less certain than [`integration/`](../integration): a
staging LLM call can take ten seconds and a flaky one fails the walk. The docker
suite is the gate; this is the proof that the gate matches the world.
