#!/usr/bin/env bash
#
# test-e2e.sh — Modo B: test end-to-end del chatbot SOLO via server-V4 (no widget).
#
# Flusso reale Tiledesk:
#   visitatore --(messaggio)--> server-V4 :3000 --(routing su department.id_bot)-->
#   chatbot :3003 (interpreta il JSON del bot da Mongo, esegue le directives) -->
#   --(risposte async via API server)--> server --(GET messages)--> noi le leggiamo.
#
# Prerequisiti attivi: Mongo 27017, Redis 6379, server-V4 :3000, chatbot :3003.
# Dipendenze locali: curl, jq, uuidgen.
#
# Uso:
#   ./test-e2e.sh                       # auto-detect progetto+department, manda "ciao"
#   PROJECT_ID=xxx DEPARTMENT_ID=yyy MSG="ordine" ./test-e2e.sh
#
set -uo pipefail

# ── Config (override via env) ────────────────────────────────────────────────
SERVER="${SERVER:-http://localhost:3000}"
ADMIN_EMAIL="${ADMIN_EMAIL:-admin@tiledesk.com}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-adminadmin}"
PROJECT_ID="${PROJECT_ID:-}"          # se vuoto: primo progetto trovato
DEPARTMENT_ID="${DEPARTMENT_ID:-}"    # se vuoto: primo department con id_bot
MSG="${MSG:-ciao}"
POLL_SECONDS="${POLL_SECONDS:-20}"

ADMIN_AUTH=(-u "${ADMIN_EMAIL}:${ADMIN_PASSWORD}")
hr(){ printf '\n──────── %s ────────\n' "$1"; }
die(){ printf '✘ %s\n' "$1" >&2; exit 1; }

command -v jq >/dev/null      || die "manca 'jq' (brew install jq)"
command -v uuidgen >/dev/null || die "manca 'uuidgen'"

# ── 0. server raggiungibile? ─────────────────────────────────────────────────
hr "0. Server check"
curl -fsS "${SERVER}/" >/dev/null 2>&1 || curl -fsS "${SERVER}/projects" "${ADMIN_AUTH[@]}" >/dev/null 2>&1 \
  || die "server non raggiungibile su ${SERVER} (è avviato? porta giusta?)"
echo "✔ server ${SERVER} risponde"

# ── 1. Progetto ──────────────────────────────────────────────────────────────
hr "1. Progetto"
if [[ -z "${PROJECT_ID}" ]]; then
  PROJECTS_JSON="$(curl -fsS "${SERVER}/projects" "${ADMIN_AUTH[@]}")" \
    || die "GET /projects fallita (credenziali admin? ${ADMIN_EMAIL})"
  echo "${PROJECTS_JSON}" | jq -r '.[]? | "  - \(.id_project._id // ._id)  \(.id_project.name // .name)"' 2>/dev/null
  PROJECT_ID="$(echo "${PROJECTS_JSON}" | jq -r '(.[0].id_project._id // .[0]._id) // empty')"
  [[ -n "${PROJECT_ID}" ]] || die "nessun progetto trovato per ${ADMIN_EMAIL}. Passa PROJECT_ID=... (lo vedi in design-studio)."
fi
echo "✔ PROJECT_ID=${PROJECT_ID}"

# ── 2. Department col bot ────────────────────────────────────────────────────
# Se passi DEPARTMENT_ID a mano NON serve l'auth admin (lo prendi dall'URL di
# design-studio). Altrimenti lo cerco via API admin (servono credenziali valide).
hr "2. Department (routing al bot)"
BOT_ID="(non risolto)"
if [[ -z "${DEPARTMENT_ID}" ]]; then
  DEPTS_JSON="$(curl -fsS "${SERVER}/${PROJECT_ID}/departments" "${ADMIN_AUTH[@]}")" \
    || die "GET departments fallita: le credenziali admin (${ADMIN_EMAIL}) non sono valide. Passa le tue (ADMIN_EMAIL=… ADMIN_PASSWORD=…) OPPURE direttamente DEPARTMENT_ID=… (lo vedi nell'URL/impostazioni di design-studio)."
  echo "${DEPTS_JSON}" | jq -r '.[]? | "  - dept \(._id)  name=\(.name)  id_bot=\(.id_bot // "—")"' 2>/dev/null
  DEPARTMENT_ID="$(echo "${DEPTS_JSON}" | jq -r 'map(select(.id_bot != null)) | .[0]._id // empty')"
  if [[ -z "${DEPARTMENT_ID}" ]]; then
    echo "⚠ Nessun department con id_bot impostato → assegna il bot a un department in design-studio."
    DEPARTMENT_ID="$(echo "${DEPTS_JSON}" | jq -r '.[0]._id // empty')"
    [[ -n "${DEPARTMENT_ID}" ]] || die "nessun department nel progetto."
    echo "  (uso comunque il primo department: ${DEPARTMENT_ID})"
  fi
  BOT_ID="$(echo "${DEPTS_JSON}" | jq -r --arg d "${DEPARTMENT_ID}" '.[] | select(._id==$d) | .id_bot // "—"')"
