# QA Test Report — PolicyQuote

| Item | Value |
|---|---|
| Document | QA Test Report |
| Date | 2026-11-27 |
| Author role | QA Engineer |
| Build under test | Working tree (backend 1.0.0, frontend 1.0.0, KB 1.1.0) |
| Environment | Windows 11, Node 24.18, npm 11.16, Angular 22.3, TypeScript 6.0.3, Jest 30, Vitest 4.1 (originally run on Angular 21.2 / TS 5.9, then re-run after the upgrade, §9) |
| Verdict | ✅ **PASS**: all automated suites green, smoke and demo rehearsal passed, 1 defect found and fixed |

## 1. Summary

| Gate | Command | Result |
|---|---|---|
| Backend type-check | `cd backend && npm run lint:types` | ✅ 0 errors |
| Backend unit/integration | `cd backend && npm run test:coverage` | ✅ **183 / 183** passed, 10 suites (143 at first run; see §9a for the review fixes) |
| Backend coverage | (threshold 90 % lines) | ✅ 98.9 % lines · 94.0 % branches. `engine/` **100 %** |
| KB validation | `cd backend && npm run kb:validate` | ✅ KB valid: v1.1.0, 6 factors, 3 contiguous bands |
| Frontend type-check | `cd frontend && npm run lint:types` | ✅ 0 errors (strict templates) |
| Frontend unit/component | `cd frontend && npm test` | ✅ **44 / 44** passed, 5 files (38 at first run, +4 for DEF-3, then net +2 in §9a) |
| Frontend production build | `cd frontend && npm run build` | ✅ 245 kB raw / 67 kB transfer, no warnings |
| HTTP smoke (live server) | `curl` script, §4 | ✅ 11 / 11 checks |
| Live-demo rehearsal | KB-only change on a running server, §5 | ✅ |
| Browser E2E (manual, Chrome) | High-risk preset → quote | ✅ Result rendered, title updated, 0 console errors |
| Static constraint checks | grep, §6 | ✅ |
| Docker image | `docker build -f backend/Dockerfile -t policyquote-api .` (Docker 29.8) | ✅ Built (249 MB). The container serves `/health` and quotes, runs as non-root `node`, and the `HEALTHCHECK` reports `healthy` (§4a) |

## 2. Backend suites (Jest)

| Suite | Tests | Covers |
|---|---|---|
| `risk-engine.spec.ts` | 21 | **All 3 bands end-to-end** (STANDARD £360 / ELEVATED £540 / HIGH_RISK £792), band boundaries 25/26 and 60/61, perOccurrence, occurrenceField, KB order, premium formula, rounding, summary text |
| `operators.spec.ts` | 37 | Every operator: true / false / boundary / wrong-type |
| `condition-evaluator.spec.ts` | 10 | Leaf, `all` truth table, `any` truth table, nested AND/OR |
| `kb.schema.spec.ts` | 27 | 10 structural errors with exact JSON paths. 15 semantic errors (duplicate ids, band gaps/overlaps, open-ended band rules, operator↔field type, perOccurrence rules, unsupported `schemaVersion`) |
| `kb-extensibility.spec.ts` | 8 | **ADD / CHANGE / REMOVE / COMPOUND / RE-BAND via KB data only**, plus a guardrail that scans `src/engine/*.ts` for `switch`, KB literals and factor ids |
| `kb.loader.spec.ts` | 7 | Default path + `KB_PATH`, caching, hot reload, last-known-good on invalid JSON / invalid schema / deleted file, fail-fast with no good KB |
| `quote.schema.spec.ts` | 21 | Postcode normalisation, 12 invalid inputs, strict unknown keys, missing fields |
| `handler.spec.ts` | 11 | Real AWS v1 + v2 event types, 200 contract keys, base64 bodies, trailing slash, 400 validation (field issues), 400 malformed/empty, 404, 405 + `Allow`, 204 preflight, `CORS_ORIGIN`, `/health`, 500 with no internals leaked |
| `kb-live.spec.ts` | 3 | The **real** `kb/risk-kb.json`: valid, 3 bands priced as per brief, compound `flat_high_value` |

## 3. Frontend suites (Vitest via `ng test`)

| Spec | Tests | Covers |
|---|---|---|
| `risk-band-badge.component.spec.ts` | 5 | 3 bands → text + class + aria-label, unknown band → neutral, reactive input change |
| `quote.store.spec.ts` | 12 | Initial state, POST body, `loading` toggling, `computed` values, 400 / 500 / network errors, gateway 502/503/504 → "unreachable", non-JSON fallback, error clearing, latest-request-wins cancellation |
| `quote-form.component.spec.ts` | 13 | All brief fields, radio binding, disabled while invalid/busy, typed + normalised emit, 6 inline error messages, DOM↔form binding, presets |
| `quote-result.component.spec.ts` | 8 | GBP premiums, badge per band, summary, KB factor list (ids, descriptions, ×occurrences, points, total), empty state, breakdown + KB version |
| `quote-page.component.spec.ts` | 4 | Integration: empty → loading → result. `effect()` title. `afterRenderEffect()` focus. Dismissible error banner |

