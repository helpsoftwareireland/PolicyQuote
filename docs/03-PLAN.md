# Implementation Plan — PolicyQuote

| Item | Value |
|---|---|
| Document | Engineering Implementation Plan |
| Version | 1.0 |
| Date | 2026-11-26 |
| Author role | Software Engineer |
| Inputs | [01-BRD.md](01-BRD.md), [02-ARCHITECTURE.md](02-ARCHITECTURE.md) |
| Time box | 4–5 h (per brief) |

---

## 1. Approach

The build runs **inside out**: KB, then engine, then handler, then UI. The riskiest requirement (KB-driven, table-driven scoring) is proven by tests before any UI exists. Every phase ends with a green test run. The agent (Claude Code) is configured first via `CLAUDE.md`, so every later generation follows project conventions.

## 2. Work breakdown

### Phase 0 — Agent & repo setup (20 min)
| # | Task | Output | Traces to |
|---|---|---|---|
| 0.1 | Write `CLAUDE.md`: stack, folder map, hard constraints (no `any`, no hardcoded scoring, Signals only, no UI libs), commands, definition of done | `CLAUDE.md` | D-5 |
| 0.2 | Write the `add-kb-factor` skill: the KB-only workflow for adding a factor (edit KB → `kb:validate` → add a test → run tests → never touch `engine/`) | `.claude/skills/add-kb-factor/SKILL.md` | D-5, live demo |
| 0.3 | Start `AGENT_LOG.md` and keep appending after each significant interaction | `AGENT_LOG.md` | D-3 |
| 0.4 | `.gitignore`, root README skeleton | — | D-2 |

### Phase 1 — Knowledge Base (20 min)
| # | Task | Traces to |
|---|---|---|
| 1.1 | Create `kb/risk-kb.json` from the brief's example, with the extensions from Architecture §5.3 (`schemaVersion`, band `riskMultiplier`/`label`/`summary`, open-ended top band, compound `flat_high_value`) | KB-01..03, KB-08, KB-10 |

### Phase 2 — Backend core (75 min)
| # | Task | File(s) | Traces to |
|---|---|---|---|
| 2.1 | Scaffold: `package.json` (scripts `build`, `start`, `test`, `test:coverage`, `kb:validate`, `lint:types`), `tsconfig` (strict, `noUncheckedIndexedAccess`), `jest.config` | `backend/*` | OP-01 |
| 2.2 | Request schema (Zod, `.strict()`): customerName, age, propertyType enum, propertyValue, postcode (UK regex, normalised), previousClaims. Export `QuoteInput`, `QUOTE_FIELDS`, `FIELD_TYPES` | `quote/quote.schema.ts` | FR-13, FR-02 |
| 2.3 | KB schema (Zod): leaf discriminated union per operator, recursive `all`/`any`, bands, factors, plus `superRefine` semantic checks. Export inferred types | `kb/kb.schema.ts`, `kb/kb.types.ts` | KB-02..04, KB-07, KB-08 |
| 2.4 | KB loader: resolve path (`KB_PATH`), parse, validate, freeze, cache, mtime hot-reload, last-known-good on failure, `SUPPORTED_SCHEMA_VERSIONS` | `kb/kb.loader.ts` | KB-07, KB-09 |
| 2.5 | Operator registry (typed `OperatorRegistry` mapped type, no switch) | `engine/operators.ts` | KB-04, KB-06 |
| 2.6 | Condition evaluator (recursive, type guards `isAll`/`isAny`) | `engine/condition-evaluator.ts` | KB-06, KB-08 |
| 2.7 | Risk engine: `scoreRisk`, `resolveBand`, `calculatePremium`, `round2`, `buildRiskSummary` | `engine/risk-engine.ts` | FR-14..16, BR-1, BR-2 |
| 2.8 | Quote service: validate → score → band → premium → `QuoteResponse` | `quote/quote.service.ts`, `quote/quote.types.ts` | FR-17..19 |
| 2.9 | Handler: route table (`POST /policy/quote`, `GET /health`, `OPTIONS *`), JSON parse, error mapping, CORS | `handler.ts`, `http/*` | FR-12, FR-20..22 |
| 2.10 | Local server adapter: `node:http` → `APIGatewayProxyEvent` → handler, 10 KB body limit | `server.ts` | OP-01 |
| 2.11 | `scripts/validate-kb.ts` CLI for analysts/CI | `scripts/` | KB-07 |

### Phase 3 — Backend tests (45 min)
| # | Spec | Covers |
|---|---|---|
| 3.1 | `operators.spec.ts` — every operator, true/false/type-mismatch | KB-04 |
| 3.2 | `condition-evaluator.spec.ts` — leaf, `all`, `any`, nested | KB-06, KB-08 |
| 3.3 | `risk-engine.spec.ts` — **STANDARD, ELEVATED, HIGH_RISK** (plus band boundaries 25/26, 60/61), `perOccurrence`, rounding | FR-14..16, NFR-06 |
| 3.4 | `kb.schema.spec.ts` — rejects duplicate ids, band gaps, numeric op on string field, missing params, unsupported schemaVersion | KB-07 |
| 3.5 | `kb-extensibility.spec.ts` — add / change / remove a factor **via KB fixtures only** (e.g. flood-zone `starts_with` EX/PL) and assert the result changes | KB-05, OBJ-2 |
| 3.6 | `kb.loader.spec.ts` — hot reload on change, last-known-good on invalid KB | KB-09 |
| 3.7 | `handler.spec.ts` — 200 quote, 400 validation, 400 malformed JSON, 404, 405, OPTIONS/CORS, `/health` | FR-12..13, FR-17, FR-20..22 |
| 3.8 | `quote.schema.spec.ts` — boundaries and normalisation | FR-02, FR-13 |

