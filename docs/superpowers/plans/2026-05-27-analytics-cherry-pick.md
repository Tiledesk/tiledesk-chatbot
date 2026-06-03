# Analytics Cherry-pick Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cherry-pick the 5 analytics commits from `main_pre` onto `merge/analytics-in-main` using `--no-commit` on each, resolve all conflicts, and leave the working tree staged and ready for a single developer commit.

**Architecture:** Five sequential `git cherry-pick --no-commit` calls build up staged changes incrementally. Known conflict in `DirectivesChatbotPlug.js` (commits 4–5) requires manual adaptation because `main_pre` refactored directive execution into an `executeDirective()` Promise wrapper that does not exist on `main` — the equivalent on `main` is the `handler.execute(directive, callback)` pattern in `process()`.

**Tech Stack:** Node.js, git cherry-pick, no test runner required (analytics_test.js is being ported as-is)

---

## File Map

| File | Action | Notes |
|------|--------|-------|
| `tybotRoute/AnalyticsClient.js` | Create | New file — fire-and-forget analytics publisher |
| `tybotRoute/test/analytics_test.js` | Create | New file — ported from main_pre as-is |
| `tybotRoute/engine/TiledeskChatbot.js` | Modify | Import, matchContext param, intent_matched tracking, anomaly enrichment |
| `tybotRoute/index.js` | Modify | Import, intent_completed tracking in both reply branches |
| `tybotRoute/tiledeskChatbotPlugs/DirectivesChatbotPlug.js` | Modify | Import, flow_error tracking, block_executed tracking (manual adapt) |
| `tybotRoute/tiledeskChatbotPlugs/directives/DirMoveToAgent.js` | Modify | Import + handover_to_human tracking |
| `tybotRoute/tiledeskChatbotPlugs/directives/DirReplaceBotV2.js` | Modify | Import + agent.bot_switched tracking |
| `tybotRoute/tiledeskChatbotPlugs/directives/DirReplaceBotV3.js` | Modify | Import + agent.bot_switched tracking |
| `tybotRoute/tiledeskChatbotPlugs/directives/DirWebRequest.js` | Modify | Import + webhook.triggered tracking |
| `tybotRoute/tiledeskChatbotPlugs/directives/DirWebRequestV2.js` | Modify | Import + webhook.triggered tracking |
| `.gitignore` | Modify | Add `.idea`, fix trailing newline |

---

## Task 1: Cherry-pick `babee9ef` — wire AnalyticsClient into engine and directives

**Files:**
- Modify: `tybotRoute/engine/TiledeskChatbot.js`
- Modify: `tybotRoute/tiledeskChatbotPlugs/DirectivesChatbotPlug.js`
- Modify: `tybotRoute/tiledeskChatbotPlugs/directives/DirMoveToAgent.js`
- Modify: `tybotRoute/tiledeskChatbotPlugs/directives/DirReplaceBotV2.js`
- Modify: `tybotRoute/tiledeskChatbotPlugs/directives/DirReplaceBotV3.js`
- Modify: `.gitignore`

- [ ] **Step 1.1: Run cherry-pick**

```bash
git cherry-pick --no-commit babee9ef
```

- [ ] **Step 1.2: Check status**

```bash
git status
```

If there are no conflicts (no `UU` entries), skip to Step 1.7. If there are conflicts, continue with Step 1.3.

- [ ] **Step 1.3: Fix `tybotRoute/engine/TiledeskChatbot.js` if conflicted**

Open the file and apply the following changes manually (on top of `main`'s version):

**a) Add import after line 10 (`const winston = require('../utils/winston');`):**
```js
const { AnalyticsClient } = require('../AnalyticsClient');
```

**b) Update `execIntent` signature at line 314:**
```js
// BEFORE:
async execIntent(faq, message, lead) {//, bot) {
// AFTER:
async execIntent(faq, message, lead, matchContext = {}) {//, bot) {
```

