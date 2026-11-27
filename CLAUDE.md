# CLAUDE.md — PolicyQuote agent instructions

You are working on **PolicyQuote**, a home-insurance quoting app: an Angular 22 SPA (TypeScript 6.0), a Node.js Lambda-style API and a JSON Knowledge Base (KB) risk engine. Read `docs/01-BRD.md` (requirement IDs) and `docs/02-ARCHITECTURE.md` (design) before any non-trivial change. Cite requirement IDs in commit messages and in AGENT_LOG entries.

## Map
| Path | What |
|---|---|
| `kb/risk-kb.json` | **The Knowledge Base.** All scoring values live here and nowhere else |
| `backend/src/handler.ts` | Lambda entry `handler(event, context)` |
| `backend/src/server.ts` | Local `node:http` adapter. It only converts HTTP ⇄ API Gateway event |
| `backend/src/kb/` | Zod KB schema (source of truth for KB types), loader/cache |
| `backend/src/engine/` | Operator registry, recursive condition evaluator, risk engine. **Pure, no I/O** |
| `backend/src/quote/` | Request schema (Zod) + orchestration service |
| `frontend/src/app/core/` | API models, `QuoteApiService`, `QuoteStore` (signals) |
| `frontend/src/app/features/quote/` | Page, form, result, `RiskBandBadgeComponent` |

## Hard rules (reject your own output if it breaks one)
1. **No scoring values in code.** Points, thresholds, multipliers, base premium, load factor and band text come from the KB. If you are about to type a number like `15`, `750000` or `1.5` in `backend/src`, stop and put it in the KB.
2. **A factor change is a KB change.** Adding, changing or removing a factor must not touch `backend/src/engine/**`. Use the `add-kb-factor` skill. Only a *new operator* or a *new input field* justifies engine or schema code.
3. **No `switch` and no per-factor `if/else` in the engine.** Dispatch goes through the `OPERATORS` registry. Compound logic goes through `all`/`any`.
4. **No `any`.** Use `unknown` + narrowing, or Zod `z.infer`. A cast is allowed only in `applyOperator`, and it needs a comment.
5. **Angular:** standalone components only (no `NgModule`), `ChangeDetectionStrategy.OnPush`, `input()`/`output()`/`inject()`, `@if`/`@for`. UI state uses **Signals** (`signal`, `computed`, `effect`). Never use `BehaviorSubject`/`Subject` for state. RxJS is only for `HttpClient`.
6. **No UI libraries** (Material, PrimeNG, Bootstrap, Tailwind). Hand-written CSS with custom properties.
7. **Backend is deterministic.** No network calls, no LLM calls, no `Date.now()`/random in pricing.
8. Keep `engine/` free of HTTP, fs and Zod-request concerns (layering per Architecture §5.1).

## Commands
```bash
cd backend  && npm test             # Jest (all bands, operators, KB extensibility, handler)
cd backend  && npm run kb:validate  # validate kb/risk-kb.json against the schema
cd backend  && npm run kb:cases     # print the boundary test cases generated from each KB factor
cd backend  && npm run lint:types   # tsc --noEmit
cd backend  && npm start            # http://localhost:3000 (KB hot-reloads on save)
cd frontend && npm test             # Vitest via ng test
cd frontend && npm start            # http://localhost:4200 (proxies /policy → :3000)
```

## Definition of done for any change
- Tests added or updated, and `npm test` is green in each touched project.
- `npm run kb:validate` passes if the KB was touched. Bump the KB `version` (semver: new factor = minor, weight change = patch, breaking schema change = `schemaVersion`).
- Append an `AGENT_LOG.md` entry: prompt → output → what was changed or rejected → why.

## Style
- Small pure functions, named exports, no default exports.
- Errors: throw typed errors (`ValidationError`, `KnowledgeBaseError`). The handler maps them to HTTP.
- Tests: Arrange/Act/Assert. Build KB fixtures with `buildKb()` from `backend/test/fixtures` rather than mutating the real KB.
- Explain non-obvious decisions in one-line comments. Don't narrate the obvious.
