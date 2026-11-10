# Execution graph: local check (2026-11-10)

Stack `tiledesk-exec` (dashboard at http://localhost:8081/dashboard/), signed in as `exec-demo-owner@tiledesk.local`,
project `default` (6af2301d8adf5f00136aa7b0), projects → project → agents → Graph.

## Rebuild

- `bin/exec-disk`: Mac 66 GB, Docker 27 GB free (threshold 15 GiB). Nothing pruned.
- `DASHBOARD_PATH=../tiledesk-dashboard bin/exec-rebuild dashboard` from tiledesk-dashboard
  `feature/execution-graph` d562041f9 (`ng build --configuration production` ran, 74.7 s): image
  `tiledesk-exec-dashboard` 66c11d9cf99f → **5542cb1cb4a7** (old one went with its tag).
- `COMPOSE_PROJECT_NAME=tiledesk-exec COMPOSE_PROFILES=infra,core,exec CHATBOT_PATH=… SERVER_PATH=… DASHBOARD_PATH=… EXECUTIONS_PATH=… bin/dev up -d --no-build dashboard`:
  only the dashboard container was recreated.

## Runs

| run | how | id | what happened |
|---|---|---|---|
| failed | hang webhook at 15:21:10, `docker kill tiledesk-exec-chatbot-1` at 15:21:18 | 01a1c60c-7fe2-71cb-8e56-a097a923e28a | `failed`, `error.code: lost_owner`, ended 15:21:51 (41.2 s); chatbot started again, healthy |
| hang 1 | hang webhook at 15:22:10 | 01a1c60d-6949-717b-a6b7-38a772548547 | running 120 s, then `waiting` |
| hang 2 | hang webhook at 15:22:10 | 01a1c60d-6989-742a-86c4-5f9f7eebba15 | running 120 s, then `waiting` |
| slow | `POST /modules/tilebot/block/<project>/<slow published id>/start` `{"async":true}` at 15:22:10 and again at 15:23:19 | 01a1c60d-699b-77ec-9f17-9f777f80ca15 (+ one more) | running 40 s, then `completed` |

No seeded demo fails on its own (webhook demo's failing request ends `waiting`), so the failed run comes from the
kill + reaper path. "Exec demo · slow" is an automation (subtype `webhook`), so it ends `completed`, not `waiting`;
the running → waiting transition was seen on the two hang runs instead (graph after 120 s, screenshot 07).

## Checks

| check | result | evidence |
|---|---|---|
| Graph opens from the switch, Cytoscape renders all agents + live executions | PASS | 01; 266 nodes / 265 edges (project, 13 agents, 251 live + 1 failed) |
| Running: run colour, pulsing | PASS | 03; `rgb(27,110,243)`; `underlay-opacity` sampled every 700 ms: 0.1, 0.1, 0.45, 0.45, 0.1, 0.45 (PULSE_MS 1200) |
| Marching edge on running | PASS | 03; edge `line-style: dashed`, `line-dash-offset` −458 → −488 over 1.5 s (−6 per 300 ms) |
| Waiting: wait colour, still, 0.55 | PASS | 07; `rgb(93,107,130)`, `opacity 0.55`, `underlay-opacity 0` |
| Red aura on the failed run | PASS | 02, 04; `s-failed aura`, `rgb(198,47,47)`, underlay 0.35 / 8 px |
| Red aura on its agent | PASS | 02; "Exec demo · hang" has class `aura`. "Exec demo · webhook" also has it (live runs with `failure_conditions > 0`) |
| Idle agents small and grey | PASS | 02, 03 (`agent idle`) |
| Counts line | PASS | "3 running · 248 waiting · 1 failed in the last 15 min" (01), later "0 running · 250 waiting · 1 failed in the last 15 min" (07). Mongo: 250 non-test waiting (+1 `test: true`, not counted), 1 failed ended in the last 15 min |
| Tooltip | PASS | 04: status, started, trigger, steps |
| Click on an execution opens its detail | PASS | 05; URL `#/project/6af2301d…/bots/6af3116ae0adb200132438ec/executions/01a1c60c-…` (root id), failed / lost_owner |
| Remembered choice | PASS | back from the detail lands on Graph; `tiledesk_agents_view` = `graph` / `list` |
| 5 s pace, paged | PASS | requests every ~5.02 s; each refresh = live page 1 + 2 cursor pages (251 live) + failed `from = now − 24 h` |
| Hidden tab stops requests, one on return | PASS (simulated) | see below |
| List and back keeps working | PASS | 06, 07; on List: Cytoscape instance `destroyed()`, no graph container, **0** `/executions` requests in 12 s; back on Graph: new instance, requests at once then every 5 s; node positions identical to before (failed run at (333.55, −34.91) both times) |
| executions-api stopped → stale note | PASS | 08; last data kept (265 nodes, same counts), "Data may be out of date" shown; retry 5 s later (502) |
| executions-api started → note clears | PASS | 09; started 15:27:52, healthy 15:27:58, note gone 15:28:02 |

### Hidden tab

The browser pane does not hide background tabs: with a second tab in front (`tabs_create` foreground, then
`tabs_select`), the agents tab still reports `document.hidden: false`, `visibilityState: visible`, and kept polling
every 5 s (network list shows no gap). So the real tab switch cannot produce the hidden state here.

Simulated instead, on the real build: `document.hidden` / `visibilityState` overridden to hidden and a
`visibilitychange` dispatched, 16 s wait, then restored and dispatched again. Result: **0** `/executions` requests
in the 16 s hidden; on return, the live and failed requests left **1 ms** after the event (then the 2 cursor pages).
`read_network_requests` shows the same gap (failed lookups at 15:24:59.773, then 15:25:16.343).

### Stale note timing

With the container stopped, nginx (`proxy`) kept the first request open until its upstream timeout: the failed
lookup came back **504 after ~60 s** (the live request then shows `ERR_ABORTED`, cancelled with it), and only then
did the note appear. The following retries got **502** at once. The graph has no client timeout, so behind a proxy
that holds the connection the note takes as long as the proxy's timeout. Not a failure of the spec (it keeps the
last data and retries on the 5 s pace), noted for the review.

## Observations (not failures)

1. The initial fit is dominated by "Exec demo · webhook"'s 248 waiting runs: their ring fills the canvas and the
   other agents are tiny until zoomed (01). Real projects with one busy agent will look like this.
2. Agent nodes with something shown are drawn in the run colour even when all their executions are waiting
   ("Exec demo · subagent parent", 03).
3. Screenshots of the pane sometimes show the frame before the last `cy.fit`; a second screenshot shows the right
   one. A capture lag of the pane, not the page.
4. `stopping` (warn colour, blinking) was not exercised in this run.

## Left behind

Stack running: dashboard on 5542cb1cb4a7, chatbot (restarted 15:21:55, healthy), executions-api (restarted
15:27:52, healthy). New executions: the failed one, two hang runs (waiting), two slow runs (completed).
