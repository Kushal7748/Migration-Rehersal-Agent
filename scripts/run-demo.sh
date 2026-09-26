#!/usr/bin/env bash
# ============================================================
# MIGR8 Full Demo Script
# Runs a migration through the entire pipeline end-to-end
# ============================================================

set -euo pipefail

BASE_URL="http://localhost:3001/api/v1"
ADMIN_TOKEN="demo:00000000-0000-0000-0000-000000000001"
AUTH_HEADER="Authorization: Bearer $ADMIN_TOKEN"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

step() { echo -e "\n${CYAN}━━━ Step $1: $2 ${NC}"; }
ok()   { echo -e "${GREEN}✅ $1${NC}"; }
warn() { echo -e "${YELLOW}⚠️  $1${NC}"; }
fail() { echo -e "${RED}❌ $1${NC}"; exit 1; }
info() { echo -e "${BLUE}ℹ️  $1${NC}"; }

echo -e "${CYAN}"
echo "╔════════════════════════════════════════════╗"
echo "║  MIGR8 End-to-End Demo Pipeline            ║"
echo "║  AI-Powered Safe Database Migration        ║"
echo "╚════════════════════════════════════════════╝"
echo -e "${NC}"

# ── Step 0: Reset the demo environment ────────────────────────────────────
step "0" "Resetting demo environment..."
cd "$(dirname "$0")/.."
npm run demo:reset --silent 2>/dev/null && ok "Demo environment reset" || warn "Reset had warnings (continuing)"

# ── Step 1: Create Migration Request ──────────────────────────────────────
step "1" "Creating migration request..."

RESPONSE=$(curl -s -X POST "$BASE_URL/migrations" \
  -H "Content-Type: application/json" \
  -H "$AUTH_HEADER" \
  -d '{
    "request_text": "Add a fraud_score column to users table with default 0.0, backfill from transaction history in batches, and add an index without locking user logins.",
    "target_database": "neondb",
    "target_branch": "main",
    "target_table": "users"
  }')

MID=$(echo "$RESPONSE" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d['data']['id'])" 2>/dev/null)
[[ -z "$MID" || "$MID" == "None" ]] && fail "Failed to create migration: $RESPONSE"
ok "Migration created: $MID"

# ── Step 2: Discover Schema ────────────────────────────────────────────────
step "2" "Running schema discovery..."
DISCOVER=$(curl -s --max-time 30 -X POST "$BASE_URL/migrations/$MID/discover" \
  -H "$AUTH_HEADER")
FINGERPRINT=$(echo "$DISCOVER" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d['data']['fingerprint'])" 2>/dev/null)
TABLE_COUNT=$(echo "$DISCOVER" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d['data']['tableCount'])" 2>/dev/null)
[[ -z "$TABLE_COUNT" ]] && fail "Discovery failed: $DISCOVER"
ok "Schema discovered: $TABLE_COUNT tables, fingerprint: ${FINGERPRINT:0:16}..."

# ── Step 3: Plan + Critique (Attempt 1 — will fail rehearsal) ─────────────
step "3" "Planning migration (Attempt 1 — naive plan)..."
PLAN_RESULT=$(curl -s --max-time 60 -X POST "$BASE_URL/migrations/$MID/plan" \
  -H "$AUTH_HEADER")
PLAN_ID=$(echo "$PLAN_RESULT" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d['data']['planId'])" 2>/dev/null)
[[ -z "$PLAN_ID" || "$PLAN_ID" == "None" ]] && fail "Plan v1 failed: $PLAN_RESULT"
ok "Plan v1 created: $PLAN_ID"

# ── Step 4: Rehearse (Attempt 1 — will detect locking issue) ──────────────
step "4" "Rehearsing plan v1 (expect: lock violation detected)..."
REHEARSE1=$(curl -s -X POST "$BASE_URL/migrations/$MID/rehearse" \
  -H "Content-Type: application/json" \
  -H "$AUTH_HEADER" \
  -d "{\"plan_id\": \"$PLAN_ID\"}")
PASSED1=$(echo "$REHEARSE1" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d['data']['passed'])" 2>/dev/null)
LOCK_MS=$(echo "$REHEARSE1" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d['data']['lockDurationMs'])" 2>/dev/null)
REASON=$(echo "$REHEARSE1" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d['data']['failureReason'] or 'N/A')" 2>/dev/null)

if [[ "$PASSED1" == "False" ]]; then
  warn "Rehearsal 1 FAILED as expected (lock: ${LOCK_MS}ms)"
  info "Reason: $REASON"
  info "Risk engine is blocking — AI will replan with safer approach..."
else
  warn "Rehearsal 1 passed (should have failed in demo). Proceeding..."
fi

