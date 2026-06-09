# Checkin App — Plan v3

A simple serverless event check-in app. React frontend on S3+CloudFront, HTTP API + Lambda, DynamoDB. Staff search by name and toggle three flags per attendee.

## Decisions

| Topic | Choice |
|---|---|
| Auth | None (open access) |
| Check-in flow | Search by name, toggle flags |
| IaC | AWS CDK (TypeScript) |
| Frontend hosting | S3 + CloudFront |
| AWS account | `166782860262` |
| AWS region | `us-west-2` |
| Domain | CloudFront default (`*.cloudfront.net`) |
| Multi-event | Yes — `Events` table + `eventId` partition on attendees |
| Ticket model | Everyone eligible; track issuance of game ticket + drink ticket at check-in |
| Offline support | None (decent connectivity confirmed) |

## DynamoDB — two tables

**`Events`**
```
eventId    (PK, string, uuid)
name       (string)
date       (string, ISO)
createdAt  (string, ISO)
```

**`Attendees`** — partition by event so the full guest list returns in one Query
```
eventId            (PK, string)
attendeeId         (SK, string, uuid)
name               (string)
checkedInAt        (string | null)
gameTicketIssued   (bool, default false)
drinkTicketIssued  (bool, default false)
```

On-demand billing. No GSIs.

## API — HTTP API + Lambda (Node 20, ARM64)

| Method | Path | Handler |
|---|---|---|
| GET    | `/events`                                       | `listEvents` |
| POST   | `/events`                                       | `createEvent` |
| GET    | `/events/{eventId}/attendees`                   | `listAttendees` |
| POST   | `/events/{eventId}/attendees`                   | `createAttendee` (walk-ins) |
| POST   | `/events/{eventId}/attendees/{id}/checkin`      | `checkIn` — sets `checkedInAt`, idempotent (conditional write on `attribute_not_exists(checkedInAt)`) |
| PATCH  | `/events/{eventId}/attendees/{id}`              | `updateAttendee` — toggle `gameTicketIssued` / `drinkTicketIssued` |

CORS allows the CloudFront origin only.

## React app (Vite + TypeScript)

- `/` — list events; "New event" form.
- `/events/:eventId` — check-in screen:
  - Search box (substring filter on `name`).
  - Each row: name + three toggles — **Checked in**, **Game ticket**, **Drink ticket**.
  - Counters: "X/Y checked in", "G game tickets issued", "D drink tickets issued".
  - "Hide checked-in" toggle.
  - "Add walk-in" button.
- Optimistic UI updates on mutations; one initial load per event.
- `VITE_API_URL` injected at build time from CDK output.

## Seed script

```
ts-node scripts/seed.ts --csv ./checkin.csv --event-name "May 20 Event" --date 2026-05-20
```

Creates the `Events` row, parses the CSV, inserts one `Attendees` row per line. Ignores the blank `Game ticket` / `drink ticket` columns — they're informational. Idempotent: same `--event-name` + `--date` reuses the existing event.

## CDK stack (single stack)

- 2 DynamoDB tables
- 6 Lambdas, esbuild bundling
- HTTP API + routes + CORS
- S3 bucket (private) + CloudFront distribution + Origin Access Control
- `BucketDeployment` uploads `web/dist/`
- Stack outputs: `ApiUrl`, `SiteUrl`

## Repo layout

```
checkin/
├── infra/                  # CDK app
│   ├── bin/app.ts
│   └── lib/checkin-stack.ts
├── lambdas/
│   ├── events-list/
│   ├── events-create/
│   ├── attendees-list/
│   ├── attendees-create/
│   ├── attendees-checkin/
│   ├── attendees-update/
│   └── shared/dynamo.ts
├── web/                    # Vite + React
├── scripts/seed.ts
├── checkin.csv
├── package.json            # npm workspaces: infra, web, lambdas, scripts
└── README.md
```

## Build & deploy

