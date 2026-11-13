# Execution detail page — enterprise refresh (design)

Date: 2026-11-13. Repo: tiledesk-dashboard (`src/app/bots/executions/execution-detail/`). User picked direction **A**
of the design board "Execution detail — enterprise refresh" (variant "A · Header grid, KPI strip, waterfall timeline").

## Why
The header was a loose line of text (raw version id, `Execution fd3cc307`, start time, duration), actions were
scattered (a lone Start new on the left, View data on the right), there was no summary, and the timeline gave
the "attributes changed by the incoming message" rows the same weight as the blocks.

## Layout (top to bottom)
1. **Breadcrumb** as today (Executions › short id).
2. **Header card**
   - Left: agent icon tile, agent name (title), status chip, a subtitle line (trigger · ended/started time ·
     conversation or "no conversation").
   - Right, grouped: **View data** (outline), the **primary control** for the state (Stop when running/waiting,
     Resume when stopped, Start new when ended — whatever `allowed_controls` offers; disabled with its reason as
     tooltip, as today), and an **overflow menu**: the other allowed controls (Destroy last, in red, separated),
     "Copy execution link", "Open in Activities".
   - Under a divider, a **labelled details grid** (3 columns, 2 rows; wraps on small screens): Agent, Trigger,
     Version (mono, shortened, copy button), Execution ID (mono, copy, full id in tooltip), Started, Conversation
     (link when there is one). Existing extra facts (stop mode and time, messages received while stopped, lineage:
     previous / parent / retry of / retried as, trace incomplete) go into the same grid as extra cells or a thin
     info row under it — nothing that is shown today disappears.
3. **Six summary tiles** (same look as the executions page cards): Duration, Blocks, Actions, Failure conditions,
   Errors (unhandled actions), Attributes changed.
4. **Tabs card**: Timeline · Flow state · Audit (as today), with All / Not successful on the right.
   - **Timeline as a table**: Time · Block (outcome icon + name) · Outcome (badge) · Attributes ("N changed",
     link as today) · Duration (a bar positioned on the execution's time axis: offset = step start − execution
     start, width = step duration, min width visible; ms label) · expand chevron. Expanding a row shows the
     actions as today (with "not handled" and "running…" marks kept).
   - The **incoming-message changes** become one quiet row ("Incoming message set N attributes" + Show), not a
     striped full-width band.

## Kept
Polling, grants/View data flow, Start new dialog, stop dialog, destroy confirmation, data masking, audit tab,
history panel, all i18n (en/it), permissions, existing behaviours and specs (DOM assertions updated).

## Left to the builder
Exact spacing/colours within the dashboard's style (Material + SCSS, no shadcn), icons (material icons),
responsive breakpoints, the bar's minimum width, how lineage facts fit the grid.
