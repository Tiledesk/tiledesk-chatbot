# Executions and Graph in Monitor — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the executions list and the execution graph into Monitor as tabs (Conversations | Executions | Graph), with the graph on its own full-height page and the agents page cleaned up.

**Architecture:**
- New canonical routes under `/project/:pid/monitor/…`, served by the existing executions module.
- Redirects from the old `/bots/executions…` addresses.
- A standalone `<monitor-tabs>` bar on the conversations, executions and graph pages.
- A new graph page that loads the agents itself.
- The sidebar highlights Monitor for all three.

**Tech Stack:** Angular 15, Karma (local harness).

**Spec:** `docs/superpowers/specs/2026-11-10-monitor-executions-design.md` (tiledesk-chatbot).

## Global Constraints

- **Repo and branch:** tiledesk-dashboard only, branch `feature/execution-graph` (continue it; HEAD 915299b25). Work in the main folder. No worktrees (not even temporary), never `git stash`, no push. Every commit ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Addresses (exact):**
  - `project/:projectid/monitor/executions`
  - `project/:projectid/monitor/:botid/executions`
  - `project/:projectid/monitor/:botid/executions/:executionid`
  - `project/:projectid/monitor/graph`
  - The old `project/:projectid/bots/executions`, `project/:projectid/bots/:botid/executions` and `…/:executionid` redirect to the new ones, keeping query params.
- **Who sees the tabs:** the tab bar renders only when `canViewExecutions(role, matchedPermissions)` is true and `ExecutionsService.isConfigured()` is true. Otherwise there is no bar at all.
- **Labels:** Conversations / Executions / Graph, from the i18n keys `Monitor.Tabs.Conversations|Executions|Graph`. Italian: Conversazioni / Esecuzioni / Grafo.
- **Sidebar:** the Monitor item is active on `/wsrequests` and on any `/monitor/` URL. The Flows item is not active on `/monitor/` URLs.
- **No service, server or tybot changes.**
- **Copy:** use "attribute", never "variable".
- **Storage:** run `npx ng build`, then `rm -rf .angular/cache`. Check `df -h /` first and stop if less than 15 GiB is free. Kill any Karma or Chrome process you start. Never commit the local Karma harness.

## Review Focus

1. **Old links:**
   - An Activities, conversation or webhook-log link to `/bots/<agent>/executions/<id>` lands on the new detail page.
   - Test: `old executions addresses redirect to monitor` (Task 1).
2. **Agent switcher on the list:** switching agents moves between `monitor/executions` and `monitor/<agent>/executions` and keeps the filters. Test: `agent switcher navigates within monitor` (Task 1).
3. **Human agents (no executions permission):**
   - Monitor looks exactly as today: no tab bar.
   - Test: `no tab bar without executions permission` (Task 2).
4. **Graph page loading:**
   - The graph starts only once the agents have loaded, so it never draws unknown agents first and then jumps.
   - Test: `graph page passes agents once loaded` (Task 3).
5. **Agents page:**
   - The old saved `tiledesk_agents_view = 'graph'` value no longer matters.
   - Agent buttons go to Monitor.
   - Test: `agent executions button opens monitor` (Task 4).

---

### Task 1: Routes, redirects and links

**Files:**
- Modify:
  - `src/app/app.routing.ts`: the new routes; the old executions routes become redirects.
  - `src/app/bots/executions/execution-links.ts`: `executionLink` uses the `monitor` prefix.
  - `src/app/bots/executions/executions-list/executions-list.component.ts`: the agent switcher base.
  - any other hard-coded `'bots', …, 'executions'` navigation. Grep `src/app` for `'executions'` and `/executions`.
- Test: update `execution-links.spec.ts`, `executions-routes.spec.ts` and the list's switcher spec.

**Interfaces — produces:**
- `executionLink(projectId, agentId, executionId)`:
  - with an agent: `{commands: ['/project', pid, 'monitor', agentId, 'executions', id]}`;
  - without one: `{commands: ['/project', pid, 'monitor', 'executions'], queryParams: {q: id}}`.
- `monitorExecutionsLink(projectId, agentId?) → string[]`, exported from `execution-links.ts` for the other tasks.

- [ ] **Step 1: Failing specs:**
  - `executionLink uses the monitor prefix`;
  - `old executions addresses redirect to monitor` (router config test: each old path has `redirectTo` to the new one);
  - `agent switcher navigates within monitor`.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** Run → PASS. Then grep that no `'bots', … 'executions'` navigation is left.
- [ ] **Step 5:** Commit `feat(executions): executions live under monitor`.

### Task 2: Monitor tab bar and sidebar

