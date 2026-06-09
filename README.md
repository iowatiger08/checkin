# Checkin

Serverless event check-in app — React on S3+CloudFront, HTTP API + Lambda + DynamoDB, deployed with AWS CDK.

See `PLAN.md` for architecture and decisions.

## One-shot deploy

```bash
source .env.local
./deploy.sh
```

That script installs the CDK CLI globally (if missing), installs workspace deps, bootstraps the account/region if needed, deploys the stack, builds the web app against the new API URL, redeploys, and seeds the Iowa Cubs event.

## Manual steps

```bash
source .env.local
npm install     # installs CDK + deps into infra/node_modules (no global needed)
cd infra && npx cdk bootstrap aws://166782860262/us-west-2 && cd ..

# 1st deploy: API + infra (skipping web upload)
npm run deploy:api

# Capture ApiUrl output, then build web:
export VITE_API_URL=<ApiUrl from output>
npm run build:web

# 2nd deploy: uploads web/dist to S3
npm run deploy:web

# Seed
npm run seed -- --csv ./checkin.csv --event-name "Iowa Cubs game for May 22" --date 2026-05-22
```

## Stack outputs

- `ApiUrl` — HTTP API endpoint (CORS-restricted to the CloudFront origin)
- `SiteUrl` — CloudFront URL for the web app

## Local dev

```bash
# Run web against the deployed API
cd web && VITE_API_URL=<ApiUrl> npm run dev
```

## Tear down

```bash
source .env.local
npm run destroy
```
