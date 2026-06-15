# Analytics Cherry-pick: `main_pre` → `merge/analytics-in-main`

**Date:** 2026-05-27  
**Branch:** `merge/analytics-in-main` (target) ← `main_pre` (source)  
**Goal:** Bring only analytics-related changes from `main_pre` into `merge/analytics-in-main`, leaving all other `main_pre` changes out. All cherry-picks use `--no-commit`; a single final commit is made by the developer.

---

## Commits to Cherry-pick (in order)

| # | Commit | Description |
|---|--------|-------------|
| 1 | `babee9ef` | Wires `AnalyticsClient` into engine + directives; adds `matchContext` to `execIntent()` |
| 2 | `0a066c41` | Adds `AnalyticsClient.js` (new file) + `analytics_test.js` (new file) |
| 3 | `5731f9a7` | Renames events `chatbot.*` → `agent.*`, `bot_id` → `agent_id`, adds `webhook.triggered` |
| 4 | `005432c3` | Adds `agent.intent_completed` + `agent.block_executed` tracking |
| 5 | `914acd23` | Refines: adds `intent_id`, `_tdActionId`/`_tdActionTitle`, `directivesSuccess` flag |

Command for each:
```
git cherry-pick --no-commit <sha>
```

After all 5, fix all conflicts (see below), stage all files, and leave for developer to commit.

---

## Files Affected

### New files (no conflicts)
- `tybotRoute/AnalyticsClient.js`
- `tybotRoute/test/analytics_test.js`

### Clean cherry-picks (small additive changes, no conflict expected)
- `.gitignore` — adds `.idea` entry + fixes trailing newline
- `tybotRoute/tiledeskChatbotPlugs/directives/DirMoveToAgent.js` — import + `handover_to_human` track
- `tybotRoute/tiledeskChatbotPlugs/directives/DirReplaceBotV2.js` — import + `agent.bot_switched` track
- `tybotRoute/tiledeskChatbotPlugs/directives/DirReplaceBotV3.js` — import + `agent.bot_switched` track
- `tybotRoute/tiledeskChatbotPlugs/directives/DirWebRequest.js` — import + `webhook.triggered` track
- `tybotRoute/tiledeskChatbotPlugs/directives/DirWebRequestV2.js` — import + `webhook.triggered` track

### Context conflicts (same functions exist on main, different surrounding context)
- `tybotRoute/engine/TiledeskChatbot.js`
- `tybotRoute/index.js`

### Architecture mismatch (manual adaptation required)
- `tybotRoute/tiledeskChatbotPlugs/DirectivesChatbotPlug.js`

---

## Conflict Resolution Rules

**Golden rule:** Always keep `main`'s version of non-analytics logic. Only insert analytics additions.

### `TiledeskChatbot.js`

1. Add import at top: `const { AnalyticsClient } = require('../AnalyticsClient');`
2. Update `execIntent()` signature: `async execIntent(faq, message, lead, matchContext = {})`
3. Update all `execIntent()` call sites to pass the match type context:
   - locked intent call → `{ match_type: 'locked' }`
   - explicit/parameter call → `{ match_type: 'explicit' }`
   - NLP match → `{ match_type: 'nlp' }`
   - exact match → `{ match_type: 'exact' }`
   - fallback → `{ match_type: 'fallback' }`
4. Inside `execIntent()`, after the FORM END section, add:
   ```js
   this._intentStartTime = Date.now();
   this._lastIntentId = answerObj.intent_id || answerObj._id?.toString() || '';
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
   (Where `_step` is read from `TiledeskChatbot.currentStep(this.tdcache, this.requestId)`)
5. Enrich anomaly detection return objects with `error_code` and `step_count` fields (needed by analytics flow_error event).

### `index.js`

1. Add import: `const { AnalyticsClient } = require('./AnalyticsClient.js');`
2. In the `/ext/:botid` route, structured actions branch (`reply.actions && reply.actions.length > 0`):
   - Add `let directivesSuccess = true;` before the try block
   - Set `directivesSuccess = false;` in the catch block
   - After the try/catch, add `agent.intent_completed` tracking using `chatbot._intentStartTime` and `chatbot._lastIntentId`
3. In the text reply branch (after `sendSupportMessageExt`):
   - Add `agent.intent_completed` tracking (success always `true` here)

### `DirectivesChatbotPlug.js`

1. Add import: `const { AnalyticsClient } = require('../AnalyticsClient');`
2. In `nextDirective()`, inside the `if (go_on.error)` block, add `agent.flow_error` tracking **before** the existing `winston.debug` line.
3. In `process()` (the main directive execution method), adapt `agent.block_executed` to the callback pattern:
   - Add `const blockStart = Date.now();` before `handler.execute(directive, async (stop) => {`
   - Inside the callback, before the `if (stop)` check, emit:
     ```js
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
     ```

---

## Execution Sequence

1. Run cherry-picks 1–5 with `--no-commit`
2. Resolve conflicts in order: `TiledeskChatbot.js` → `index.js` → `DirectivesChatbotPlug.js`
3. Verify clean cherry-picks applied correctly on directive files
4. Stage all analytics files
5. Leave working tree ready for developer's final commit
