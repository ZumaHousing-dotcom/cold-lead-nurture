#!/usr/bin/env bash
# End-to-end check of the live webhook with ONE test email you control.
#   LEAD_WEBHOOK_URL=https://<ref>.supabase.co/functions/v1/webhook \
#   WEBHOOK_SECRET=...  TEST_EMAIL=you+zumatest@yourdomain.com  ./scripts/e2e-test.sh
# The secret is read from the environment only; it is never printed.
set -u
: "${LEAD_WEBHOOK_URL:?set LEAD_WEBHOOK_URL}"; : "${WEBHOOK_SECRET:?set WEBHOOK_SECRET}"; : "${TEST_EMAIL:?set TEST_EMAIL}"
pass=0; fail=0
call() { # method, secret-or-empty, json  -> prints "<status> <body>"
  local args=(-sS -m 30 -o /tmp/e2e.body -w "%{http_code}" -X "$1" "$LEAD_WEBHOOK_URL" -H "Content-Type: application/json")
  [ -n "$2" ] && args+=(-H "X-Webhook-Secret: $2"); [ -n "$3" ] && args+=(-d "$3")
  local code; code=$(curl "${args[@]}") || code="000"; echo "$code $(cat /tmp/e2e.body 2>/dev/null)"
}
check() { # name, expected-prefix, actual
  if [[ "$3" == "$2"* ]]; then echo "  PASS  $1"; pass=$((pass+1)); else echo "  FAIL  $1 (expected '$2...', got '$3')"; fail=$((fail+1)); fi
}
echo "1) health";          check "GET /health is 200"             '200 {"status":"ok"}' "$(curl -sS -m 20 -w ' ' -o /tmp/e2e.h -w '%{http_code} ' "$LEAD_WEBHOOK_URL/health" | tr -d '\n')$(cat /tmp/e2e.h)"
echo "2) auth";            check "no secret is rejected"          "401" "$(call POST "" "{\"email\":\"$TEST_EMAIL\"}")"
                           check "wrong secret is rejected"       "401" "$(call POST "wrong" "{\"email\":\"$TEST_EMAIL\"}")"
echo "3) validation";      check "bad email is rejected"          "422" "$(call POST "$WEBHOOK_SECRET" '{"email":"nope"}')"
echo "4) started lead";    check "started lead accepted"          '200 {"ok":true,"status":"started"}' "$(call POST "$WEBHOOK_SECRET" "{\"email\":\"$TEST_EMAIL\",\"first_name\":\"Test\",\"room_interest\":\"Test Room\",\"step\":1}")"
echo "5) completed lead";  check "completed lead accepted"        '200 {"ok":true,"status":"completed"}' "$(call POST "$WEBHOOK_SECRET" "{\"email\":\"$TEST_EMAIL\",\"completed\":true,\"step\":\"completed\"}")"
echo "6) no downgrade";    check "late 'started' stays completed" '200 {"ok":true,"status":"completed"}' "$(call POST "$WEBHOOK_SECRET" "{\"email\":\"$TEST_EMAIL\",\"step\":1}")"
echo; echo "Result: $pass passed, $fail failed"
echo "Now check by hand: Supabase > Table Editor > leads has this email as 'completed'; Mailchimp shows the contact"
echo "with tag form-completed (and form-started/form-abandoned inactive). Delete the test contact/row afterwards (supabase/ops.sql)."
[ "$fail" -eq 0 ]