**c) Update all 5 call sites to pass matchContext:**
```js
// line ~102 (locked intent):
reply = await this.execIntent(faq, message, lead, { match_type: 'locked' });//, bot);

// line ~161 (parameter-based intent):
reply = await this.execIntent(faq, message, lead, { match_type: 'explicit' });

// line ~192 (exact match):
reply = await this.execIntent(faq, message, lead, { match_type: 'nlp' });//, bot);

// line ~223 (NLP match):
reply = await this.execIntent(faq, message, lead, { match_type: 'exact' });//, bot);

// line ~242 (fallback):
reply = await this.execIntent(fallbackIntent, message, lead, { match_type: 'fallback' });//, bot);
```

**d) Enrich anomaly detection returns in `checkStep()` (lines ~574 and ~595):**
```js
// max_steps block — BEFORE:
return {
  error: "Anomaly detection. MAX ACTIONS (" + max_steps + ") exeeded."
};
// AFTER:
return {
  error: "Anomaly detection. MAX ACTIONS (" + max_steps + ") exeeded.",
  error_code: 'max_steps_exceeded',
  step_count: current_step
};

// max_execution_time block — BEFORE:
return {
  error: "Anomaly detection. MAX EXECUTION TIME (" + max_execution_time + " ms) exeeded."
};
// AFTER:
return {
  error: "Anomaly detection. MAX EXECUTION TIME (" + max_execution_time + " ms) exeeded.",
  error_code: 'max_time_exceeded',
  step_count: current_step
};
```

**e) Add analytics tracking after the `// FORM END` comment (line ~382), before `const context = {`:**
```js
// FORM END

const _step = this.tdcache
  ? (Number(await TiledeskChatbot.currentStep(this.tdcache, this.requestId)) || 0)
  : 0;
AnalyticsClient.track('chatbot.intent_matched', this.projectId, {
  bot_id:      this.botId,
  intent_name: intent_name,
  match_type:  matchContext.match_type || 'explicit',
  confidence:  (answerObj.score != null) ? answerObj.score : null,
  step_count:  _step,
  request_id:  this.requestId || null
});

const context = {
```

- [ ] **Step 1.4: Fix `tybotRoute/tiledeskChatbotPlugs/DirectivesChatbotPlug.js` if conflicted**

**a) Add import after line 65 (`const { DirIteration } = require('./directives/DirIteration');`):**
```js
const { AnalyticsClient } = require('../AnalyticsClient');
```

**b) Add `agent.flow_error` tracking inside `nextDirective()` at line ~183, before the existing `winston.debug` line:**
```js
if (go_on.error) {
  AnalyticsClient.track('chatbot.flow_error', this.context.projectId, {
    bot_id:        this.chatbot?.botId || '',
    error_type:    go_on.error_code || 'runtime_error',
    error_message: go_on.error || null,
    step_count:    go_on.step_count || 0,
    intent_name:   this.context.reply?.attributes?.intent_info?.intent_name || null,
    request_id:    this.context.requestId || null
  });
  winston.debug("(DirectivesChatbotPlug) go_on == false! nextDirective() Stopped!");
  return this.errorMessage(go_on.error);
}
```

- [ ] **Step 1.5: Add conflicted files to staging**

```bash
git add tybotRoute/engine/TiledeskChatbot.js
git add tybotRoute/tiledeskChatbotPlugs/DirectivesChatbotPlug.js
```

- [ ] **Step 1.6: Exit cherry-pick state (only if CHERRY_PICK_HEAD exists)**

```bash
# Check if cherry-pick is still in progress:
ls .git/CHERRY_PICK_HEAD 2>/dev/null && git cherry-pick --quit || echo "No cherry-pick in progress"
```

- [ ] **Step 1.7: Verify staged files are correct**

```bash
git diff --cached --stat
```

Expected output includes: `TiledeskChatbot.js`, `DirectivesChatbotPlug.js`, `DirMoveToAgent.js`, `DirReplaceBotV2.js`, `DirReplaceBotV3.js`, `.gitignore`

---

## Task 2: Cherry-pick `0a066c41` — add AnalyticsClient.js and analytics_test.js

