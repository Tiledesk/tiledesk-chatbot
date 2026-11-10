# Phase 1 storage

## start (2026-11-09)
```
Mac free GB: 89
Docker free GB: 46
TYPE            TOTAL     ACTIVE    SIZE      RECLAIMABLE
Images          57        11        47.94GB   21.01GB (43%)
Containers      13        3         1.591GB   1.591GB (99%)
Local Volumes   28        11        27.27GB   974.2MB (3%)
Build Cache     0         0         0B        0B
```

## after Task 22 (2026-11-09)
Stack `tiledesk-exec` up with profiles infra,core,exec (images built from the four feature branches).
```
Mac free GB: 78
Docker free GB: 35
TYPE            TOTAL     ACTIVE    SIZE      RECLAIMABLE
Images          63        20        51.31GB   17.85GB (34%)
Containers      25        14        1.593GB   1.591GB (99%)
Local Volumes   32        15        27.59GB   974.2MB (3%)
Build Cache     71        0         9.396GB   7.475GB
```
Ours: `tiledesk-exec-server` 3.6 GB, `tiledesk-exec-chatbot` 2.09 GB, `tiledesk-exec-executions-api` 283 MB
(shared by ingest and jobs), `tiledesk-exec-dashboard` 88 MB; volume `tiledesk-exec_mongo-data` 322 MB.
The build cache was 0 B at the start, so its 9.4 GB come from these builds; the Storage cleanup list
does not cover it (only `docker builder prune` frees it, which the rules forbid without the user).

## after Task 23 (2026-11-09)
Stack `tiledesk-exec` back to flag on, one chatbot. Since Task 22: one chatbot rebuild (`d34d1209`,
image 2d3672e5b206 -> 6fbc2118cbe7, the old one went with its tag), the acceptance runs (about 75
executions), and a temporary `tybot-lb` (nginx:1.27-alpine, already local) and second chatbot replica,
both removed.
```
Mac free GB: 77
Docker free GB: 35
TYPE            TOTAL     ACTIVE    SIZE      RECLAIMABLE
Images          63        20        51.31GB   17.85GB (34%)
Containers      25        14        1.593GB   1.591GB (99%)
Local Volumes   32        15        27.59GB   974.2MB (3%)
Build Cache     72        0         9.65GB    7.729GB
```
Ours: `tiledesk-exec-server` 3.6 GB, `tiledesk-exec-chatbot` 2.09 GB, `tiledesk-exec-executions-api`
283 MB, `tiledesk-exec-dashboard` 88 MB; volume `tiledesk-exec_mongo-data` 327 MB. The chatbot rebuild
added 0.25 GB of build cache (9.40 -> 9.65 GB).

What the Storage cleanup would free (not run; it needs the user's go-ahead):
- `docker compose -p tiledesk-exec down`: the 10 containers (writable layers are small). Add `-v`
  only if the local data should go: `tiledesk-exec_mongo-data` 327 MB, plus the anonymous volumes of
  the stack's Redis (`/data`) and RabbitMQ (`/var/lib/rabbitmq`), which `-v` also removes.
- `docker images 'tiledesk-exec-*' -q | xargs docker rmi`: about 6.06 GB (server 3.6, chatbot 2.09,
  executions 0.28, dashboard 0.09).
- `node_modules` in the four repo folders: about 1.9 GB (server 851 MB, dashboard 740 MB,
  executions 98 MB, chatbot 96 MB + tybotRoute 94 MB). `tiledesk-dashboard/.angular` is already 0 B.
- **Not in the cleanup list:** the BuildKit cache, 9.65 GB, all from this phase's builds (it was 0 B
  at the start). Only `docker builder prune` frees it, which the Storage rules forbid without the user.
  `docker builder prune --filter until=...` would also hit other sessions' cache entries, so it needs a
  decision.
- dev-env `.exec/scale-chatbot.yml` and `.exec/tybot-lb.conf` (Task 23 Step 4, a few hundred bytes,
  gitignored); `.exec/exec.env` and `.exec/seal-private.pem` stay (the keys).

Total that the listed cleanup frees: about 8 GB of images and node_modules, plus 9.65 GB if the build
cache is pruned.

## after e2e re-run (2026-11-10)

After rebuilding the four images on the final code and the re-acceptance (`phase1-acceptance-final.md`).
```
Mac free GB: 74
Docker free GB: 32
TYPE            TOTAL     ACTIVE    SIZE      RECLAIMABLE
Images          63        20        51.31GB   17.85GB (34%)
Containers      25        14        1.593GB   1.591GB (99%)
Local Volumes   32        15        27.61GB   974.2MB (3%)
Build Cache     84        0         12.24GB   10.32GB
```
Ours: `tiledesk-exec-server` 3.6 GB (d70854137a71), `tiledesk-exec-chatbot` 2.09 GB (bb6ba7a19d39),
`tiledesk-exec-executions-api` 283 MB (d137bd14f483), `tiledesk-exec-dashboard` 88 MB (fb5fb9be2b43).
The old ids went with their tags (containerd image store), so the image total did not grow. The four
rebuilds added 2.6 GB of build cache (9.65 -> 12.24 GB), most of it the dashboard's Angular build.
Docker free went 35 -> 32 GB, the Mac 77 -> 74 GB. Nothing was cleaned; nothing was pruned.

New in `.exec/` (gitignored, a few hundred bytes): `cors.yml` (S5 test override, not active).
The cleanup list of the "after Task 23" entry still applies; the build cache is now 12.24 GB.
