# Execution graph: live view, big numbers, time range — design

Date: 2026-11-13. Repos: tiledesk-executions (API), tiledesk-dashboard (graph page, executions list).
Status: agreed with the user in conversation (answers quoted below).

## Intent

The Monitor › Graph page drew every agent of the project, most of them idle, and its legend was a row of
small chips. The user wants the graph to show the real situation: only agents with executions in view,
coloured by how those executions are doing, with the counts as big numbers and a time selector that starts
from "now". The executions list should look like the rest of the dashboard (dropdowns, cards).

## The view (what "in view" means)

A time selector with: **Now** (default), Last 1 hour, Last 24 hours, Last 7 days, Last 30 days.

- **Now**: executions not totally terminated — status `running`, `waiting`, `stopping`, `stopped`, any age.
- **A range R**: the Now set, plus every execution started in the last R whatever its status
  (`completed`, `failed`, `destroyed` too).

Test runs are included (as the list does by default since 2.8.40-exec-4).

User: "the time should always start from the concept of now so you see only things that are in a live
(running, waiting, stopped, in general something that is not totally terminated) state. changing the time
range would make appear also the remaining state of the executions."

## Big numbers

One card per status: Running · Waiting · Stopped (stopped + stopping) · Failed · Completed · Destroyed.
They count exactly the executions in view for the selected range (user: "Always the selected range"), so
on Now the Completed / Failed / Destroyed cards read 0. Counts come from the API (not from the graph's
capped pages), so they are exact. They replace the legend chips; a compact colour key stays under them.

## Agents and their colour

Only agents with at least one execution in view are drawn (no idle agents). An agent's colour, first match:

1. **red** — at least one failed, or with errors (`failure_conditions > 0`);
2. **blue** — at least one running (no errors);
3. **amber** — at least one waiting, stopping or stopped (no errors) — stopped/stopping counted here is my
   call: paused, not finished;
4. **green** — all completed;
5. **gray** — all completed or destroyed, at least one destroyed.

Execution chips keep their status colours, with completed (green) and destroyed (gray) added.

## Executions list

Native selects (agent switcher, trigger, status, period) become `ng-select` as on the Conversations and
History pages; the status chips become the same big-number cards (all statuses, over the list's period and
filters agent / test runs; clicking a card sets the status filter, as the chips did).

## API (tiledesk-executions)

`GET /projects/:pid/executions/stats?range=now|1h|24h|7d|30d[&agent_id=][&test=all|true|false]` →
`{ range, from: ISO|null, statuses: { running, waiting, stopping, stopped, failed, completed, destroyed },
agents: { <agent_id>: { same counts, failure_conditions: <executions with failure_conditions > 0> } } }`
over the view above. One aggregation; same permission as the list.

## Left to the builder

Layout details of the cards, the graph's fetch (live set + range set, deduped, capped like today with the
truncated note), chip colours for completed/destroyed, i18n wording (en, it).

## Non-goals

No change to the per-agent badges on the agents list (`summary`), no click-to-filter on the graph cards.

## Addendum (2026-11-13): errors are unhandled ones; chip priority

User: "the with errors is important when compromise the flow execution not when is a managed failure".

- **Error** = an action that compromised the flow: outcome `error` (it threw), or outcome `failure_condition`
  with **no jump** (the failure exit leads nowhere, the flow stops there). A failure exit that jumps to a block
  is a **managed failure**: it stays in the timeline (`failure_conditions` keeps counting it) but is no error.
- tybot marks such an action `unhandled: true` on `action.completed`. The executions service counts them per
  execution (`errors`, once per action), the stats' `with_errors` and per-agent `errors` count executions with
  `errors > 0`, and an agent is **red** when it has a failed run or a run with errors (no longer
  `failure_conditions`). The list gets `has_errors=true` and its With errors card toggles it; the "With failure
  conditions" filter stays as it is. Runs recorded before have no mark: no errors.
- **Chip priority** (user: "Problems, live, then finished"): failed · with errors · stopping · running ·
  waiting · stopped · completed · destroyed; newest first within a group. The first 12 by this order are drawn,
  the rest folded into "+N". A run with errors gets a red mark on its chip; the timeline marks the unhandled
  action ("not handled").

## Addendum 2 (2026-11-13): one call per refresh, slower polling with a Refresh button

User: no WebSocket — "polling once a minute and with a specific button to refresh the state"; "keep the polling
but optimise" (fewer queries).

- **Graph endpoint** `GET /projects/:pid/executions/graph?range=now|1h|24h|7d|30d[&test=all|true|false]` (default
  test all), same view and permission as `stats`. One aggregation (`$facet`) returns:
  `{ range, from, statuses, with_errors, agents: { <agent_id>: { name, counts (statuses + errors +
  failure_conditions), drawn: [rows, at most 12, chip priority order], hidden: { <status>: n } } } }`.
  Chip priority as in the first addendum (failed · with errors · stopping · running · waiting · stopped ·
  completed · destroyed; newest first within a group), done server-side (`$topN`, Mongo ≥ 5.2; stage runs 7).
  `name` is the agent_name on its newest run (deleted agents keep a name). Rows carry the list row fields.
- **Graph page**: one call per cycle; refresh every 60 s after the previous answer (paused while hidden, as
  today); a **Refresh** button next to the time range (disabled while a call is in flight) and an "updated N
  s/min ago" note; a range change fetches at once. The page no longer pages through lists, so the "some
  executions are not drawn" note goes (the "+N" nodes say it per agent).
- **List**: `GET /executions?…&with_stats=true` returns the page and, alongside, the stats of the list's period
  (agent and test filters applied): one call instead of two. Polling unchanged (10 s, only while a visible
  row runs). Detail unchanged (already one call).

## Addendum 3 (2026-11-13): the graph is a view of the executions list

User: "make the graph a switchable visualisation of the list executions since they show the same info in two
different formats"; all filters apply to both views (user choice).

- **One page**, Monitor › Executions, with a **List | Graph** switch (URL `view=graph`, default list). Monitor tabs:
  Conversations | Executions. The Graph tab goes; `/monitor/graph` (and its `range` param) redirects to the
  executions page in graph view, keeping the range as the time filter.
- **One header** for both views: the big-number cards, the toolbar (agent selector, search, trigger, status,
  with failure conditions, with errors via the card, test runs, time), the Refresh button and the "updated …
  ago" note. Switching view keeps every filter.
- **One time control**: Now · Last 1 hour · 24 hours · 7 days · 30 days (URL `range`). The graph's view rule
  applies to **both** views: Now = the unfinished runs of any age; a range = those plus every run started in it.
  So the list on Now shows the unfinished runs. Default: **Now** (my call: the page opens on what is happening).
  The list's old `period` param (24h/7d/30d) is read as `range` so existing links keep working.
- **All filters apply to both views**: `/graph` takes the list's filters (agent_id, trigger, status,
  has_failures, has_errors, test, q) on top of the range view; the cards (stats) take the same filters, so
  cards, list and graph always describe the same set. In graph view, the search shows just the matching run
  and its agent. An agent picked in the selector shows only that agent in the graph.
- **Polling** (user: keep the polling): the graph view refreshes every 60 s (one /graph call); the list view keeps
  its rule (10 s, only while a visible row is running or stopping; one call with the stats). Both pause while the
  tab is hidden, and the Refresh button and the "updated … ago" note serve both views.