## 4. HTTP smoke test (running server, `npm start`)

| # | Request | Expected | Actual |
|---|---|---|---|
| 1 | `GET /health` | 200, kbVersion | ✅ `{"status":"ok","kbVersion":"1.1.0","schemaVersion":1,"factorCount":6}` |
| 2 | STANDARD profile (postcode `sw1a1aa`) | 0 pts, £360 / £30 | ✅ |
| 3 | ELEVATED profile (2 claims) | 30 pts, £540 / £45 | ✅ |
| 4 | HIGH_RISK profile | 180 pts, £792 / £66, 5 factors | ✅ |
| 5 | Invalid fields | 400 + issues per field | ✅ 5 field issues |
| 6 | Malformed JSON | 400 BAD_REQUEST | ✅ |
| 7 | `GET /nope` | 404 | ✅ |
| 8 | `GET /policy/quote` | 405 | ✅ |
| 9 | `OPTIONS /policy/quote` | 204 | ✅ |
| 10 | 20 KB body | 413 | ❌ → ✅ after fix (DEF-1) |
| 11 | Via Angular proxy `:4200/policy/quote` | 200 | ✅ |

## 4a. Docker image (OP-03)

`docker run -p 3001:3000 policyquote-api`

| Check | Result |
|---|---|
| Multi-stage build (TS compiled in the build stage, `npm prune --omit=dev`) | ✅ |
| `GET /health` | ✅ 200 `{"status":"ok","kbVersion":"1.1.0","schemaVersion":1,"factorCount":6}` |
| `POST /policy/quote` (HIGH_RISK profile) | ✅ 200, £792 / £66 |
| Runs as non-root | ✅ `whoami` → `node` |
| KB location | ✅ `KB_PATH=/app/kb/risk-kb.json`, logged at boot |
| Docker `HEALTHCHECK` | ✅ `healthy` |
| Structured JSON logs | ✅ |

## 5. Live-demo rehearsal (BRD §11 "New factor via KB only")

With the backend running, `flood_zone_postcode` (+15, `starts_with ["EX","PL"]`) was appended to `kb/risk-kb.json` and the version bumped to 1.2.0. **No restart and no code change.**

| Step | Result |
|---|---|
| Quote `EX1 1AA` before | `kb=1.1.0 score=0 factors=[]` |
| Quote after the KB edit | `kb=1.2.0 score=15 factors=[flood_zone_postcode:15]` ✅ |
| KB overwritten with invalid JSON | Still serves `kb=1.2.0` (last-known-good), `/health` OK ✅ |
| KB restored | ✅ |

## 6. Static constraint checks

| Constraint | Check | Result |
|---|---|---|
| No `any` | `grep ': any' / '<any>' / 'as any'` in src + tests | ✅ none |
| No BehaviorSubject/Subject | grep `frontend/src` | ✅ none (one mention in a doc comment) |
| Standalone only | grep `NgModule` | ✅ none |
| Table-driven engine | grep `switch(` in `backend/src` + Jest guardrail | ✅ none |
| No UI libraries | `frontend/package.json` | ✅ none |
| No outbound calls | grep `fetch(` / `http.request` / `axios` in `backend/src` | ✅ none |

## 7. Defects

| ID | Severity | Found by | Description | Fix | Status |
|---|---|---|---|---|---|
| DEF-1 | Medium | Smoke #10 | A body over 10 KB got an **empty reply** instead of 413: `req.destroy()` closed the socket before the response was written | Stop buffering, `req.resume()` to drain, reply 413 with `Connection: close` (`backend/src/server.ts`) | ✅ Fixed, re-tested |
| DEF-2 | Low (test) | Vitest | Form spec read radio `.value` from the DOM. Angular's `RadioControlValueAccessor` binds `[value]` as a directive input, so the DOM value is `"on"` | Spec now asserts labels and the click → form-control binding | ✅ Fixed |
| DEF-3 | Low (UX) | Demo-scenario check (V6) | With the backend down, the user saw the generic "Something went wrong" instead of "cannot reach the service". Behind any proxy or gateway (Angular dev server, CloudFront, API Gateway) a dead backend is a **502/503/504 with a non-JSON body**, but only status 0 was treated as "unreachable" | `toUserMessage` maps 0/502/503/504 to the unreachable message (`frontend/src/app/core/services/quote-api.service.ts`). +4 regression tests | ✅ Fixed. Verified in Chrome against a real dev-proxy 502 |

