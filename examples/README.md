# Examples

## `full-flow-validation-bot.json` — the full flow validation bot

One block per Tiledesk directive, wired into menus, so **every directive this
connector dispatches can be exercised by hand** — and, through
`integration/tests/full-flow-validation.js`, automatically.

It covers **all 63 dispatch names over all 56 directive classes** in
`tybotRoute/directives/registry.js`. Two of the 56 cannot be driven by the
automated suite; both are still in the flow so a human can click them against a
real account (see *What the automated suite does not drive*).

### Importing it

The file is the shape the Tiledesk designer imports: `{ name, description,
language, webhook_enabled, type, intents: [...] }`, where each intent carries
`intent_display_name`, `intent_id`, `question`, `answer`, either a text `answer`
or an `actions` list, and an `attributes.position` — where the block sits on the
design studio's canvas.

1. In the Tiledesk dashboard open **Chatbots → Import chatbot** and upload
   `full-flow-validation-bot.json`.
2. Open the new **Full Flow Validation** bot and start a conversation with it,
   or send `/start` in the tester.
3. The entry block lists nine families; each button sends the block command of
   a family menu, and each of those lists its blocks. Every branch that can
   return offers **↩ Main menu** (`/start`).

### How it is laid out on the canvas

`attributes.position` is not decoration. An import whose blocks carry no
position drops all 112 of them on one coordinate, and the canvas is unreadable.

The nine families are tiled **three across, three down** — A B C down the first
column, D E F down the second, G H I down the third — with `start` on the far
left, level with the middle of the first column. Inside a family it reads left
to right, which is the direction the studio draws connectors in (out of a
block's right edge, into the next block's left edge):

```
family menu   →   the blocks of that family   →   their outcome blocks
                                                  (true/false, ok/ko, targets)
```

The canvas is about 7000 × 10500, so **zoom to fit** shows the whole thing and
each family reads as its own group.

Positions are generated, not hand-placed:

```bash
node examples/layout-blocks.js                    # rewrites the bot in place
node examples/layout-blocks.js path/to/other.json
```

It walks the flow's own connectors, so it lays out any Tiledesk export, and it
gives every subtree a vertical region of its own — no two blocks can overlap.
Re-run it after adding blocks. It changes nothing but `attributes.position`.

Every block is also addressable directly: send `/b_condition`, `/g_brevo`,
`/i_close`, … Block ids are stable (`FFV_…`), so `#FFV_C_WEBRESP` and friends
work from other flows too.

### The nine families

| Family | Blocks | Directives |
| --- | --- | --- |
| A · Messaging & replies | `/a_reply` `/a_voice` `/a_replyv2` `/a_message` `/a_randomreply` | `reply`, `dtmf_menu`, `dtmf_form`, `play_prompt`, `audio_record`, `speech_form`, `blind_transfer`, `replyv2`, `message`, `hmessage`, `randomreply` |
| B · Flow control & conditions | `/b_intent` `/b_connect_block` `/b_condition` `/b_condition_v2` `/b_wait` `/b_iteration` `/b_lock` `/b_flow_log` | `intent`, `connect_block`, `jsoncondition`, `jsoncondition2`, `wait`, `iteration`, `lockintent`, `unlockintent`, `flow_log` |
| C · Variables, code & data | `/c_attributes` `/c_delete` `/c_code` `/c_functionvalue` `/c_datatable` `/c_webrequest` `/c_webrequestv2` `/c_webresponse` | `setattribute`, `setattribute-v2`, `assign`, `delete`, `code`, `functionvalue`, `data_table`, `webrequest`, `webrequestv2`, `web_response` |
| D · Capturing user input | `/d_capture_reply` `/d_form` `/d_clear_transcript` | `capture_user_reply`, `form`, `clear_transcript` |
| E · Agents, departments & hours | `/e_online_agents` `/e_online_agents_v2` `/e_open_hours` `/e_department` `/e_helpcenter` | `ifonlineagents`, `ifonlineagentsv2`, `ifopenhours`, `department`, `askhelpcenter` |
| F · Tiledesk platform | `/f_add_tags` `/f_leadupdate` `/f_event` `/f_email` | `add_tags`, `leadupdate`, `firetiledeskevent`, `email` |
| G · CRM & vendor integrations | `/g_brevo` `/g_hubspot` `/g_customerio` `/g_make` `/g_qapla` `/g_whatsapp` `/g_whatsapp_attribute` | `brevo`, `hubspot`, `customerio`, `make`, `qapla`, `send_whatsapp`, `whatsapp_attribute` |
| H · AI | `/h_askgpt` `/h_askgptv2` `/h_ai_prompt` `/h_ai_condition` `/h_gpt_task` `/h_add_kb_content` `/h_gpt_assistant` | `askgpt`, `askgptv2`, `ai_prompt`, `ai_condition`, `gpt_task`, `add_kb_content`, `gpt_assistant` |
| I · Lifecycle | `/i_agent` `/i_unassigned` `/i_removecurrentbot` `/i_replacebot` `/i_replacebotv2` `/i_replacebotv3` `/i_close` | `agent`, `move_to_unassigned`, `removecurrentbot`, `replacebot`, `replacebotv2`, `replacebotv3`, `close` |

