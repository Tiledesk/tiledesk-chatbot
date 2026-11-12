# Execution traceability (Phases 1–4) — moving to stage

Date: 2026-11-12. Status: draft, waiting on the decisions in §6. Nothing has been pushed, tagged or deployed.

## 1. What goes to stage

| Repo | Local branch and head | Stage branch | Dry-run merge into stage branch |
|---|---|---|---|
| tiledesk-chatbot (tybot) | `feature/execution-traceability` b9d31992 (+ docs) | `main_pre` (3.0.7-rc4, +555 commits vs our base 3.0.5) | 3 conflicts: `tybotRoute/index.js`, `DirectivesChatbotPlug.js`, `utils/HttpUtils.js` |
| tiledesk-server | `feature/execution-traceability` adb86f8a | `master-COLLAUDO` (stage runs 3.4.0-rc5, +935 commits vs 3.3.1) | 1 conflict: `app.js` |
| tiledesk-dashboard | `feature/execution-graph` 128f42d69 (traceability + graph + Monitor) | `master-STAGE-NEW` (active, updated 2026-11-12) | merge: 60 conflicts, mostly because `master-STAGE-NEW` lacks the last 49 `master` commits our base sits on. Cherry-picking only our commits: conflicts in the 8 files we touch (`package*.json`, bots-list ×3, navbar, en/it i18n) |
| tiledesk-executions | `feature/execution-traceability` 3f7486c | **no remote yet** (new repo) | — |
| tiledesk-dev-env | `feature/execution-traceability` c4c0ad6 | `main` (local tool, not deployed) | — |
| tiledesk-argo | `stage` | — | new executions block + env on server/chatbot/dashboard |

Also carried along: the two DirMessage fixes (`fix/dirmessage-error-log`, from `main`), already cherry-picked onto the chatbot feature branch.

## 2. How stage deploys today (checked)

- Server, chatbot, dashboard: **pushing any git tag** builds the image (Docker Hub, org secrets in GitHub Actions) **and writes the tag into `tiledesk-argo` branch `stage`** (`update-*-argo` workflows). Argo then syncs stage. So a tag push is a stage deploy, on a stage shared with the team.
- Stage currently runs: server `tiledeskrepo/tiledesk-server-enterprise:3.4.0-rc5` (+ worker 3.4.0-rc5), chatbot `tiledesk/tiledesk-chatbot:3.0.7-rc4`, design studio 3.2.4-rc4.
- Server stage builds are made on a stage branch cut from `master-COLLAUDO` plus the feature (team pattern `features-DDMM/<name>-coll`); past lesson: throwaway stage branches get dropped when someone rebuilds stage from `master-COLLAUDO`, so durable work is merged into `master-COLLAUDO` itself.

## 3. Order (spec §14.1)

1. **executions service** on stage, flags still off elsewhere: repo + image + argo block (api, ingest, jobs), keys and tokens as secrets, ingress route `/executions/api/`.
2. **server** (Activities consumer, refire route, audit verbs): needs `EXECUTIONS_AMQP_URL` to mount; without it, nothing changes.
3. **chatbot** with `EXECUTIONS_ENABLED=false` first: check stage behaves as before; then `true` (records every run on stage).
4. **dashboard** with `EXECUTIONS_BASE_URL` set: Monitor tabs, executions, graph, controls, data access, Audit tab, retention card.
5. Stage e2e: the Phase 1–4 acceptance scenarios that matter most, on a test project (e.g. Lab Nico), with a real browser.

Rollback at any step: flags back off (`EXECUTIONS_ENABLED=false`, unset `EXECUTIONS_AMQP_URL` / `EXECUTIONS_BASE_URL`), or the previous image tag in argo.

## 4. Work before the first push (local)

- **Merges into stage branches**, done on local branches cut from the stage branch (never committing on the shared branch until approved):
  - chatbot: `stage/execution-traceability-pre` = `origin/main_pre` + merge `feature/execution-traceability`; resolve the 3 conflicts keeping pre behaviour + our hooks; run the executions tests (test Redis 6380) and the tybot suite vs the main_pre baseline.
  - server: `features-1211/execution-traceability-coll` = `origin/master-COLLAUDO` + merge feature; resolve `app.js`; run the executions-related mocha files.
  - dashboard: branch from `origin/master-STAGE-NEW` + cherry-pick our commits since `d07380426`; resolve the 8 files; Karma executions/activities specs; `ng build`.
- **executions repo**: CI workflows like the other repos — tag push → build/push image → write tag into argo `stage`; README; version 0.1.0-rc1.
- **argo `stage`** (prepared as a local commit, not pushed): executions templates (3 deployments from one image, service, ingress path, liveness), values block, secrets (`VAULT_KEYS`, `EXECUTIONS_SERVICE_TOKEN`, `EXECUTIONS_STATE_HASH_KEY`) as Application parameters (lesson: hand-set secrets get wiped by forced syncs), env on chatbot (`EXECUTIONS_ENABLED`, `EXECUTIONS_AMQP_URL`, `EXECUTIONS_SEAL_PUBLIC_KEY`, `EXECUTIONS_SEAL_KID`, `EXECUTIONS_STATE_HASH_KEY`, `EXECUTIONS_SERVICE_URL`, `EXECUTIONS_SERVICE_TOKEN`), server (`EXECUTIONS_AMQP_URL`), dashboard (`EXECUTIONS_BASE_URL`), executions (`MONGO_URI` own DB, `AMQP_URL`, `TYBOT_REDIS_URL`, `TILEDESK_API_URL`, `GLOBAL_SECRET_OR_PUB_KEY` + `GLOBAL_SECRET_ALGORITHM` RS256 as stage uses, `EXECUTIONS_CORS_ORIGINS` or same-origin ingress).
- **Stage keys**: a new seal key pair generated for stage only (never the local one), kid `stage-2026-11`.
- **Ingress**: raw path forwarding for `/executions/api/` and refuse encoded `. / \ CR LF` in the path (the dev-env lesson); the internal port 3100 never exposed.
- **Volume check** (spec pre-production gate, light version for stage): `agent.block_executed` rate on stage to size ingest prefetch.

