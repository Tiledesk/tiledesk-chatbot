# Execution graph — short design

Date: 2026-11-10. Builds on agent execution traceability (Phase 1 trace, Phase 2 stop & destroy).

## Intent
A glance-view of a project's agents and what they are executing right now, so a person can see at once
what is running and whether anything is in trouble. Asked by the user; departments are out for now.

## What the user sees
- On the agents page, a switch **List / Graph**. Graph replaces the list in place; the choice is remembered
  per browser (my call).
- A 2D graph: the **project** in the centre, its **agents** in a ring around it, each agent's **executions**
  in a small ring around that agent.
- Execution states (my call, following the Phase 1/2 status chip colours):
  - `running`: green dot with a slow pulse (the "vibe"), the edge to its agent animated (marching dashes).
  - `waiting`: grey-blue, still, dimmed.
  - `stopping`: amber, blinking.
  - `failed` in the last **15 minutes** (my call): red dot with a **red aura**; it fades out of the graph
    after 15 minutes.
- **Red aura on the agent** when any of its shown executions is failed, or a live one has
  `failure_conditions > 0` (it already took an error branch).
- Agents with nothing live are shown small and grey, so the ring stays stable between refreshes.
- Hover: a tooltip (agent name, or execution status, started at, trigger, steps). Click on an execution:
  opens its detail page (where Stop/Destroy already live). Click on an agent: opens its executions list.
- A small legend and a counter line ("12 running · 3 waiting · 2 failed in the last 15 min").

## Who sees it
The same people who can see executions today (`canViewExecutions`); the switch is hidden when
`EXECUTIONS_BASE_URL` is empty.

## Data (no service change expected)
- Agents: the agents page's own list.
- Executions, refreshed every **5 s** while the page is visible (paused when the tab is hidden), paced by
  responses like the Phase 1 detail page:
  - `GET …/executions?status=running,waiting,stopping&limit=100` (follow the cursor up to 3 pages = 300).
  - `GET …/executions?status=failed&from=<now-24h>&limit=100`, kept client-side when
    `started_at + duration_ms` is within the last 15 minutes (the list's `from` filters on `started_at`).
- Builder to check: that the list's status filter accepts `stopping` (added in Phase 2). If not, a one-line
  service change is in scope.
- Over 300 live executions: the graph shows the first 300 and says so in the counter line.

## Approaches considered
1. **Cytoscape.js, 2D (chosen by the user).** Concentric layout fits centre → agents → executions exactly and
   stays stable between refreshes; borders/shadows give the red aura; pulses and marching edges are done with
   its animation API on a timer. About 400 KB, no WebGL. Best for reading problems at a glance.
2. 3d-force-graph (three.js): rotating 3D space with built-in particle "vibe", but needs WebGL, about 600 KB, and
   nodes hide behind each other — dropped by the user in favour of 2D.
3. ECharts graph (already a dependency): no new library, but weaker control over per-node animation and
   layout stability. Not chosen.

## Constraints
- Angular 15 dashboard; Cytoscape.js loaded lazily with the graph view only (my call), so the agents list
  doesn't grow.
- No change in tybot or the server. Read-only: the graph never stops or destroys anything itself.
- Respect the execution-detail polling rules (no overlapping requests; stop on page leave).
- "attribute" wording rule and en/it strings for every label.

## Goals / non-goals
- Goal: in under 5 seconds a person can tell how many executions are running and which agent has a problem.
- Non-goals: departments (later), live push/streaming (later), history beyond 15 minutes, controls in the graph.
- Anti-goal: a pretty view that lags or jumps around so much that problems are hard to spot.

## Where it is built (my call)
tiledesk-dashboard (plus tiledesk-executions only if the `stopping` filter is missing), on a new branch
`feature/execution-graph` cut from `feature/execution-traceability`, because it needs the Phase 1/2 API that
is not on master yet. Local only, nothing pushed, same rules as Phase 2.

## Left to the builder
Exact colours (reuse the status chip palette), animation timings, node sizes, tooltip layout, the switch's
placement in the agents page header.