## 8. Known gaps / residual risk
- The Docker image was verified locally only. It has not been deployed to ECS/Fargate.
- `server.ts` and `cli/validate-kb.ts` are excluded from unit coverage. They are covered by the smoke test and `kb:validate` runs instead.
- No automated browser E2E suite (Playwright). The UI was verified with component tests and a manual Chrome run.

## 9. Regression after upgrade to Angular 22.3 + TypeScript 6.0.3

| Gate | Result |
|---|---|
| `ng update @angular/core@22 @angular/cli@22` migrations | ✅ Ran. 0 changes needed in app code (all components already `OnPush`) |
| Frontend type-check / 38 tests / prod build | ✅ All green with Angular 22's **default** extended diagnostics (migration suppressions removed) |
| Backend on TS 6.0.3: type-check / 143 tests / `kb:validate` | ✅ After switching `moduleResolution` node10 → `node16` (deprecated in TS 6) |
| Docker image rebuilt with TS 6 | ✅ `/health` and quote OK |
| Dev server + proxy + browser quote flow | ✅ ELEVATED quote rendered, title effect OK, no app console errors |

Why not TypeScript 7.0.2 (npm `latest`): Angular 22.3 declares peer `typescript >=6.0 <6.1`, and `ts-jest` declares `<7`.

## 9a. Regression after the critical-review fixes (G2–G9)

See [06-CRITICAL-REVIEW.md](06-CRITICAL-REVIEW.md) for the findings, and AGENT_LOG entries 18–25 for each fix.

| Gate | Result |
|---|---|
| Root `npm test` (backend type-check + Jest, then frontend Vitest) | ✅ **183 / 183** backend (10 suites) · **44 / 44** frontend |
| Coverage | ✅ 98.9 % lines overall · `engine/` 100 % |
| KB-generated cases (`npm run kb:cases`) | ✅ 17 cases from 6 factors. A KB-only flood factor got 3 cases with zero test code |
| Frontend type-check + prod build | ✅ clean |
| Static checks (`any`, `switch`, `Subject`) | ✅ none |
| Root `npm install` + `npm start` (G5) | ✅ API and UI up. Ports free after stop. With 3000 taken: the API fails, the UI is stopped, exit 1 |
| **Browser: stale-KB notice (G4)** | ✅ A typo in a KB copy (missing `}`) → the same quote still priced (£45/£540) **with the notice** "The latest rule-set edit was rejected…", and `/health` showed `kbStatus: "stale"` with the JSON error |
| Form regression guard (G6) | ✅ The second-field touched test **fails** with group-only events and passes with the fix (verified both ways) |
| Docker image rebuilt | ✅ `/health` includes `kbStatus`, quote OK, HEALTHCHECK `healthy` |
| SOLUTION.md | ✅ 295 words |

New defects found while fixing, and resolved in the same round:

| ID | Found by | Description | Fix |
|---|---|---|---|
| DEF-4 | Running `start-all` | `ng serve` also honours the `PORT` env var, so with `PORT` set both services bound the same port | UI started without `PORT` and with `--port 4200`. README warns |
| DEF-5 | Reading `@angular/forms` source | A `FormGroup` emits `touched` only once, so a group-level signal bridge would miss later fields | Per-control `events` merged. Regression test |
| DEF-6 | `tsc` on the new generator | Loose probe typing, which would have needed casts | Probes go through `QuoteRequestSchema`. Unreachable probes reported |

## 10. Requirement traceability (Must items)

| Req | Verified by |
|---|---|
| FR-01..04 | quote-form spec |
| FR-05..08, FR-11 | quote-result spec, browser run |
| FR-09 | risk-band-badge spec |
| FR-10 | quote-page spec, quote.store spec |
| FR-12, FR-20..22 | handler spec, smoke #1–11 |
| FR-13 | quote.schema spec, handler spec, smoke #5 |
| FR-14..16, BR-1, BR-2 | risk-engine spec, kb-live spec |
| FR-17..19 | handler spec (contract keys), risk-engine spec |
| KB-01..04 | kb-live spec, operators spec, `kb:validate` |
| KB-05, KB-06 | kb-extensibility spec (incl. guardrail), demo rehearsal |
| KB-07 | kb.schema spec, kb.loader spec |
| KB-08 | condition-evaluator spec, kb-extensibility COMPOUND, kb-live |
| KB-09 | kb.loader spec, `/health`, demo rehearsal |
| NFR-01..05 | static checks §6 |
| NFR-06 | risk-engine spec (3 bands + boundaries) |
| OP-01, OP-02 | `npm start` both services, proxy smoke #11 |