else
  echo "  DEPARTMENT_ID passato a mano (salto l'auth admin)."
fi
echo "✔ DEPARTMENT_ID=${DEPARTMENT_ID}  (id_bot=${BOT_ID})"

# ── 3. Identità visitatore (guest) ───────────────────────────────────────────
hr "3. Visitatore anonimo (come fa il widget)"
GUEST_JSON="$(curl -fsS -X POST "${SERVER}/auth/signinAnonymously" \
  -H 'Content-Type: application/json' \
  -d "{\"id_project\":\"${PROJECT_ID}\",\"firstname\":\"E2E Tester\"}")" \
  || die "signinAnonymously fallita"
GUEST_TOKEN="$(echo "${GUEST_JSON}" | jq -r '.token // empty')"
GUEST_ID="$(echo "${GUEST_JSON}" | jq -r '.user._id // empty')"
[[ -n "${GUEST_TOKEN}" ]] || die "token guest non ottenuto: ${GUEST_JSON}"
echo "✔ guest=${GUEST_ID}  token=${GUEST_TOKEN:0:18}…"

# ── 4. Apri request + invia messaggio ────────────────────────────────────────
hr "4. Invio messaggio (crea la request e instrada al bot)"
REQUEST_ID="support-group-${PROJECT_ID}-$(uuidgen | tr -d '-' | tr 'A-Z' 'a-z')"
echo "request_id=${REQUEST_ID}"
echo "testo utente: \"${MSG}\""
SEND_JSON="$(curl -fsS -X POST "${SERVER}/${PROJECT_ID}/requests/${REQUEST_ID}/messages" \
  -H "Authorization: ${GUEST_TOKEN}" \
  -H 'Content-Type: application/json' \
  -d "{\"text\":\"${MSG}\",\"senderFullname\":\"E2E Tester\",\"departmentid\":\"${DEPARTMENT_ID}\",\"type\":\"text\"}")" \
  || die "POST messages fallita"
echo "✔ messaggio inviato (server ha accettato)"

# ── 5. Leggi la risposta del bot (polling: la risposta è ASINCRONA) ──────────
hr "5. Risposte (polling ${POLL_SECONDS}s — il bot risponde async)"
SEEN=0
for ((i=1; i<=POLL_SECONDS; i++)); do
  MSGS="$(curl -fsS "${SERVER}/${PROJECT_ID}/requests/${REQUEST_ID}/messages" \
    -H "Authorization: ${GUEST_TOKEN}" 2>/dev/null)"
  COUNT="$(echo "${MSGS}" | jq 'length' 2>/dev/null || echo 0)"
  if [[ "${COUNT}" =~ ^[0-9]+$ ]] && (( COUNT > SEEN )); then
    echo "${MSGS}" | jq -r --argjson from "${SEEN}" \
      '.[$from:][] | "  [\(.sender_fullname // .sender)] \(.text // .metadata.type // "(no text)")"' 2>/dev/null
    SEEN="${COUNT}"
    # un messaggio il cui sender NON è il guest = risposta bot/agent
    if echo "${MSGS}" | jq -e --arg g "${GUEST_ID}" 'any(.[]; .sender != $g)' >/dev/null 2>&1; then
      echo "✔ ricevuta risposta dal bot."
      break
    fi
  fi
  sleep 1
done
(( SEEN > 1 )) || {
  echo "⚠ Nessuna risposta del bot entro ${POLL_SECONDS}s."
  echo "  Controlla: 1) chatbot :3003 attivo (tail -f /tmp/chatbot-v4.log)"
  echo "             2) il department ${DEPARTMENT_ID} ha id_bot valido"
  echo "             3) il bot esiste nel Mongo 'designstudio'"
}

hr "Fine"
echo "request: ${REQUEST_ID}"
echo "Riapri la stessa conversazione (es. risposta a un bottone) rilanciando uno"
echo "POST .../requests/${REQUEST_ID}/messages con un altro testo."