### Phase 4 — Frontend (80 min)
| # | Task | Traces to |
|---|---|---|
| 4.1 | Scaffold Angular 21 by hand (later upgraded to 22 with `ng update`) (standalone, zoneless, strict), `angular.json` with `proxy.conf.json`, `npm start` = `ng serve` | OP-02, NFR-05 |
| 4.2 | Models mirroring the API contract (`QuoteRequest`, `QuoteResponse`, `AppliedFactor`, `RiskBand`) | NFR-02 |
| 4.3 | `QuoteApiService` (HttpClient `POST /policy/quote`), error normalisation | FR-12 |
| 4.4 | `QuoteStore`: `loading`, `quoteResult`, `errorMessage` signals, computed values, `requestQuote()` | NFR-04 |
| 4.5 | `RiskBandBadgeComponent` (`input.required<RiskBand>()`, computed label/class) | FR-06, FR-09 |
| 4.6 | `QuoteFormComponent`: typed Reactive Form, validators, inline errors, `toSignal(statusChanges)`, `output()` | FR-01..04 |
| 4.7 | `QuoteResultComponent`: premiums (`currency:'GBP'`), badge, summary, applied factors list, KB version | FR-05..08, FR-11 |
| 4.8 | `QuotePageComponent`: composes the form and result, loading and error banners, `effect()` for the title | FR-10 |
| 4.9 | CSS: tokens, responsive two-column → single column, focus states, reduced motion | NFR-03, NFR-07 |

### Phase 5 — Frontend tests (30 min)
| # | Spec | Covers |
|---|---|---|
| 5.1 | `risk-band-badge.component.spec.ts` — 3 bands → label + class | FR-06, FR-09 |
| 5.2 | `quote.store.spec.ts` — loading toggles, success sets result, error sets message (HttpTestingController) | NFR-04, FR-10 |
| 5.3 | `quote-form.component.spec.ts` — invalid form blocks submit, valid form emits a typed request | FR-01..03 |
| 5.4 | `quote-result.component.spec.ts` — renders premiums and applied factors from the response | FR-05, FR-07, FR-08 |

### Phase 6 — Ops & docs (30 min)
| # | Task | Traces to |
|---|---|---|
| 6.1 | `backend/Dockerfile` (multi-stage, non-root, HEALTHCHECK) + `.dockerignore`. Build context = repo root so the KB is copied | OP-03 |
| 6.2 | `README.md`: < 5 commands, KB location, how to add a factor, test commands | D-2 |
| 6.3 | `SOLUTION.md` ≤ 300 words (checked with a word count) | D-4 |
| 6.4 | Final `AGENT_LOG.md` pass | D-3 |

### Phase 7 — QA (30 min)
| # | Task |
|---|---|
| 7.1 | Clean install and run the full backend suite with coverage. Target ≥ 90 % lines on `engine/` and `kb/` |
| 7.2 | Run the frontend unit suite and a production build (`ng build`) |
| 7.3 | Type-check both projects (`tsc --noEmit`). Grep for `any`, `BehaviorSubject`, `NgModule`, `switch` in the engine |
| 7.4 | Smoke test: start the backend, `curl` one quote per band, `/health`, one invalid request |
| 7.5 | Live-demo rehearsal: add the flood-zone factor via KB only and confirm it shows up without a restart (hot reload) |
| 7.6 | Write `docs/04-TEST-REPORT.md` with the results and the requirement → test traceability |

## 3. Definition of done
- All BRD "Must" requirements are implemented and traced to at least one test or a QA check.
- `npm test` is green in both `backend/` and `frontend/`. `ng build` and `tsc --noEmit` are clean.
- No `any`, no `BehaviorSubject`/`Subject`, no `NgModule`, no UI libraries, no `switch` in the engine.
- The engine diff is empty when adding the flood-zone factor (proven by `kb-extensibility.spec.ts`).
- README, SOLUTION (≤ 300 words), AGENT_LOG and CLAUDE.md are committed.

## 4. Risks & mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Angular toolchain version drift (Node 24, Angular 21) | Build or test failures | Pin Angular and TypeScript to a peer-compatible pair (now Angular 22.3 + TS 6.0). Use the built-in Vitest runner (no Chrome needed) |
| Typing a recursive, operator-specific KB without `any` | Type escapes | Zod discriminated union + `z.infer`. One narrow generic cast in operator dispatch, documented |
| Float rounding in premiums | Off-by-a-penny assertions | `round2` with `Number.EPSILON`. Tests assert exact pennies |
| Score above the last band max | 500 errors | Open-ended top band (`max: null`). The validator enforces it |
| Live-demo restart friction | Slow demo | mtime hot-reload of the KB |

## 5. Live-demo runbook (rehearsed in 7.5)
1. `backend: npm start`, `frontend: npm start`, quote postcode `EX1 1AA` → no flood factor.
2. Prompt the agent: *"Use the add-kb-factor skill: flood zone postcode prefix, +15 if postcode starts with EX or PL."*
3. The agent edits **only** `kb/risk-kb.json` (+ a test fixture/spec), runs `npm run kb:validate` and `npm test`.
4. Re-submit the same quote. `flood_zone_postcode` (+15) appears in "Risk factors applied". The KB version is bumped.
5. `git diff --stat` shows that `backend/src/**` is untouched.