1. `npm install` at root (workspaces).
2. `cdk deploy` → provisions infra, outputs `ApiUrl`.
3. `VITE_API_URL=<ApiUrl> npm -w web run build`.
4. `cdk deploy` again → `BucketDeployment` syncs `web/dist/` to S3, invalidates CloudFront.
5. `npm run seed -- --csv ./checkin.csv --event-name "..." --date ...`.

Steps 2–4 wrapped in `npm run deploy`.

## Deliberately not in v1

- Authentication
- Per-event ticket eligibility (everyone's eligible)
- Offline queueing
- Custom domain
- Delete / undo for check-ins (manual fix: `PATCH` `checkedInAt` back to `null`)
- Admin dashboard / reports — query DynamoDB directly

---

# Checkin App — v2 Plan: Migration to Docker Compose (self-hosted)

This section describes the migration off AWS serverless to a self-hosted Docker Compose stack. The v1 (AWS) section above is preserved for reference and remains the source of truth until v2 cuts over.

## Goal & motivation

Run the entire app on a single host (laptop for dev, small VM for production) with no cloud lock-in. Faster iteration, no AWS bill, no cold starts, simpler debugging. Tradeoff: we own backups, TLS, and uptime.

## Target architecture

```
┌─────────────────────────────────────────────────┐
│  Docker host (laptop or VM)                     │
│                                                 │
│   ┌──────────┐    ┌──────────┐    ┌──────────┐  │
│   │  caddy   │──▶ │   api    │──▶ │ dynamodb │  │
│   │  :80/443 │    │ Node 20  │    │  local   │  │
│   │ TLS+SPA  │    │  :3000   │    │  :8000   │  │
│   └──────────┘    └──────────┘    └──────────┘  │
│        ▲                              │         │
│        │ static files                 ▼         │
│        │                         /data volume   │
│   web/dist (built once)                         │
└─────────────────────────────────────────────────┘
```

Three services in `docker-compose.yml`:

| Service | Image | Purpose |
|---|---|---|
| `api` | Built from `lambdas/` repackaged as one Express app | All six routes, talks to DynamoDB Local over HTTP |
| `dynamodb` | `amazon/dynamodb-local:latest` | Persistent local DynamoDB; data on a named volume |
| `caddy` | `caddy:2-alpine` | Serves `web/dist`, reverse-proxies `/api/*` to `api`, terminates TLS via Let's Encrypt in production |

## Decisions

| Topic | v1 (AWS) | v2 (Docker) |
|---|---|---|
| Compute | 6 Lambdas | 1 Node container (Express + same handlers) |
| Datastore | DynamoDB on-demand | DynamoDB Local in a container, volume-backed |
| Frontend | S3 + CloudFront | Static files served by Caddy from a shared volume |
| TLS | CloudFront default cert | Caddy auto-TLS (production) or HTTP only (dev) |
| Backups | Point-in-time recovery (not enabled in v1) | Nightly `tar` of the DynamoDB volume to off-host storage |
| Logs | CloudWatch | `docker compose logs` + optional Loki sidecar later |
| Deploy | `cdk deploy` | `docker compose up -d --build` |
| Cost | ~$0–5/mo (low traffic) | Host cost only |

## Code changes

### 1. New `api/` package — one Express app, not six Lambdas

Each Lambda's logic moves into a route handler. The shared `dynamo.ts` is reused; the only change is the DynamoDB client config:

```ts
// api/src/db.ts
const client = new DynamoDBClient({
  region: 'us-west-2',
  endpoint: process.env.DDB_ENDPOINT ?? undefined, // http://dynamodb:8000 in compose
  credentials: process.env.DDB_ENDPOINT
    ? { accessKeyId: 'local', secretAccessKey: 'local' }
    : undefined,
});
```

Route table (1:1 with v1):

```
GET    /api/events
POST   /api/events
GET    /api/events/:eventId/attendees
POST   /api/events/:eventId/attendees
POST   /api/events/:eventId/attendees/:id/checkin
PATCH  /api/events/:eventId/attendees/:id
GET    /api/healthz
```

Note the `/api` prefix — Caddy strips it before forwarding so the handler code stays identical to v1.

### 2. `web/` — only env change

`VITE_API_URL` becomes `/api` (relative). Same origin, no CORS needed.

### 3. `infra/` — retained but unused

Keep the CDK stack so we can fall back to AWS without rewriting. Don't delete it.

### 4. Repo layout (additions)

```
checkin/
├── api/
│   ├── src/server.ts
│   ├── src/routes/*.ts        # ported from lambdas/
│   ├── src/db.ts
│   ├── Dockerfile
│   └── package.json
├── docker/
│   ├── docker-compose.yml
│   ├── docker-compose.prod.yml
│   ├── Caddyfile
│   └── Caddyfile.dev
├── scripts/
│   ├── seed.ts                # already exists; gains DDB_ENDPOINT support
│   ├── backup.sh              # tars the dynamodb volume
│   └── restore.sh
└── (existing dirs unchanged)
```

## `docker-compose.yml` (dev)

```yaml
services:
  dynamodb:
    image: amazon/dynamodb-local:latest
    command: ["-jar", "DynamoDBLocal.jar", "-sharedDb", "-dbPath", "/data"]
    volumes:
      - ddb-data:/data
    ports:
      - "127.0.0.1:8000:8000"

  api:
    build: ../api
    environment:
      DDB_ENDPOINT: http://dynamodb:8000
      EVENTS_TABLE: CheckinEvents
      ATTENDEES_TABLE: CheckinAttendees
      ALLOWED_ORIGIN: http://localhost
      PORT: "3000"
    depends_on: [dynamodb]
    ports:
      - "127.0.0.1:3000:3000"

  caddy:
    image: caddy:2-alpine
    volumes:
      - ./Caddyfile.dev:/etc/caddy/Caddyfile:ro
      - ../web/dist:/srv:ro
    ports:
      - "80:80"
    depends_on: [api]

volumes:
  ddb-data:
```

## `Caddyfile.dev`

```
:80 {
  root * /srv
  handle /api/* {
    uri strip_prefix /api
    reverse_proxy api:3000
  }
  try_files {path} /index.html
  file_server
}
```

For production `Caddyfile`, swap `:80` for the real hostname and Caddy will provision Let's Encrypt automatically.

## Bootstrapping DynamoDB Local

DynamoDB Local doesn't create tables on its own. Add `scripts/init-ddb.ts` that runs once on first `docker compose up`:

```bash
docker compose run --rm api npx tsx /app/scripts/init-ddb.ts
```

It calls `CreateTable` for `CheckinEvents` and `CheckinAttendees` with the exact same key schema as v1. Idempotent (catches `ResourceInUseException`).

## Migration cutover

1. `docker compose up -d` — bring stack up locally, run `init-ddb`.
2. **Data export from AWS:**
   ```bash
   aws dynamodb scan --table-name CheckinEvents > events.json
   aws dynamodb scan --table-name CheckinAttendees > attendees.json
   ```
3. **Import to local:** small `scripts/import.ts` reads those JSON files and BatchWrites into local DynamoDB.
4. Smoke-test against `http://localhost/api/events`.
5. Point a hostname at the Docker host's IP, deploy with `docker-compose.prod.yml`, Caddy issues TLS, done.
6. After 1 week of stable v2: `cdk destroy` to retire AWS resources.

## Production hardening (post-cutover)

- Run Compose under `systemd` with `Restart=always`
- Nightly `scripts/backup.sh` cron: `docker run --rm -v checkin_ddb-data:/data -v $(pwd)/backups:/backup alpine tar czf /backup/ddb-$(date +%F).tar.gz /data`
- Off-host copy via `rclone` / `rsync`
- Resource limits in compose (`mem_limit: 512m` per service)
- Healthchecks (`GET /api/healthz`) + `restart: unless-stopped`

## Out of scope for v2

- Multi-host / clustering — single host is fine for this workload
- Migrating *back* to a managed datastore (Postgres, real DynamoDB) — only if we outgrow a single VM
- Authentication — still none

