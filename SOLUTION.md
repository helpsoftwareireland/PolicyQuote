# SOLUTION

## Architecture
The backend is a pure `handler(event, context)`. `server.ts` (local and Fargate) is a thin `node:http` adapter over it, so Lambda and containers share one code path. The layers are handler → quote service → engine. The engine is pure functions with no I/O. The Angular frontend uses standalone components with a signal store, and `toSignal` bridges the reactive form into signals. RxJS is used only for `HttpClient`.

## KB design
- **Condition AST, interpreted.** Each leaf is `{field, operator, ...}`. `all`/`any` nest for AND/OR. A registry maps operator → function, with no `switch` and no per-factor code. A new factor is data. A new operator is one registry entry.
- **Every number in the KB.** `riskMultiplier`, band labels and summaries live in the bands. A Jest guardrail scans the engine for scoring literals.
- **Fail fast.** A Zod discriminated union per operator gives errors like `factors[2].condition.max`. Semantic checks cover contiguous bands, an open-ended top band (the brief's `999` could be exceeded), operator/field types and unique ids. The schema is typed `ZodType<KnowledgeBase>`, so it can't drift from the interfaces.
- **Versioning.** `version` (content, returned per quote) is separate from `schemaVersion` (engine contract). `KB_PATH` can be a channel of `risk-kb.vN.json` files, and each engine loads the newest schema it supports. A breaking schema is therefore published *alongside* the old one, and no Lambda needs redeploying. Invalid edits keep the last-known-good KB and are flagged on `/health`.

## Agent configuration
`CLAUDE.md` holds the hard rules the agent must self-check (no scoring literals, no `any`, Signals only), a folder map and a definition of done. The `add-kb-factor` skill encodes the live-demo workflow and forbids touching `engine/`.

## With more time
I would add a `kb/scenarios.json` of business-readable input → expected band cases, run in CI on every KB pull request, plus Playwright E2E tests.
