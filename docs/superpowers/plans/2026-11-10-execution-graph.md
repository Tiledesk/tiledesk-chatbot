# Execution Graph Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A List / Graph switch on the agents page that shows a live 2D graph: the project in the centre, its agents in a ring, each agent's live and recently failed executions around it, with a pulse for running executions and a red aura on failures.

**Architecture:** Three dashboard units under `src/app/bots/executions/graph/`. A pure model function turns agents + executions into positioned nodes and edges (deterministic positions, so nothing jumps between refreshes). A feed polls the existing executions list API, paced by responses and paused while the tab is hidden. A component renders the model with Cytoscape.js, loaded lazily, with a preset layout and timer-driven animations. The agents page hosts the switch. No change in tybot, the server or tiledesk-executions (the list API already filters `status=running,waiting,stopping` and `status=failed`).

**Tech Stack:** Angular 15, TypeScript 4.8, RxJS, Cytoscape.js 3.30.4, Karma/Jasmine (local harness).

**Spec:** `docs/superpowers/specs/2026-11-10-execution-graph-design.md` (tiledesk-chatbot). It builds on the traceability spec `docs/superpowers/specs/2026-11-09-agent-execution-traceability-design.md` (§11 for the executions UI).

## Global Constraints

- **Repo and branch:** tiledesk-dashboard only, new branch `feature/execution-graph` cut from `feature/execution-traceability` (HEAD 727a0bf97). Main folder, no worktrees (not even temporary), never `git stash`, no push. Every commit ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Library:** `cytoscape@3.30.4` (exact), loaded only through `import('cytoscape')` from the graph component, so it lands in a lazy chunk. No other new dependency. If the package's own types don't compile with TypeScript 4.8.4, add `@types/cytoscape` at the exact version that matches 3.30.
- **Numbers (spec):**
  - refresh every **5000 ms**, paced by responses (the next request starts 5 s after the previous response), paused while `document.hidden`;
  - failed executions shown for **15 minutes** after they ended (`started_at + duration_ms`);
  - failed lookup window **24 h** (`from = now − 24 h`, because the list's `from` filters on `started_at`);
  - at most **300** live executions drawn: the cursor is followed up to **3 pages of 100**;
  - failed lookup: up to 3 pages of 100 as well.
- **States and look (spec, my calls on exact values):**
  - `running`: the run colour, pulsing; its edge to the agent has marching dashes.
  - `waiting`: the wait colour, still, opacity 0.55.
  - `stopping`: the warn colour, blinking.
  - `failed` (within 15 min): the bad colour with a red aura.
  - Agent red aura: any shown failed execution, or a live one with `failure_conditions > 0`.
  - Agents with nothing shown: small and grey.
  - Colours are the execution status chip's palette (`--exec-run`, `--exec-wait`, `--exec-warn`, `--exec-bad` in `shared/execution-status-chip.component.ts`), copied once into a TS constant the graph uses.
  - With `prefers-reduced-motion: reduce`, no pulse, blink or marching dashes.
- **Visibility:** the switch shows only when the agents page's existing `executionsEnabled` getter is true (permission `canViewExecutions` and `EXECUTIONS_BASE_URL` configured). The graph is read-only: no stop or destroy from it.
- **Navigation:**
  - Click on an execution: `executionLink(projectId, agentId, executionId)` (from `execution-links.ts`).
  - Click on an agent: `project/<pid>/bots/<agentId>/executions`.
  - Agent ids use the root id, the same as `executionsAgentId(bot)` (`bot.root_id || bot._id`).
- **Copy:** en and it strings under `Executions.Graph.*`. Use "attribute", never "variable".
- **Storage:** run `npx ng build`, then `rm -rf .angular/cache`. Check `df -h /` first and stop if less than 15 GiB is free. Kill any Karma or Chrome process you start.

## Review Focus

1. **Refresh stability:** an agent or execution that is in both the previous and the next model keeps its exact position. Test: `positions are stable across refreshes` (Task 1).
2. **API errors or service down (503, network):** the graph keeps the last data, shows "Data may be out of date", and keeps retrying on the same 5 s pace. Test: `an error keeps the last snapshot and marks it stale` (Task 2).
3. **Hidden tab:** no requests while hidden; one request immediately when the tab becomes visible again. Test: `hidden tab pauses, visible resumes at once` (Task 2).
4. **Execution of an agent not in the agents list** (deleted, or not on this page): it is still drawn, under an agent node named from `agent_name`, falling back to the first 8 characters of the id. Test: `unknown agent gets a node from agent_name` (Task 1).
5. **Leaving the graph** (switch back to List, leave the page): polling stops and the Cytoscape instance is destroyed. Test: `destroy stops polling and destroys cytoscape` (Task 3).

---

## Before you start

- [ ] In tiledesk-dashboard: `git switch feature/execution-traceability && git status` (clean), then `git switch -c feature/execution-graph`.
- [ ] `npm install --save-exact cytoscape@3.30.4`, then check that only `package.json` and `package-lock.json` changed. Commit `chore: add cytoscape for the execution graph` (with the trailer).
- [ ] The local Karma harness (untracked: `karma.local.conf.js`, `src/test.local.ts`, `src/tsconfig.spec.local.json`) runs the executions specs. Add the new `graph/` specs to its selection; never commit the harness.

### Task 1: Graph model (pure)

**Files:**
- Create: `src/app/bots/executions/graph/execution-graph.model.ts`
- Test: `src/app/bots/executions/graph/execution-graph.model.spec.ts`

**Interfaces — produces:**
```ts
export interface GraphAgent { id: string; name: string; }
export type GraphNodeKind = 'project' | 'agent' | 'execution';
export interface GraphNode {
  id: string;                  // 'project' | 'agent:<agentId>' | 'exec:<executionId>'
  kind: GraphNodeKind;
  label: string;
  status?: 'running' | 'waiting' | 'stopping' | 'failed';
  agentId?: string; executionId?: string;
  aura: boolean;               // red aura
  idle?: boolean;              // agent with nothing shown
  position: { x: number; y: number };
  tooltip: string[];           // lines; execution: status, started at, trigger, steps
}
export interface GraphEdge { id: string; source: string; target: string; animated: boolean; }
export interface GraphCounts { running: number; waiting: number; stopping: number; failed: number; truncated: boolean; }
export interface GraphModel { nodes: GraphNode[]; edges: GraphEdge[]; counts: GraphCounts; }
export const FAILED_WINDOW_MS = 15 * 60 * 1000;
export const MAX_LIVE = 300;
export function buildExecutionGraph(input: {
  projectName: string; agents: GraphAgent[]; live: ExecutionRow[]; failed: ExecutionRow[]; now: number;
}): GraphModel;
```
- Layout (algorithm the signature doesn't fix):
  - project at (0, 0);
  - agents sorted by `name`, then `id`, on a circle of radius `R = max(260, 70 × agentCount / π)`, at angle `2π·i/n − π/2`;
  - each agent's executions sorted by `started_at`, then `_id`, on a circle of radius `r = 46 + 6 × max(0, k − 8)` around the agent, at angle `2π·j/k`.
  - Edges: project → agent (never animated) and agent → execution (animated when `running`).

- [ ] **Step 1: Failing tests** (`ExecutionRow` from `../executions.models`, fixed `now`):
  - `project node at the centre and one node per agent on the ring` (3 agents → 1 + 3 nodes, project at {x:0,y:0}, agents at distance 260 ± 0.5);
  - `live executions attach to their agent with their status`;
  - `failed older than 15 minutes is dropped, within 15 minutes is kept` (ended = started_at + duration_ms; 14:59 kept, 15:01 dropped);
  - `agent aura when a shown execution failed or a live one has failure_conditions > 0`;
  - `idle agent when nothing is shown`;
  - `unknown agent gets a node from agent_name` (falls back to the first 8 characters of `agent_id` when the name is null);
  - `positions are stable across refreshes` (same agents and executions, plus one new execution on another agent: every common node has an identical position);
  - `running edges are animated, others are not`;
  - `more than 300 live: draws 300, counts.truncated true` (counts include all fetched).
- [ ] **Step 2:** Run with the local harness → FAIL (module missing).
- [ ] **Step 3:** Implement `buildExecutionGraph` as above.
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit `feat(executions): execution graph model`.

### Task 2: Graph feed (polling)

**Files:**
- Create: `src/app/bots/executions/graph/execution-graph.feed.ts`
- Test: `src/app/bots/executions/graph/execution-graph.feed.spec.ts`

**Interfaces:**
- Consumes: `ExecutionsService.list(projectId, params) → Observable<ExecutionPage>` (existing).
- Produces:
  ```ts
  export interface GraphSnapshot { live: ExecutionRow[]; failed: ExecutionRow[]; fetchedAt: number; stale: boolean; }
  export const GRAPH_REFRESH_MS = 5000;
  export function executionGraphFeed(
    service: Pick<ExecutionsService, 'list'>, projectId: string,
    opts?: { now?: () => number; hidden$?: Observable<boolean>; refreshMs?: number },
  ): Observable<GraphSnapshot>;
  ```
- Each cycle, in parallel:
  - `list(pid, {status:'running,waiting,stopping', limit:100})`, following `next_cursor` up to 3 pages;
  - `list(pid, {status:'failed', from:<ISO now−24h>, limit:100})`, up to 3 pages.
- Emits once per cycle. The next cycle is scheduled `refreshMs` after the response (success or error).
- On error, re-emit the previous snapshot with `stale: true`. If none exists yet, emit an empty one with `stale: true`.
- `hidden$` defaults to `fromEvent(document,'visibilitychange')` mapped to `document.hidden`, starting with the current value. While hidden, nothing is scheduled; on visible, a cycle starts at once.
- Unsubscribing cancels any in-flight request and timer.

- [ ] **Step 1: Failing tests** (`fakeAsync`, fake service returning `of(...)`/`throwError`, a `Subject<boolean>` for hidden):
  - `first cycle runs at once with both queries and the exact params`;
  - `follows next_cursor up to 3 pages and stops`;
  - `next cycle 5000 ms after the response, never overlapping` (a delayed response: no second call before it resolves);
  - `an error keeps the last snapshot and marks it stale`, then the next success clears `stale`;
  - `hidden tab pauses, visible resumes at once`;
  - `unsubscribe stops timers` (no calls after unsubscribing; `discardPeriodicTasks` not needed).
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement `executionGraphFeed`.
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit `feat(executions): execution graph feed`.

### Task 3: Graph component (Cytoscape)

**Files:**
- Create:
  - `src/app/bots/executions/graph/execution-graph.component.ts`, `.html`, `.scss`;
  - `src/app/bots/executions/graph/execution-graph.colors.ts`: `EXEC_GRAPH_COLORS`, copied from the chip palette.
- Modify: `src/app/bots/executions/executions.module.ts` (declare and export the component).
- Modify: `src/assets/i18n/en.json`, `it.json`, adding `Executions.Graph.*`:
  - `Counts`: "{{running}} running · {{waiting}} waiting · {{failed}} failed in the last 15 min";
  - `Truncated`: "Showing the first 300 live executions";
  - `Stale`: "Data may be out of date";
  - `Legend.Running`, `Legend.Waiting`, `Legend.Stopping`, `Legend.Failed`, `Legend.Problem`;
  - `Unavailable`: "The graph could not be loaded";
  - Italian: same keys, my wording.
- Test: `src/app/bots/executions/graph/execution-graph.component.spec.ts`

**Interfaces:**
- Consumes: `buildExecutionGraph` (Task 1), `executionGraphFeed` and `GraphSnapshot` (Task 2), `executionLink` and `Router`.
- Produces: `<execution-graph [projectId]="..." [projectName]="..." [agents]="GraphAgent[]">`.
  - On init: `await import('cytoscape')`, then create the instance in a container div with `layout: {name:'preset'}`, `userZoomingEnabled`, `boxSelectionEnabled:false`, `autoungrabify:true`.
  - On each snapshot, rebuild the model and diff it into Cytoscape: add new elements, remove gone ones, update `data` and `classes`, keep positions from the model.
  - `fit` runs only on the first render.
- Look:
  - CSS-style classes `project`, `agent`, `exec`, `s-running`, `s-waiting`, `s-stopping`, `s-failed`, `aura`, `idle`, `edge-animated`.
  - Aura: a red `underlay` (`underlay-color` = the bad colour, `underlay-padding` 8, `underlay-opacity` 0.35).
  - Pulse: a 1200 ms `setInterval`, outside the Angular zone, that alternates running nodes' `underlay-opacity` (run colour) and `stopping` opacity.
  - Marching dashes: animated edges use `line-style: dashed`, with `line-dash-offset` stepped every 100 ms.
  - Under `prefers-reduced-motion: reduce`, neither timer is started.
- Interaction:
  - Hover on a node shows a small HTML tooltip (the node's `tooltip` lines) positioned at the node's rendered position.
  - Tap on an execution navigates with `executionLink`; tap on an agent goes to its executions list; tap on the project does nothing.
- Header line: the counts text, plus the `Truncated` and `Stale` notes when they apply. Then the legend.
- If the import or Cytoscape init throws: show `Unavailable` and emit `(unavailable)` so the host can switch back to List.
- `ngOnDestroy`: unsubscribe the feed, clear both timers, and run `cy.destroy()`.

- [ ] **Step 1: Failing specs:**
  - Real Cytoscape in Karma, the feed replaced by a `Subject<GraphSnapshot>` through an injectable factory token `EXECUTION_GRAPH_FEED`.
  - `renders project, agents and executions from a snapshot` (`cy.nodes().length`; class `s-running` on a running execution).
  - `a second snapshot keeps existing node positions and removes gone executions`.
  - `failed execution and its agent get the aura class`.
  - `tap on an execution navigates to its detail`. Spy on `Router.navigate`; the commands equal `executionLink(...).commands`.
  - `tap on an agent navigates to its executions list`.
  - `counts line and stale note`.
  - `destroy stops polling and destroys cytoscape`: the feed is unsubscribed, timers are cleared (spy on `clearInterval`), and `cy.destroyed()` is true.
  - `reduced motion starts no timers`, with `matchMedia` stubbed.
  - `import failure shows Unavailable and emits unavailable`, with the loader stubbed through an injectable `CYTOSCAPE_LOADER` token defaulting to `() => import('cytoscape')`.
- [ ] **Step 2:** Run the specs → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the specs → PASS. Then run `npx ng build` and check that cytoscape is in a lazy chunk, not in `main`: grep the `dist` chunk names or sizes, and record the chunk name and size in the report. Then `rm -rf .angular/cache`.
- [ ] **Step 5:** Commit `feat(executions): execution graph component`.

### Task 4: List / Graph switch on the agents page

**Files:**
- Modify: `src/app/bots/bots-list/bots-list.component.ts`, `.html`, `.scss`
- Modify: `bots-list.module.ts`, only if `ExecutionsModule` isn't already imported there for the component.
- Modify: `en.json` and `it.json`: `Executions.Graph.SwitchList` "List", `Executions.Graph.SwitchGraph` "Graph".
- Test: `src/app/bots/bots-list/bots-list.graph.spec.ts`

**Interfaces:**
- Consumes: `<execution-graph>` (Task 3), the page's `executionsEnabled`, `executionsAgentId(bot)`, `project`, and `faqkbList`.
- Produces:
  - `viewMode: 'list' | 'graph'`, stored in `localStorage['tiledesk_agents_view']`. Every read and write is wrapped in try/catch, and the default is `'list'`.
  - `graphAgents: GraphAgent[]`, built from `faqkbList` as `{id: executionsAgentId(bot), name: bot.name}`. Recomputed when the list loads, not on every change detection.
- The switch is a two-button toggle next to the existing "All executions" button, shown only when `executionsEnabled`. In graph mode the agents list and its paging are hidden and `<execution-graph>` takes their place. On `(unavailable)` the view goes back to list.

- [ ] **Step 1: Failing specs:**
  - `switch hidden when executionsEnabled is false`.
  - `graph mode shows execution-graph with the agents' root ids and hides the list`.
  - `choice is remembered`, with `localStorage` stubbed.
  - `unavailable falls back to list`.
  - `stored 'graph' with executions disabled shows the list`.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the bots-list executions specs, the new spec and all `graph/` specs → PASS. Then `npx ng build` and `rm -rf .angular/cache`.
- [ ] **Step 5:** Commit `feat(bots): list / graph switch on the agents page`.

### Task 5: Local check on the stack

**Files:** create `docs/superpowers/notes/execution-graph-check.md` and screenshots under `docs/superpowers/notes/execution-graph-check/` (tiledesk-chatbot).

- [ ] **Step 1:** In tiledesk-dev-env, run `bin/exec-disk`. Rebuild the dashboard with `DASHBOARD_PATH=../tiledesk-dashboard bin/exec-rebuild dashboard` (the branch is checked out in the main folder), then recreate the dashboard service. No prune.
- [ ] **Step 2:** In the browser pane, signed in as the demo owner, go projects → project → agents → Graph. Start these through the demo agents' webhooks (the README has the URLs):
  - two "Exec demo · hang" runs (running, pulsing);
  - one slow demo run (running, then waiting);
  - one run that fails. Use the dev-env's failing demo if the seed has one; otherwise kill the chatbot while a hang run is mid-block and let the reaper fail it.
  Check:
  - pulse, marching edge, red aura on the failed run and on its agent;
  - the counts line;
  - clicking an execution opens its detail;
  - hiding the tab stops requests (Network panel or `read_network_requests`);
  - switching to List and back keeps working;
  - stopping the executions-api container shows the stale note, and starting it again clears it.
  Restart anything you stopped.
- [ ] **Step 3:** Write the notes with a PASS/FAIL per check and screenshots. Commit in tiledesk-chatbot: `docs: execution graph local check`.

---

## Self-review notes

- **Spec coverage:**
  - switch and remembered choice: T4;
  - layout, states, aura, idle, tooltip, click, legend, counter: T1 and T3;
  - who sees it, the off switch: T4;
  - 5 s, paused when hidden: T2;
  - 24 h failed lookup with the 15-min client filter: T1 and T2;
  - the 300 cap: T1 and T2;
  - lazy-loaded Cytoscape: T3;
  - en/it copy: T3 and T4;
  - read-only: no task adds controls;
  - branch: Before you start;
  - the builder check on `stopping` in the list filter is settled: `LIST_STATUSES` already includes it (tiledesk-executions `src/api/routes/executions.ts:13`), so no service change.
- **My calls beyond the design:**
  - preset layout with computed positions instead of Cytoscape's concentric layout, because concentric can't place executions around their own agent;
  - the radius formulas;
  - the `tiledesk_agents_view` storage key;
  - `@types/cytoscape` only if needed.