**Files:**
- Create: `tybotRoute/AnalyticsClient.js`
- Create: `tybotRoute/test/analytics_test.js`

- [ ] **Step 2.1: Run cherry-pick**

```bash
git cherry-pick --no-commit 0a066c41
```

No conflicts expected — both files are new.

- [ ] **Step 2.2: Verify new files are staged**

```bash
git status
```

Expected: `tybotRoute/AnalyticsClient.js` and `tybotRoute/test/analytics_test.js` listed as new files.

- [ ] **Step 2.3: Verify AnalyticsClient.js content**

```bash
cat tybotRoute/AnalyticsClient.js
```

Expected: `static track(eventType, projectId, payload)` method that is a no-op when `ANALYTICS_INGEST_URL` is unset, uses `axios.post` with fire-and-forget `.catch(() => {})`, and sets `source_service: 'bot-engine'` (will be updated in Task 3).

---

## Task 3: Cherry-pick `5731f9a7` — rename events and add webhook tracking

**Files:**
- Modify: `tybotRoute/AnalyticsClient.js`
- Modify: `tybotRoute/engine/TiledeskChatbot.js`
- Modify: `tybotRoute/tiledeskChatbotPlugs/DirectivesChatbotPlug.js`
- Modify: `tybotRoute/tiledeskChatbotPlugs/directives/DirMoveToAgent.js`
- Modify: `tybotRoute/tiledeskChatbotPlugs/directives/DirReplaceBotV2.js`
- Modify: `tybotRoute/tiledeskChatbotPlugs/directives/DirReplaceBotV3.js`
- Modify: `tybotRoute/tiledeskChatbotPlugs/directives/DirWebRequest.js`
- Modify: `tybotRoute/tiledeskChatbotPlugs/directives/DirWebRequestV2.js`

- [ ] **Step 3.1: Run cherry-pick**

```bash
git cherry-pick --no-commit 5731f9a7
```

- [ ] **Step 3.2: Check status**

```bash
git status
```

If no conflicts, skip to Step 3.8. If there are conflicts, continue.

- [ ] **Step 3.3: Fix `tybotRoute/AnalyticsClient.js` if conflicted**

Change `source_service` value:
```js
// BEFORE:
source_service: 'bot-engine',
// AFTER:
source_service: 'tiledesk-chatbot',
```

- [ ] **Step 3.4: Fix `tybotRoute/engine/TiledeskChatbot.js` if conflicted**

In the `AnalyticsClient.track(...)` call added in Task 1, rename the event and field:
```js
// BEFORE:
AnalyticsClient.track('chatbot.intent_matched', this.projectId, {
  bot_id:      this.botId,
// AFTER:
AnalyticsClient.track('agent.intent_matched', this.projectId, {
  agent_id:    this.botId,
```

- [ ] **Step 3.5: Fix `tybotRoute/tiledeskChatbotPlugs/DirectivesChatbotPlug.js` if conflicted**

In the `AnalyticsClient.track(...)` call in `nextDirective()`, rename:
```js
// BEFORE:
AnalyticsClient.track('chatbot.flow_error', this.context.projectId, {
  bot_id:        this.chatbot?.botId || '',
// AFTER:
AnalyticsClient.track('agent.flow_error', this.context.projectId, {
  agent_id:      this.chatbot?.botId || '',
```

- [ ] **Step 3.6: Fix `tybotRoute/tiledeskChatbotPlugs/directives/DirMoveToAgent.js` if conflicted**

Replace the analytics track call:
```js
// BEFORE:
AnalyticsClient.track('handover_to_agent', this.context.projectId, {
  id_request:           this.requestId,
  agent_id:             null,
  reason:               'bot_directive',
  department_id:        this.context.departmentId || null,
  waiting_time_seconds: null,
  bot_id:               this.context.chatbot?.botId || null,
  trigger_intent:       this.context.reply?.attributes?.intent_info?.intent_name || null
});
// AFTER:
AnalyticsClient.track('handover_to_human', this.context.projectId, {
  id_request:           this.requestId,
  human_id:             null,
  reason:               'bot_directive',
  department_id:        this.context.departmentId || null,
  waiting_time_seconds: null,
  agent_id:             this.context.chatbot?.botId || null,
  trigger_intent:       this.context.reply?.attributes?.intent_info?.intent_name || null
});
```

