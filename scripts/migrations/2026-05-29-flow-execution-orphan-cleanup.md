# One-shot migration: clean up orphan flow_executions

**When to run:** ONCE, before deploying `fix/flow-checkpoint-orphan-resume`.

**Why:** Prior to this fix, the supervisor claimed `status='running'` docs with an expired deadline and resumed them via `resumeFromIndex(current.directive_index)`. When the resumed chain triggered DirIntent navigation, `archiveAndStartNewChain` reset `current.directive_index` to 0 and `side_effects` to `[]`, causing all side-effect directives at the start of the new chain (e.g. `dia_0_template` → `sendTemplateToLead`) to re-fire. Result: duplicate WhatsApp template sends, duplicate Salesforce updates.

After this fix, the supervisor only resumes `status='waiting'` docs. Pre-existing `status='running'` orphans (lease=null, deadline past) would just sit forever, blocking the underlying lead from being re-fired cleanly.

**What to run:**

```js
// On the host running mongo:
docker exec mongo mongosh tiledesk --quiet --eval '

// 1. Count what we are about to touch
const before = db.flow_executions.aggregate([
  { $match: { status: "running", "lease.until": null } },
  { $group: { _id: null, count: { $sum: 1 } } }
]).toArray();
print("orphans found:", JSON.stringify(before));

// 2. Mark as completed. We use completed (not needs_review) because these
//    are KNOWN pre-fix orphans: they were going to fire duplicates if left
//    as-is. Completed means "do not auto-resume" and is terminal.
const r = db.flow_executions.updateMany(
  { status: "running", "lease.until": null },
  {
    $set: {
      status: "completed",
      completed_at: new Date(),
      last_error: "pre-fix orphan cleanup (2026-05-29-flow-execution-orphan-cleanup)",
      "lease.worker_id": null,
      "lease.until": null,
      updated_at: new Date()
    }
  }
);
print("modified:", r.modifiedCount);

// 3. Confirm nothing left in that state
const after = db.flow_executions.aggregate([
  { $match: { status: "running", "lease.until": null } },
  { $group: { _id: null, count: { $sum: 1 } } }
]).toArray();
print("orphans remaining:", JSON.stringify(after));
'
```

**Safe?** Yes. The selector `status='running' AND lease.until=null` matches only docs that are NOT actively being processed and NOT paused on a WAIT. After the code fix, the supervisor will refuse to resume them anyway (claimDue now requires `status='waiting'`). Cleaning them up just prevents them from accumulating as dead state.

**Will I lose follow-ups?** For an orphan that was, before the bug, supposed to wake up at a future deadline: yes, the follow-up directive won't fire. But that follow-up would have been a DUPLICATE re-fire of the start of the flow (because of the original bug), not a clean continuation. Marking completed is strictly safer than the previous behaviour.

**Rollback:** None needed — `status='completed'` is terminal and idempotent. If a lead needs to be re-triggered, fire the original webhook again; that creates a fresh execution_id.