## 5. Known gaps carried to stage (not blockers for testing)

- Nested secrets are masked on read but stored sealed (tybot seal-time strip is a follow-up).
- Retention re-apply: one failing project stops the round; no pending marker.
- Other directives (e.g. `DirReplyV2`) may crash on token-less `/block` runs like DirMessage did.
- Latency at the +1 ms/action limit (Phase 3 measurement, local).

## 6. Decisions (user, 2026-11-12)

- D1 executions repo: created by Claude with `gh` under the Tiledesk org; Docker Hub secrets added by the user/team.
- D2 merge into the pre branches themselves (`main_pre`, `master-COLLAUDO`, `master-STAGE-NEW`; dashboard by cherry-picking our commits), prepared on local branches and pushed only on approval.
- D3 tags: suffix on the team line — server `3.4.0-exec-1`, chatbot `3.0.7-exec-1`, dashboard `2.8.40-exec-1`, executions `0.1.0-rc1` (next candidates `-exec-2`, `-rc2`).
- D4 recording: chatbot deployed with `EXECUTIONS_ENABLED=false` first, checked, then on for all stage together with the dashboard.

- D5 (2026-11-12) executions is a **separate Helm release** (paid add-on model): chart `tiledesk-executions/deploy/helm/tiledesk-executions` (values-stage.yml, values-example.yaml for on-prem), Argo Application `deploy/argocd/executions-stage.yaml` (`tiledesk-executions`, project tiledesk-stage, namespace tiledesk, targetRevision HEAD, automated sync), modelled on the agent runtime. Secrets are parameters on that Application; image tag bumped by hand in values-stage.yml. The main chart only carries an inert `executionsAddon:` block (tiledesk-argo local `stage` commit 6bdbadf9, not pushed). Contract: Secret `tiledesk-executions` keys `EXECUTIONS_SEAL_PUBLIC_KEY`, `EXECUTIONS_SEAL_KID`, `EXECUTIONS_STATE_HASH_KEY`, `EXECUTIONS_SERVICE_TOKEN` (+ `VAULT_KEYS` for the api); internal URL `http://tiledesk-executions-internal:3100`.
- D6 no version commits on the shared pre branches (team numbering kept: dashboard `2.7.27x-stage`, server tags on merges); only our tags carry `-exec-N`.

## 7. Stage state (2026-11-12)

| Component | On stage | From |
|---|---|---|
| executions | `tiledeskrepo/tiledesk-executions:0.1.0-rc1`, Application `tiledesk-executions` Synced/Healthy, keyring loaded | repo `main` 215b2bd, tag 0.1.0-rc1 |
| server + workers | `3.4.0-exec-1` | `master-COLLAUDO` a44a6755 (pushed), tag on it |
| dashboard | `2.8.40-exec-1`, `EXECUTIONS_BASE_URL` empty (UI hidden) | `master-STAGE-NEW` 453e23c99 (pushed) |
| chatbot | `3.0.7-exec-1`, no `EXECUTIONS_*` env (recording off) | `main_pre` 55bdae71 (pushed: our merge + team rc6) |

Argo repo secret `repo-tiledesk-executions` (copy of the runtime's tiledeskDev credential, name set). The executions public healthz path is not routed (in-cluster probes only).

Remaining: push the argo `stage` addon commit (rebased) → flag-off behaviour check on stage → switches one at a time on app `tiledesk` (`executionsAddon.server.amqp=true`, `executionsAddon.chatbot.enabled=true`, `executionsAddon.dashboard.baseUrl=/executions/api`) → stage e2e. Tell the team their pre branches now contain the (inert) traceability work.

Known from the chatbot merge: pre moved block jumps to `/exec` (hooks added there in the merge); pre's new DirInvokeSubAgent/DirReturn have no subagent linking; a superseded voice turn ends as idle/completed, not stopped; pre's streaming HTTP in DirAiPrompt has no abort signal; flag-off differences vs pre: replace-bot bodies carry `reason`, kept `HttpUtils` require fixes a pre ReferenceError on the async `/block` error path. Test env gap: `API_URL` unset made ~50 pre conversation test files fail before-all on both runs. Feature-branch follow-up: `executions_subagent_test.js` load-order failure (RequestService reads API_ENDPOINT at load).

## 8. Questions as first asked

1. **executions repository**: create `Tiledesk/tiledesk-executions` on GitHub (and the Docker Hub image name, e.g. `tiledeskrepo/tiledesk-executions`) — who creates it and adds the CI secrets.
2. **Durable vs throwaway stage branches**: merge our features into `main_pre` / `master-COLLAUDO` / `master-STAGE-NEW` themselves (durable; flags keep it inert for the team) or only into throwaway stage branches.
3. **Tags**: the team owns server `3.4.0-rcN` and chatbot `3.0.7-rcN`; our candidates need their own names.
4. **Flags on stage**: turn recording on for all of stage after the flag-off check, or keep it off until the dashboard is in.