- [ ] **Step 3.7: Fix `DirReplaceBotV2.js` and `DirReplaceBotV3.js` if conflicted**

Replace the analytics track call in both files:
```js
// BEFORE:
AnalyticsClient.track('chatbot.bot_switched', this.context.projectId, {
  from_bot_id:  this.context.chatbot?.botId || '',
  to_bot_id:    ...,
// AFTER:
AnalyticsClient.track('agent.bot_switched', this.context.projectId, {
  from_agent_id:  this.context.chatbot?.botId || '',
  to_agent_id:    ...,
```

For `DirWebRequest.js` — add AnalyticsClient import and tracking if not applied. Insert after existing imports:
```js
const { AnalyticsClient } = require('../../AnalyticsClient');
```

And inside `execute()`, wrap the `callback()` call:
```js
this.go(action, () => {
  AnalyticsClient.track('webhook.triggered', this.context.projectId, {
    webhook_id: action.webhookId || action._id || 'unknown',
    agent_id:   this.context.chatbot?.botId || '',
    block_id:   directive.blockId || directive.action?.blockId || 'unknown',
    async:      action.async === true,
    request_id: this.requestId || null
  });
  callback();
});
```

For `DirWebRequestV2.js` — same import, add tracking inside the `.go()` callback before `callback(stop)`:
```js
const { AnalyticsClient } = require('../../AnalyticsClient');
```
```js
this.go(action, (stop) => {
  this.logger.native("[Web Request] Executed");
  AnalyticsClient.track('webhook.triggered', this.context.projectId, {
    webhook_id: action.webhookId || action._id || 'unknown',
    agent_id:   this.context.chatbot?.botId || '',
    block_id:   directive.blockId || directive.action?.blockId || 'unknown',
    async:      action.async === true,
    request_id: this.requestId || null
  });
  callback(stop);
}).catch((err) => {
```

- [ ] **Step 3.8: Stage any manually fixed files and exit cherry-pick state if needed**

```bash
git add tybotRoute/AnalyticsClient.js \
  tybotRoute/engine/TiledeskChatbot.js \
  tybotRoute/tiledeskChatbotPlugs/DirectivesChatbotPlug.js \
  tybotRoute/tiledeskChatbotPlugs/directives/DirMoveToAgent.js \
  tybotRoute/tiledeskChatbotPlugs/directives/DirReplaceBotV2.js \
  tybotRoute/tiledeskChatbotPlugs/directives/DirReplaceBotV3.js \
  tybotRoute/tiledeskChatbotPlugs/directives/DirWebRequest.js \
  tybotRoute/tiledeskChatbotPlugs/directives/DirWebRequestV2.js

ls .git/CHERRY_PICK_HEAD 2>/dev/null && git cherry-pick --quit || echo "No cherry-pick in progress"
```

---

## Task 4: Cherry-pick `005432c3` — add intent_completed and block_executed tracking

**Files:**
- Modify: `tybotRoute/engine/TiledeskChatbot.js`
- Modify: `tybotRoute/index.js`
- Modify: `tybotRoute/tiledeskChatbotPlugs/DirectivesChatbotPlug.js` *(architecture mismatch — manual intervention always required)*

- [ ] **Step 4.1: Run cherry-pick**

```bash
git cherry-pick --no-commit 005432c3
```

- [ ] **Step 4.2: Check status**

```bash
git status
```

`DirectivesChatbotPlug.js` will likely show as conflicted (`UU`) because commit `005432c3` modified an `executeDirective()` method that does not exist on `main`. Fix it manually regardless of what git reports.

- [ ] **Step 4.3: Fix `tybotRoute/engine/TiledeskChatbot.js` if conflicted**