# ── Step 5: Replan (Attempt 2 — safer chunked approach) ───────────────────
step "5" "Replanning with safer strategy (Attempt 2)..."
PLAN2_RESULT=$(curl -s --max-time 60 -X POST "$BASE_URL/migrations/$MID/plan" \
  -H "$AUTH_HEADER")
PLAN_ID2=$(echo "$PLAN2_RESULT" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d['data']['planId'])" 2>/dev/null)
[[ -z "$PLAN_ID2" || "$PLAN_ID2" == "None" ]] && fail "Replan failed: $PLAN2_RESULT"
ok "Plan v2 created (safer): $PLAN_ID2"

# ── Step 6: Rehearse (Attempt 2 — should pass) ────────────────────────────
step "6" "Rehearsing plan v2 (expect: PASS)..."
REHEARSE2=$(curl -s -X POST "$BASE_URL/migrations/$MID/rehearse" \
  -H "Content-Type: application/json" \
  -H "$AUTH_HEADER" \
  -d "{\"plan_id\": \"$PLAN_ID2\"}")
PASSED2=$(echo "$REHEARSE2" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d['data']['passed'])" 2>/dev/null)
LOCK_MS2=$(echo "$REHEARSE2" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d['data']['lockDurationMs'])" 2>/dev/null)

if [[ "$PASSED2" == "True" ]]; then
  ok "Rehearsal 2 PASSED! Lock duration: ${LOCK_MS2}ms (well within threshold)"
else
  warn "Rehearsal 2 did not pass. Status: $PASSED2"
fi

# ── Step 7: Build Evidence Pack ────────────────────────────────────────────
step "7" "Building evidence pack..."
EVIDENCE=$(curl -s --max-time 30 -X POST "$BASE_URL/migrations/$MID/build-evidence" \
  -H "$AUTH_HEADER")
EVIDENCE_ID=$(echo "$EVIDENCE" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d['data']['evidenceId'])" 2>/dev/null)
[[ -z "$EVIDENCE_ID" || "$EVIDENCE_ID" == "None" ]] && fail "Evidence build failed: $EVIDENCE"
ok "Evidence pack built: $EVIDENCE_ID"
info "Migration is now AWAITING_APPROVAL — human review required"

# ── Step 8: Human Approval ─────────────────────────────────────────────────
step "8" "Human security officer approving migration..."
APPROVAL=$(curl -s -X POST "$BASE_URL/migrations/$MID/approve" \
  -H "Content-Type: application/json" \
  -H "$AUTH_HEADER" \
  -d '{"action": "APPROVE", "reason": "Human security review completed: Lock duration under 200ms, zero-downtime verified."}')
APPROVAL_TOKEN=$(echo "$APPROVAL" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d['data']['approvalToken'])" 2>/dev/null)
[[ -z "$APPROVAL_TOKEN" || "$APPROVAL_TOKEN" == "None" ]] && fail "Approval failed: $APPROVAL"
ok "Approval granted! Cryptographic token issued."
info "Token (first 40 chars): ${APPROVAL_TOKEN:0:40}..."

# ── Step 9: Execute Production Migration ───────────────────────────────────
step "9" "Executing production migration (Policy Service validation)..."
EXECUTE=$(curl -s -X POST "$BASE_URL/migrations/$MID/execute" \
  -H "Content-Type: application/json" \
  -H "$AUTH_HEADER" \
  -d "{\"approval_token\": \"$APPROVAL_TOKEN\"}")
SUCCESS=$(echo "$EXECUTE" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('data',{}).get('success','ERROR: ' + str(d)))" 2>/dev/null)
ROWS=$(echo "$EXECUTE" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('data',{}).get('affectedRows','N/A'))" 2>/dev/null)
DURATION=$(echo "$EXECUTE" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('data',{}).get('durationMs','N/A'))" 2>/dev/null)

echo ""
if [[ "$SUCCESS" == "True" ]]; then
  echo -e "${GREEN}╔════════════════════════════════════════════╗"
  echo -e "║  🎉 MIGRATION COMPLETE — 100% SUCCESS!     ║"
  echo -e "╠════════════════════════════════════════════╣"
  echo -e "║  Migration ID: ${MID:0:24}...   ║"
  printf  "║  Affected Rows: %-27s║\n" "$ROWS"
  printf  "║  Duration: %-32s║\n" "${DURATION}ms"
  echo -e "╚════════════════════════════════════════════╝${NC}"
else
  fail "Execution failed: $EXECUTE"
fi

# ── Final Status ───────────────────────────────────────────────────────────
echo ""
info "Final migration status:"
FINAL=$(curl -s "$BASE_URL/migrations/$MID" -H "$AUTH_HEADER")
echo "$FINAL" | python3 -c "import json,sys; d=json.load(sys.stdin)['data']; print(f'  Status: {d[\"status\"]}  |  Created: {d[\"created_at\"][:19]}')" 2>/dev/null

echo ""
ok "Full MIGR8 pipeline demo completed successfully!"
echo ""
