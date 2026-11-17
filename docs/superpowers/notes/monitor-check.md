# Monitor executions: live check (2026-11-10)

Local `tiledesk-exec` stack, dashboard rebuilt from `feature/execution-graph`
(2fc015a46, then 754c5f93f with the layout fix). Browser pane at 1163x788, project
`6af2301d8adf5f00136aa7b0`, one "Exec demo · hang" run fired so something was running.
Screenshots in `monitor-check/`.

| Check | Result | Screenshot |
|---|---|---|
| Tab bar under the navbar, same position on all three pages | FAIL on 2fc015a46, PASS after the fix | 00-before-*, 01, 02, 03 |
| Monitor shows Conversations / Executions / Graph as owner | PASS | 01 |
| Executions lists runs; agent switcher; detail page | PASS | 03, 04, 05 |
| Graph fills the page, running chip on the hang agent | PASS | 02 |
| Old `/bots/<agent>/executions/<id>` and `/bots/executions` redirect to `/monitor/…`, query kept | PASS | (address checked) |
| Agents page: no List/Graph switch; "All executions" and an agent's Executions open Monitor › Executions | PASS | 06 |
| Sidebar: Monitor active on all three tabs and the detail, Flows not | PASS | 01-05 |
| As `exec-agent@`: Monitor shows conversations, no tab bar; `/monitor/graph` shows Unauthorized | PASS | 07 |

## Layout

On 2fc015a46 the tab bar was at y 0-39 on Conversations and Executions, under the absolute
61px header (`00-before-*`), and at 61-100 on Graph (its own `padding-top: 61px`).

Fix (`fix(monitor): tab bar position under the navbar`, 754c5f93f): `.monitor-tabs` is
`position: relative; top: 61px; z-index: 2`, so it is drawn under the header without moving
the pages, which already leave room for the header below their first block (conversations:
the 87px block holding the "All agents / Your conversations" bar; executions list and detail:
`.main-content` margin-top 70px). The graph page resets the offset to 0
(`.graph-page-top ::ng-deep .monitor-tabs`). The empty `<monitor-tabs>` host of the agent role
is untouched, so that layout does not change.

After the fix the bar is at y 61-100 on Conversations, Executions list, execution detail and
Graph. On Graph the `execution-graph` spans 112-772 of a 788px viewport, with no page scroll.

## Notes (not fixed)

- On Monitor › Executions and Graph the navbar title stays blank after a full load (it keeps
  "Conversations" when you get there from the Conversations tab).
- The per-agent Executions icon button on the agents page has no `aria-label`; only its
  tooltip names it.
- After you confirm Log Out, the confirmation dialog stays over the login page until a reload.
  This is not part of this feature.