Add two tracking lines immediately before the `AnalyticsClient.track('agent.intent_matched', ...)` call (after the `_step` declaration):

```js
const _step = this.tdcache
  ? (Number(await TiledeskChatbot.currentStep(this.tdcache, this.requestId)) || 0)
  : 0;

// Store intent tracking data for downstream completion/block analytics
this._intentStartTime = Date.now();
this._lastIntentId = answerObj._id?.toString() || '';

AnalyticsClient.track('agent.intent_matched', this.projectId, {
```

- [ ] **Step 4.4: Fix `tybotRoute/index.js` if conflicted**

**a) Add import** after the existing `TiledeskChatbot` require (line ~9):
```js
const { AnalyticsClient } = require('./AnalyticsClient.js');
```

**b) In the `/ext/:botid` route, structured actions branch** (around line ~160): add `directivesSuccess` flag and `agent.intent_completed` event.

Add `intentDuration` + `AnalyticsClient.track(...)` **after** the closing `}` of the catch block (but still inside the `if (reply.actions...)` branch):

```js
  catch (error) {
    winston.error("(tybotRoute) Error while processing actions:", error);
  }

  const intentDuration = chatbot._intentStartTime
    ? Date.now() - chatbot._intentStartTime
    : 0;
  AnalyticsClient.track('agent.intent_completed', projectId, {
    agent_id:    botId,
    intent_id:   chatbot._lastIntentId || '',
    intent_name: reply.intent_id ||
                 reply.attributes?.intent_info?.intent_name ||
                 reply.attributes?.intent_info?.intent_id || 'unknown',
    duration_ms: intentDuration,
    success:     true,
    request_id:  requestId || null
  });
}
```

Do NOT add `directivesSuccess` here — that is added by commit `914acd23` in Task 5.
```

**c) In the text reply branch** (after `apiext.sendSupportMessageExt(...)` call, around line ~201):
```js
apiext.sendSupportMessageExt(reply, projectId, requestId, token, () => {
  winston.verbose("(tybotRoute) sendSupportMessageExt reply sent: ", reply)
});

const intentDuration = chatbot._intentStartTime
  ? Date.now() - chatbot._intentStartTime
  : 0;
