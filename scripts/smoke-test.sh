#!/usr/bin/env bash
# Smoke-test script для прод. Запускает серию unauthenticated checks к Vercel prod endpoint'ам.
# Использование: bash scripts/smoke-test.sh
# (или передать другой URL: APP_URL=https://staging.example.com bash scripts/smoke-test.sh)

set -e

APP_URL="${APP_URL:-https://beauty-saas-vert.vercel.app}"
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
NC='\033[0m'

pass=0
fail=0
warn=0

check() {
  local name="$1"
  local cmd="$2"
  local expected="$3"
  local actual
  actual=$(eval "$cmd" 2>/dev/null || echo "ERROR")
  if [[ "$actual" == "$expected" ]]; then
    echo -e "${GREEN}✓${NC} $name → $actual"
    pass=$((pass+1))
  else
    echo -e "${RED}✗${NC} $name → got '$actual', expected '$expected'"
    fail=$((fail+1))
  fi
}

warn_check() {
  local name="$1"
  local cmd="$2"
  local actual
  actual=$(eval "$cmd" 2>/dev/null || echo "ERROR")
  echo -e "${YELLOW}?${NC} $name → $actual"
  warn=$((warn+1))
}

echo "🌸 Beauty SaaS smoke test → $APP_URL"
echo ""

echo "── Health & migrations ──"
check "GET /api/health (should be 200 healthy)" \
  "curl -s -o /dev/null -w '%{http_code}' $APP_URL/api/health" \
  "200"
warn_check "Health detail (read body)" \
  "curl -s $APP_URL/api/health | head -c 300"

echo ""
echo "── Public endpoints (slug-fallback) ──"
# /api/tenant требует JWT даже для несуществующего slug (auth-first), это норм.
check "GET /api/tenant?slug=invalid (auth-first → 401)" \
  "curl -s -o /dev/null -w '%{http_code}' '$APP_URL/api/tenant?slug=this-tenant-definitely-does-not-exist'" \
  "401"

echo ""
echo "── Auth-required endpoints (should reject without JWT) ──"
check "GET /api/auth/me (no JWT → 401)" \
  "curl -s -o /dev/null -w '%{http_code}' $APP_URL/api/auth/me" \
  "401"
check "POST /api/ai/chat (no JWT → 401)" \
  "curl -s -o /dev/null -w '%{http_code}' -X POST $APP_URL/api/ai/chat -H 'content-type: application/json' -d '{}'" \
  "401"
check "POST /api/ai/transcribe (no JWT → 401)" \
  "curl -s -o /dev/null -w '%{http_code}' -X POST $APP_URL/api/ai/transcribe" \
  "401"
check "GET /api/ai/chat/status (no JWT → 401)" \
  "curl -s -o /dev/null -w '%{http_code}' '$APP_URL/api/ai/chat/status?id=x'" \
  "401"

echo ""
echo "── Cron endpoints (should require CRON_SECRET) ──"
check "GET /api/cron/complete-appointments (no auth → 401)" \
  "curl -s -o /dev/null -w '%{http_code}' $APP_URL/api/cron/complete-appointments" \
  "401"
check "GET /api/cron/daily-notifications (no auth → 401)" \
  "curl -s -o /dev/null -w '%{http_code}' $APP_URL/api/cron/daily-notifications" \
  "401"

echo ""
echo "── Admin endpoints (should reject without session) ──"
check "GET /api/admin/analytics (no session → 401)" \
  "curl -s -o /dev/null -w '%{http_code}' $APP_URL/api/admin/analytics" \
  "401"
check "GET /api/admin/clients (no session → 401)" \
  "curl -s -o /dev/null -w '%{http_code}' $APP_URL/api/admin/clients" \
  "401"

echo ""
echo "── TMA pages (should render OK) ──"
# TMA root шлёт 307 redirect на slug-aware URL — это норм Next.js поведение
check "GET / (TMA home → redirect)" \
  "curl -s -o /dev/null -w '%{http_code}' $APP_URL/" \
  "307"
check "GET /login (admin login)" \
  "curl -s -o /dev/null -w '%{http_code}' $APP_URL/login" \
  "200"

echo ""
echo "──────────────────────────────"
echo -e "Results: ${GREEN}$pass passed${NC}, ${RED}$fail failed${NC}, ${YELLOW}$warn warnings${NC}"
[[ $fail -gt 0 ]] && exit 1 || exit 0
