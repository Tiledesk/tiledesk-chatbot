# Executions and graph in Monitor — short design

Date: 2026-11-10. Builds on the execution graph (`feature/execution-graph`, head 915299b25).

## Intent
Monitor (sidebar pulse icon, `/project/:pid/wsrequests`) answers "what is happening right now" for conversations.
The executions list and the execution graph answer the same question for agents, so they move next to it. The agents
page (Flows) goes back to building and managing agents. The graph gets a full-height page, so it is readable when it
opens.

## What the user sees
- Monitor gets a tab bar at the top: **Conversations | Executions | Graph**. Conversations is today's page,
  unchanged under the bar.
- Executions and Graph show only to people who can see executions (`canViewExecutions` and `EXECUTIONS_BASE_URL`
  configured). Everyone else sees Monitor exactly as today, with no tab bar at all (my call: one tab is no tab).
- **Executions** tab = today's executions list (all agents, with the agent switcher, filters and detail pages).
- **Graph** tab = the execution graph on its own page, using the full height under the tab bar.
- The sidebar's Monitor icon is highlighted on all three tabs; Flows is not highlighted on executions pages any more.
- Agents page: the List / Graph switch and the inline graph are removed. "All executions" opens Monitor › Executions;
  each agent's Executions button opens Monitor › Executions filtered to that agent.

## Addresses (my call)
- `/project/:pid/monitor/executions` — all agents.
- `/project/:pid/monitor/:agentId/executions` — one agent.
- `/project/:pid/monitor/:agentId/executions/:executionId` — detail.
- `/project/:pid/monitor/graph` — graph.
- The old `/project/:pid/bots/executions…` addresses redirect to the new ones (links in conversations, Activities,
  webhook logs and bookmarks keep working). `executionLink()` and the agent switcher produce the new addresses.
- Conversations stays at `/project/:pid/wsrequests`.

## Approaches considered
1. Monitor tabs (chosen by the user): all live monitoring in one place; graph full height.
2. Executions in Monitor, graph as its own page under Flows: the list and the graph would live apart.
3. Leave as is.

## How (my calls)
- The tab bar is a small standalone component placed at the top of the three pages; the conversations page only gets
  that one tag added (its 1,200-line template is otherwise untouched).
- The graph page loads the project's agents itself (same agent list and root-id mapping the agents page used) and
  hosts `<execution-graph>` unchanged.
- No change in tiledesk-executions, tybot or the server.

## Non-goals
Departments, new filters, changing the conversations page, changing who can open Monitor.

## Known limit
A custom role that can see executions but not Monitor has no sidebar entry to Monitor; it can still open the pages by
address and from links. (Monitor visibility is unchanged by design.)
