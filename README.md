# PolicyQuote: Policy Risk & Premium Engine

A single-page home-insurance quoting tool. Customers enter their details and get an instant premium plus an explainable risk assessment. **All risk rules live in a Knowledge Base file, not in code.**

- **Frontend:** Angular 22 (standalone, zoneless, Signals), hand-written CSS
- **Language:** TypeScript 6.0 (frontend and backend)
- **Backend:** Node.js + TypeScript, Lambda-compatible `handler(event, context)`, Zod, Jest
- **Knowledge Base:** [`kb/risk-kb.json`](kb/risk-kb.json)

## Run it

**Prerequisites:** Node.js **22.22+ or 24.15+** (required by Angular 22) and npm. Docker is optional.

**Quick start: 2 commands from the repository root**
```bash
npm install      # installs backend and frontend (first time only)
npm start        # starts both: API on :3000, UI on :4200, output prefixed [api] / [web]
```
Open http://localhost:4200, click a **Try:** preset (Standard / Elevated / High risk), then **Get my quote**. `Ctrl+C` stops both. If either service fails to start, both are stopped and the command exits non-zero.

**Or run each service on its own** (each starts with a single `npm start`, as the brief requires). Use one terminal per service, starting from the repository root:

| | Backend API → http://localhost:3000 | Frontend → http://localhost:4200 |
|---|---|---|
| Commands | `cd backend` · `npm install` (first time) · `npm start` | `cd frontend` · `npm install` (first time) · `npm start` |
| Ready when | it logs `PolicyQuote API listening` | it prints `Local: http://localhost:4200/` (proxies `/policy` and `/health` to :3000) |

### Alternative: backend in Docker
Run from the repository root, then start the frontend as above:
```bash
docker build -f backend/Dockerfile -t policyquote-api .
docker run -p 3000:3000 policyquote-api
```

### Deploying as an AWS Lambda
Zip `backend/dist`, production dependencies (`npm ci --omit=dev` in `backend/`), `backend/package.json` and `kb/risk-kb.json`. Set handler `dist/handler.handler` and **`KB_PATH=/var/task/kb/risk-kb.json`**: the default KB path assumes the repo layout. A bundled KB is read-only, so to change rules without redeploying, point `KB_PATH` at a KB channel on EFS or `/tmp` instead (see [Architecture §5.7 and §9](docs/02-ARCHITECTURE.md)).

### Quick checks
```bash
curl http://localhost:3000/health
curl -X POST http://localhost:3000/policy/quote -H "Content-Type: application/json" \
  -d '{"customerName":"Sam Patel","age":30,"propertyType":"House","propertyValue":300000,"postcode":"M1 1AE","previousClaims":2}'
```

### Configuration (optional)
| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `3000` | Backend port. If you change it, also update `frontend/proxy.conf.json`. **Don't set it in the frontend's terminal**: `ng serve` also reads `PORT` (the root `npm start` handles this for you) |
| `KB_PATH` | `<repo>/kb/risk-kb.json` | A KB file, **or a KB channel directory** of `risk-kb.v{N}.json` files (the engine loads the newest schema it supports; see [Architecture §5.7](docs/02-ARCHITECTURE.md)) |
| `CORS_ORIGIN` | `*` | Allowed origin for direct (non-proxied) calls |

### Troubleshooting
- **"Cannot reach the quote service" in the UI:** the backend isn't running on port 3000. Start it.
- **"The latest rule-set edit was rejected" in the UI:** your KB edit is invalid, so the last valid rules are still pricing. `GET /health` shows `lastReloadError`, or run `npm run kb:validate`.
- **Port already in use:** stop the other process, or start the backend with another `PORT` and update `frontend/proxy.conf.json`.
- **Backend exits at startup with a `KnowledgeBaseError`:** the KB file is invalid. Run `cd backend && npm run kb:validate` to see the exact JSON path that is wrong.

## The Knowledge Base

**Location:** `kb/risk-kb.json` at the repo root. Override it with the `KB_PATH` env var.

```jsonc
{ "schemaVersion": 1, "version": "1.1.0", "basePremium": 300, "coverageLoadFactor": 1.2,
  "riskBands": { "STANDARD": { "min": 0, "max": 25, "riskMultiplier": 1.0, ... }, ... },
  "factors": [ { "id": "...", "description": "...", "condition": {...}, "points": 15, "perOccurrence": true } ] }
```

- **Operators:** `eq` `neq` `gt` `gte` `lt` `lte` `between` `outside_range` `in` `starts_with`
- **Compound conditions:** `{ "all": [...] }` (AND) and `{ "any": [...] }` (OR), nestable
- **Fields:** `age`, `propertyType`, `propertyValue`, `postcode`, `previousClaims`

**Adding a factor = adding a JSON entry.** For example, flood-zone postcodes:

```json
{ "id": "flood_zone_postcode", "description": "Flood zone postcode area (EX, PL)",
  "condition": { "field": "postcode", "operator": "starts_with", "value": ["EX", "PL"] }, "points": 15 }
```

Then run `cd backend && npm run kb:validate`. The running server **hot-reloads** the KB. If an edit is invalid, it keeps serving the last valid KB and logs the issues.

## API

| Method | Path | |
|---|---|---|
| `POST` | `/policy/quote` | `{ customerName, age, propertyType, propertyValue, postcode, previousClaims }` → `{ monthlyPremium, annualPremium, riskBand, riskScore, riskSummary, coverageDetails, appliedFactors, kbVersion, ... }` |
| `GET` | `/health` | `{ status, kbVersion, schemaVersion, factorCount }` |

Lambda handler: `backend/dist/handler.handler` (API Gateway REST v1 or HTTP API v2).

## Tests

```bash
npm test                         # everything, from the repo root
cd backend  && npm test          # 183 Jest tests: 3 bands, operators, KB schema, extensibility, KB-generated cases, handler
cd backend  && npm run test:coverage
cd frontend && npm test          # 44 Vitest tests: store, form, result, badge, page
```

## Docker (Fargate)

```bash
docker build -f backend/Dockerfile -t policyquote-api .   # run from repo root
docker run -p 3000:3000 policyquote-api
```

## Repository map

| Path | |
|---|---|
| `kb/risk-kb.json` | Knowledge Base |
| `backend/src/engine/` | Operator registry, condition evaluator, risk engine (pure) |
| `backend/src/kb/` | KB schema (Zod) → types, loader with hot reload |
| `backend/src/handler.ts` · `server.ts` | Lambda handler · local/Fargate HTTP adapter |
| `frontend/src/app/` | `core/` (models, API, signal store) · `features/quote/` (components) |
| `docs/` | [BRD](docs/01-BRD.md) · [Architecture](docs/02-ARCHITECTURE.md) · [Plan](docs/03-PLAN.md) · [Test Report](docs/04-TEST-REPORT.md) |
| `CLAUDE.md` · `.claude/skills/add-kb-factor/` | AI agent instructions and skill |
| `AGENT_LOG.md` · `SOLUTION.md` | Agent interaction log · design summary |