**Files:**
- Create: `src/app/bots/executions/monitor-tabs/monitor-tabs.component.{ts,html,scss}` (+ module or declaration that is importable by both the ws-requests-list module and the executions module).
- Modify:
  - `src/app/ws_requests/ws-requests-list/ws-requests-list.component.html`: one `<monitor-tabs active="conversations">` at the top.
  - its module: import.
  - the executions list and detail templates: `active="executions"`.
  - `src/app/components/sidebar/sidebar.component.ts`: active state.
  - en/it i18n.
- Test: `monitor-tabs.component.spec.ts` and a sidebar active-state spec.

**Interfaces — produces:** `<monitor-tabs [active]="'conversations'|'executions'|'graph'">`. It reads the project and the role the same way the agents page does (`canViewExecutions`). Its links are:
- Conversations → `/project/:pid/wsrequests`;
- Executions → `monitorExecutionsLink(pid)`;
- Graph → `/project/:pid/monitor/graph`.

Use `<a routerLink>` elements with `aria-current="page"` on the active tab.

- [ ] **Step 1: Failing specs:**
  - `no tab bar without executions permission`;
  - `three tabs with the active one marked`;
  - `sidebar marks Monitor active on /monitor/ urls and not Flows`.
- [ ] **Step 2–4:** RED → implement → GREEN.
- [ ] **Step 5:** Commit `feat(monitor): conversations, executions and graph tabs`.

### Task 3: Graph page

**Files:**
- Create: `src/app/bots/executions/graph-page/graph-page.component.{ts,html,scss}`, routed at `monitor/graph` inside the executions module.
- Test: `graph-page.component.spec.ts`

**Interfaces:**
- Consumes `<execution-graph [projectId] [projectName] [agents]>` (unchanged).
- Loads the agents with the same service call and mapping the agents page used: `GraphAgent {id: bot.root_id || bot._id, name}`, all agents of the project.
- Renders `<execution-graph>` only after the agents arrive. If loading fails, it shows an error line.
- Layout: the tab bar on top, then the graph filling the rest of the viewport (`height: calc(100vh - <header>)`, min 480px).
- `(unavailable)` shows the graph's own Unavailable message; there is no list fallback here.

- [ ] **Step 1: Failing specs:**
  - `graph page passes agents once loaded`;
  - `shows an error when agents fail to load`;
  - `tab bar marks graph`.
- [ ] **Step 2–4:** RED → implement → GREEN.
- [ ] **Step 5:** Commit `feat(executions): graph on its own monitor page`.

### Task 4: Agents page cleanup

**Files:**
- Modify: `bots-list.component.{ts,html,scss}`, `bots-list.module.ts`, `bots-list.graph.spec.ts` (delete or replace), `bots-list.executions.spec.ts`.

**Changes:**
- Remove `viewMode`, `showGraph`, `setViewMode`, `graphAgents`, `buildGraphAgents`, `onGraphUnavailable`, the switch markup, the graph host and the `ExecutionGraphModule` import, plus their scss and the `Executions.Graph.Switch*` i18n keys if nothing else uses them.
- Leave `localStorage['tiledesk_agents_view']` alone: no reads, no writes.
- The "All executions" button and each agent's Executions button use `monitorExecutionsLink`.

- [ ] **Step 1: Failing specs:**
  - `agent executions button opens monitor`;
  - `all executions button opens monitor`;
  - `agents page has no list/graph switch`.
- [ ] **Step 2–4:** RED → implement → GREEN. Run all executions, graph, bots-list and monitor specs. Then `npx ng build` and confirm cytoscape is still only in a lazy chunk. Then `rm -rf .angular/cache`.
- [ ] **Step 5:** Commit `refactor(bots): agents page links to monitor; graph switch removed`.

### Task 5: Live check

- [ ] Rebuild and recreate only the dashboard on the local stack (`COMPOSE_PROJECT_NAME=tiledesk-exec COMPOSE_PROFILES=infra,core,exec DASHBOARD_PATH=../tiledesk-dashboard bin/exec-rebuild dashboard`, then `bin/dev up -d --no-build dashboard`). No prune.
- [ ] In the browser pane, as the demo owner:
  - Monitor shows three tabs.
  - Executions lists runs; the agent filter and the detail page work.
  - Graph fills the page.
  - An old `/bots/<agent>/executions/<id>` link redirects.
  - The agents page has no switch, and its buttons open Monitor.
  - As the seeded agent user (`exec-agent@`), Monitor has no tab bar.
- [ ] Screenshots go to tiledesk-chatbot `docs/superpowers/notes/monitor-check/`, with a short `docs/superpowers/notes/monitor-check.md`. Commit in tiledesk-chatbot: `docs: monitor executions check`.
