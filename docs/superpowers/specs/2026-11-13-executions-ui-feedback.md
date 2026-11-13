# Executions UI — team feedback round 1 (2026-11-13)

Feedback received in Italian (points 1 and 3 were not in the list). Items, with the reading the builder must follow:

2. **"rimuovere icona all executions da lista agenti"** — on the agents list (`bots/bots-list`), remove the "All
   executions" icon/button. The per-agent executions buttons stay.
4. **"manina su blocco del grafo"** — pointer cursor over the clickable graph nodes (agents, executions, "+N").
   Cytoscape draws on a canvas: set the container's cursor on node `mouseover` / reset on `mouseout`.
5. **"ordinamento colonne"** — the executions list columns sort: Started (default, newest first), Status, Agent,
   Trigger, Blocks, Failure conditions, Attributes changed, Duration. Click a header: ascending/descending,
   arrow shown, kept in the URL (`sort=<field>&dir=asc|desc`). Sorting is **server-side** (the list is paged by
   cursor): the list API takes `sort` and `dir`, the cursor encodes the sort value + `_id`, and the sort fields
   are indexed or the query stays bounded by the project/range filter. Graph view unaffected.
6. **"aggiungere filtri nella timeline di dettaglio dell'esecuzione" / 6.1 "nome blocco, tipo blocco (checkbox
   multiselect)"** — the execution detail timeline gets two multi-select filters with checkboxes, next to All /
   Not successful: **Block name** (the block names of this run) and **Block type**. Blocks carry no type of
   their own: "block type" = the action types inside the block (webrequestv2, ai_prompt, …, shown with readable
   labels where the dashboard has them); a block matches if it contains any selected type. Filters combine with
   each other and with Not successful (AND). Client-side on the loaded steps; a clear-filters control.
7. **"rimuovere bordatura totalmente dai kpi di dettaglio esecuzione"** — the six summary tiles of the detail page
   lose every border (including the coloured top line); spacing/background keep them readable.
8. **"modificare il concetto di stopped in pausa"** — user-facing wording only: "stopped" becomes "paused" (it:
   "in pausa") everywhere it is shown — status chip and card ("Paused"), the Stop control and dialog ("Pause";
   soft/hard: "Pause after the current action" / "Pause now"; "Stopping" → "Pausing"), "messages received while
   stopped" → "while paused", the stop notice setting → "pause notice" (card title, hint, Activities sentence in
   the dashboard), the default notice texts stay as they are (they already say "paused"). Status values, API
   fields, URLs (`status=stopped`) and code names do not change.
