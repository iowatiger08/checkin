#!/usr/bin/env bash
#
# One-shot deploy for the checkin app.
# Prereqs:
#   - Node 20+ (you have 24, fine)
#   - You've run: source .env.local
#
set -euo pipefail
cd "$(dirname "$0")"

if [[ -z "${AWS_ACCESS_KEY_ID:-}" || -z "${AWS_SECRET_ACCESS_KEY:-}" ]]; then
  echo "AWS creds missing. Run: source .env.local" >&2
  exit 1
fi

ACCOUNT="${CDK_DEFAULT_ACCOUNT:-166782860262}"
REGION="${CDK_DEFAULT_REGION:-us-west-2}"

echo "── installing workspace deps (this also installs CDK locally) ──"
npm install --no-audit --no-fund

# Use the local CDK from infra/node_modules — no global install, no sudo needed.
CDK="npx --no-install cdk"
( cd infra && $CDK --version )

echo "── bootstrapping CDK (idempotent) ──"
( cd infra && npx cdk bootstrap "aws://${ACCOUNT}/${REGION}" )

echo "── deploy pass 1: API + infra (web upload skipped) ──"
( cd infra && npx cdk deploy --require-approval never -c skipWeb=true --outputs-file ./cdk-outputs.json )

API_URL=$(node -e "console.log(require('./infra/cdk-outputs.json').CheckinStack.ApiUrl)")
SITE_URL=$(node -e "console.log(require('./infra/cdk-outputs.json').CheckinStack.SiteUrl)")
echo "ApiUrl=${API_URL}"
echo "SiteUrl=${SITE_URL}"

echo "── building web with VITE_API_URL=${API_URL} ──"
( cd web && VITE_API_URL="${API_URL}" npm run build )

echo "── deploy pass 2: upload web/dist ──"
( cd infra && npx cdk deploy --require-approval never --outputs-file ./cdk-outputs.json )

echo "── seeding Iowa Cubs event ──"
( cd scripts && AWS_DEFAULT_REGION="${REGION}" npx tsx seed.ts \
  --csv ../checkin.csv \
  --event-name "Iowa Cubs game for May 22" \
  --date 2026-05-22 )

echo
echo "✅ Done."
echo "   API:  ${API_URL}"
echo "   Site: ${SITE_URL}"
echo
echo "Open ${SITE_URL} in a browser. The Iowa Cubs event will appear on the home page."