### ⚠️ Branches that END the conversation

Every block under **I · Lifecycle** is terminal. After one of them the bot no
longer answers *this* conversation — the request has been handed to a human,
put back in the queue, handed to another bot, or closed. Start a new
conversation to carry on validating.

`/i_agent`, `/i_unassigned`, `/i_removecurrentbot`, `/i_replacebot`,
`/i_replacebotv2`, `/i_replacebotv3`, `/i_close`.

### Branches that need something configured on the project

These blocks call out of Tiledesk. Without their configuration they take their
**false connector** — which is a perfectly good thing to validate, but it is not
the success path.

| Block | Needs |
| --- | --- |
| `/g_brevo` | a **Brevo** integration on the project (note the capital B: that is the integration name the directive asks for) |
| `/g_hubspot` | a **hubspot** integration, or a `token` on the block |
| `/g_customerio` | a **customerio** integration; also replace `formid` (`ffv-form`) with one of your forms |
| `/g_make` | replace the placeholder webhook url with your own Make scenario hook |
| `/g_qapla` | replace `apiKey` with your Qapla key and `trackingNumber` with a real one |
| `/g_whatsapp`, `/g_whatsapp_attribute` | a WhatsApp channel, an approved `hello_world` template, and a real `phone_number` |
| `/h_askgpt` | a v1 knowledge base — replace `kbid` |
| `/h_askgptv2`, `/h_ai_prompt`, `/h_ai_condition`, `/h_gpt_task`, `/h_add_kb_content` | an LLM key on the project (an `openai` integration, a knowledge-base `gptkey`, or the shared key) |
| `/h_gpt_assistant` | a real OpenAI Assistant — replace `assistantId` |
| `/e_department` | a department named **Sales** |
| `/e_helpcenter` | a Help Center workspace with published articles |
| `/f_leadupdate`, `/f_add_tags` (contact half) | a conversation that has a contact attached |
| `/i_replacebot`, `/i_replacebotv2`, `/i_replacebotv3` | a second bot — replace the name / slug / id placeholders |
| `/c_webrequest`, `/c_webrequestv2` | see below |

### The one placeholder you point at your own endpoint

The two Web Request blocks address their endpoint as

```
${VALIDATION_HTTP_ENDPOINT}/ffv/webrequest
${VALIDATION_HTTP_ENDPOINT}/ffv/webrequestv2
```

`${VALIDATION_HTTP_ENDPOINT}` is an ordinary Tiledesk attribute placeholder.
Either set that attribute on the conversation (a `setattribute` block earlier in
your own flow), or edit the two blocks and type your endpoint in. Left unset,
the placeholder is sent verbatim, the request fails and the blocks take their
false connectors.

It is also the single substitution `integration/tests/full-flow-validation.js`
makes when it seeds this file: it points the placeholder at the platform mock.
Nothing else about the file is changed — the automated suite drives *this* file,
not a copy of it.

### `/c_webresponse` is not reached from the menu

`web_response` answers the caller of an incoming webhook, so it only does
anything when the block is invoked over HTTP:

```
POST /block/<project_id>/<bot_id>/FFV_C_WEBRESP     { "token": "<bot token>" }
→ 201 { "validated": true, "block": "c_webresponse" }
```

The menu entry is there so the block is easy to find in the designer.

### Two things the flow does that are not obvious

* **`/d_form`** wraps its `form` action in `lockintent` / `unlockintent`, and
  the form action's `_tdActionId` equals its `action_id`. Both are required:
  `DirForm` locks the *action*, but only a locked *intent* brings the next user
  message back to the block, and the dispatcher skips any action whose
  `_tdActionId` differs from the locked action id — so without the matching id
  the block skips its own form on the second turn and the form never advances.
* **`/c_webrequest`** has two `webrequest` actions. `assignTo` (which assigns
  the whole parsed body) wins over `assignments` (which picks named fields by
  json path) *within one action*, so exercising both needs one action each.

### What the automated suite does not drive

`integration/tests/full-flow-validation.js` drives 54 of the 56 directive
classes end to end against the containerised connector. The two it does not:

* **`gpt_assistant` (`DirAssistant`)** — `OpenAIAssistantsService` builds every
  url from a hardcoded `https://api.openai.com/v1` with no environment
  override, so nothing can point it at the mock. It can only be exercised
  against the real OpenAI Assistants API.
* **`askhelpcenter` (`DirDeflectToHelpCenter`)** — it queries the Help Center
  through `@tiledesk/helpcenter-query-client`, whose response shapes are not
  described anywhere in this repository, so the mock has nothing to ground a
  faithful `allWorkspaces` / `search` answer in. Modelling them would be
  guessing, and a test that passes against a guess proves nothing.

### Running the automated suite

```
docker compose -f docker-compose.integration.yml up --build \
    --abort-on-container-exit --exit-code-from tests
```

or just this suite:

```
docker compose -f docker-compose.integration.yml \
    run --rm tests node integration/tests/full-flow-validation.js
```
