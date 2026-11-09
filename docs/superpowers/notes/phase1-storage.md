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