AnalyticsClient.track('agent.intent_completed', projectId, {
  agent_id:    botId,
  intent_id:   chatbot._lastIntentId || '',
  intent_name: reply.intent_id ||
               reply.attributes?.intent_info?.intent_name ||
               reply.attributes?.intent_info?.intent_id || 'unknown',
  duration_ms: intentDuration,
  success:     true,
  request_id:  requestId || null
});
```

- [ ] **Step 4.5: Manually adapt `DirectivesChatbotPlug.js` — add block_executed to process() callback**

This is a mandatory manual step. The cherry-pick inserted code into `executeDirective()` which does not exist on `main`. Apply equivalent changes to the `process()` method instead.

Open `tybotRoute/tiledeskChatbotPlugs/DirectivesChatbotPlug.js` and locate the `process()` method (around line 214). Find the `handler.execute(directive, async (stop) => {` block (around line 310).

Replace:
```js
const handler = new HandlerClass(context);

// Esegue l'handler e chiama next se non stop

handler.execute(directive, async (stop) => {
  if (stop) {
    winston.debug(`(DirectivesChatbotPlug) Stopping Actions on:`, directive);
    return this.theend();
  }
  const next_dir = await this.nextDirective(this.directives);
  let process_next_dir = await this.process(next_dir);
  return process_next_dir;
});
```

With:
```js
const handler = new HandlerClass(context);

// Esegue l'handler e chiama next se non stop

const blockStart = Date.now();
handler.execute(directive, async (stop) => {
  AnalyticsClient.track('agent.block_executed', this.context.projectId, {
    agent_id:       this.context.chatbot?.botId || '',
    block_id:       directive.action?.["_tdActionId"] || '',
    block_name:     directive.action?.["_tdActionTitle"] || directive.action?.name || 'unnamed',
    directive_type: directive.name || 'unknown',
    intent_id:      this.context.chatbot?._lastIntentId || '',
    intent_name:    this.context.reply?.attributes?.intent_info?.intent_name || null,
    duration_ms:    Date.now() - blockStart,
    success:        !stop,
    request_id:     this.context.requestId || null
  });
  if (stop) {
    winston.debug(`(DirectivesChatbotPlug) Stopping Actions on:`, directive);
    return this.theend();
  }
  const next_dir = await this.nextDirective(this.directives);
  let process_next_dir = await this.process(next_dir);
  return process_next_dir;
});
```

- [ ] **Step 4.6: Stage files and exit cherry-pick state**

```bash
git add tybotRoute/engine/TiledeskChatbot.js \
  tybotRoute/index.js \
  tybotRoute/tiledeskChatbotPlugs/DirectivesChatbotPlug.js

ls .git/CHERRY_PICK_HEAD 2>/dev/null && git cherry-pick --quit || echo "No cherry-pick in progress"
```

---

## Task 5: Cherry-pick `914acd23` — refine intent_id, action fields, directivesSuccess

**Files:**
- Modify: `tybotRoute/engine/TiledeskChatbot.js`
- Modify: `tybotRoute/index.js`
- Modify: `tybotRoute/tiledeskChatbotPlugs/DirectivesChatbotPlug.js`
- Modify: `tybotRoute/tiledeskChatbotPlugs/directives/DirReplaceBotV2.js`

- [ ] **Step 5.1: Run cherry-pick**

```bash
git cherry-pick --no-commit 914acd23
```

- [ ] **Step 5.2: Check status**

```bash
git status
```

If no conflicts, skip to Step 5.8. Otherwise continue.

- [ ] **Step 5.3: Fix `tybotRoute/engine/TiledeskChatbot.js` if conflicted**

**a) Update `_lastIntentId` to prefer `intent_id` field:**
```js
// BEFORE:
this._lastIntentId = answerObj._id?.toString() || '';
// AFTER:
this._lastIntentId = answerObj.intent_id || answerObj._id?.toString() || '';
```

**b) Add `intent_id` field to the `agent.intent_matched` track call:**
```js
AnalyticsClient.track('agent.intent_matched', this.projectId, {
  agent_id:    this.botId,
  intent_id:   answerObj.intent_id || answerObj._id?.toString() || '',
  intent_name: intent_name,
  match_type:  matchContext.match_type || 'explicit',
  confidence:  (answerObj.score != null) ? answerObj.score : null,
  step_count:  _step,
  request_id:  this.requestId || null
});
```

- [ ] **Step 5.4: Fix `tybotRoute/index.js` if conflicted**

**a) Add `directivesSuccess` flag** — insert `let directivesSuccess = true;` on the line before the `try {` in the structured actions branch, and add `directivesSuccess = false;` as the first line of the `catch` block:

```js
if (reply.actions && reply.actions.length > 0) {
  let directivesSuccess = true;        // ADD THIS LINE
  try {
    // ...existing code (unchanged)...
  }
  catch (error) {
    directivesSuccess = false;         // ADD THIS LINE
    winston.error("(tybotRoute) Error while processing actions:", error);
  }
```

**b) Update the `agent.intent_completed` track call in the structured actions branch to use `directivesSuccess`:**
```js
AnalyticsClient.track('agent.intent_completed', projectId, {
  agent_id:    botId,
  intent_id:   chatbot._lastIntentId || '',
  intent_name: reply.attributes?.intent_info?.intent_name || 'unknown',
  duration_ms: intentDuration,
  success:     directivesSuccess,
  request_id:  requestId || null
});
```

**c) Update the `agent.intent_completed` track call in the text reply branch:**
```js
AnalyticsClient.track('agent.intent_completed', projectId, {
  agent_id:    botId,
  intent_id:   chatbot._lastIntentId || '',
  intent_name: reply.attributes?.intent_info?.intent_name || 'unknown',
  duration_ms: intentDuration,
  success:     true,
  request_id:  requestId || null
});
```

- [ ] **Step 5.5: Fix `tybotRoute/tiledeskChatbotPlugs/DirectivesChatbotPlug.js` if conflicted**

Update both `agent.block_executed` track calls (success and error paths) to use `_tdActionId` and `_tdActionTitle`:
```js
block_id:   directive.action?.["_tdActionId"] || '',
block_name: directive.action?.["_tdActionTitle"] || directive.action?.name || 'unnamed',
```

(These should already be correct from Task 4 Step 4.5 — verify and skip if already present.)

- [ ] **Step 5.6: Fix `tybotRoute/tiledeskChatbotPlugs/directives/DirReplaceBotV2.js` if conflicted**

Update the `agent.bot_switched` track call's `to_agent_id` field:
```js
AnalyticsClient.track('agent.bot_switched', this.context.projectId, {
  from_agent_id:  this.context.chatbot?.botId || '',
  to_agent_id:    botName || resbody?.bot?._id || '',
  intent_name:    this.context.reply?.attributes?.intent_info?.intent_name || null,
  request_id:     this.requestId || null
});
```

- [ ] **Step 5.7: Stage files and exit cherry-pick state**

```bash
git add tybotRoute/engine/TiledeskChatbot.js \
  tybotRoute/index.js \
  tybotRoute/tiledeskChatbotPlugs/DirectivesChatbotPlug.js \
  tybotRoute/tiledeskChatbotPlugs/directives/DirReplaceBotV2.js

ls .git/CHERRY_PICK_HEAD 2>/dev/null && git cherry-pick --quit || echo "No cherry-pick in progress"
```

- [ ] **Step 5.8: Verify final staged diff**

```bash
git diff --cached --stat
```

Expected: all 11 analytics files listed (10 JS files + `.gitignore`)

---

## Task 6: Final staging verification

- [ ] **Step 6.1: Confirm all analytics files are staged**

```bash
git diff --cached --name-only
```

Expected list (all present):
```
.gitignore
tybotRoute/AnalyticsClient.js
tybotRoute/engine/TiledeskChatbot.js
tybotRoute/index.js
tybotRoute/test/analytics_test.js
tybotRoute/tiledeskChatbotPlugs/DirectivesChatbotPlug.js
tybotRoute/tiledeskChatbotPlugs/directives/DirMoveToAgent.js
tybotRoute/tiledeskChatbotPlugs/directives/DirReplaceBotV2.js
tybotRoute/tiledeskChatbotPlugs/directives/DirReplaceBotV3.js
tybotRoute/tiledeskChatbotPlugs/directives/DirWebRequest.js
tybotRoute/tiledeskChatbotPlugs/directives/DirWebRequestV2.js
```

- [ ] **Step 6.2: Confirm no conflict markers remain**

```bash
grep -rn "<<<<<<\|=======\|>>>>>>>" \
  tybotRoute/AnalyticsClient.js \
  tybotRoute/engine/TiledeskChatbot.js \
  tybotRoute/index.js \
  tybotRoute/tiledeskChatbotPlugs/DirectivesChatbotPlug.js \
  tybotRoute/tiledeskChatbotPlugs/directives/DirMoveToAgent.js \
  tybotRoute/tiledeskChatbotPlugs/directives/DirReplaceBotV2.js \
  tybotRoute/tiledeskChatbotPlugs/directives/DirReplaceBotV3.js \
  tybotRoute/tiledeskChatbotPlugs/directives/DirWebRequest.js \
  tybotRoute/tiledeskChatbotPlugs/directives/DirWebRequestV2.js
```

Expected: no output. If any markers found, open the file and resolve them.

- [ ] **Step 6.3: Confirm no unrelated files are staged**

```bash
git status
```

The working tree should be clean (no unstaged modifications) or any unstaged files should be unrelated to analytics. Nothing outside the 11 files listed above should be staged.

- [ ] **Step 6.4: Working tree is ready for developer commit**

The developer can now review `git diff --cached` and run:
```bash
git commit -m "feat: add analytics event tracking (from main_pre)"
```
